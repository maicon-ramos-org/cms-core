import { describe, expect, it, vi } from 'vitest'

import { agendaDoSnapshot, JOB_PRESO_DEPOIS_DE_MS, primeiraPassadaNaHora, snapshotDescontoTask } from '../src/cms'

/**
 * A agenda do snapshot diário de desconto (PRD 24 RF8). Quem AGENDA o job é a própria task
 * (`schedule`); quem PASSA o relógio é o site: o `jobs.autoRun` na VPS (Node) ou o Cron
 * Trigger dos Workers chamando `/api/payload-jobs/run?queue=diario`. A prova de que, com a
 * agenda, a VPS roda o job uma vez por dia — nem duas, nem zero — está no teste de
 * integração (`tests/int/agenda-snapshot.int.spec.ts`), que usa o Payload e o Postgres de
 * verdade. Aqui fica o que não precisa de banco.
 */

type Agenda = NonNullable<typeof snapshotDescontoTask.schedule>[number]
type AntesDeAgendar = NonNullable<NonNullable<Agenda['hooks']>['beforeSchedule']>
type Args = Parameters<AntesDeAgendar>[0]

const WAIT_UNTIL_DO_PAYLOAD = new Date('2026-10-02T03:10:00.000Z')

/** O `req` do hook, com o que ele usa do banco: `db.updateJobs` devolve os jobs liberados. */
const reqCom = (liberados: unknown[] = []) => {
  const updateJobs = vi.fn(async () => liberados)
  const warn = vi.fn()
  return { req: { payload: { db: { updateJobs }, logger: { warn } } } as unknown as Args['req'], updateJobs, warn }
}

/** Os argumentos que o `handleSchedules` do Payload 3.88 passa ao hook. */
const args = (
  lastScheduledRun: string | undefined,
  padrao: Awaited<ReturnType<AntesDeAgendar>>,
  req: Args['req'] = reqCom().req,
): Args => ({
  defaultBeforeSchedule: vi.fn(async () => padrao),
  jobStats: lastScheduledRun
    ? { stats: { scheduledRuns: { queues: { diario: { tasks: { snapshotDesconto: { lastScheduledRun } } } } } } }
    : (null as unknown as Args['jobStats']), // o global ainda não existe no primeiro agendamento
  queueable: {
    scheduleConfig: snapshotDescontoTask.schedule![0]!,
    taskConfig: snapshotDescontoTask as Args['queueable']['taskConfig'],
    waitUntil: WAIT_UNTIL_DO_PAYLOAD,
  },
  req,
})

describe('a agenda do snapshotDesconto', () => {
  it('é uma só: 03:10 UTC na fila `diario` — a mesma hora e a mesma fila do autoRun da VPS', () => {
    expect(agendaDoSnapshot).toEqual({ cron: '10 3 * * *', queue: 'diario' })
    expect(snapshotDescontoTask.schedule).toHaveLength(1)
    expect(snapshotDescontoTask.schedule![0]).toMatchObject(agendaDoSnapshot)
  })

  it('passa pelo hook que agenda a primeira passada para já', () => {
    expect(snapshotDescontoTask.schedule![0]!.hooks?.beforeSchedule).toBe(primeiraPassadaNaHora)
  })
})

describe('primeiraPassadaNaHora', () => {
  it('sem passada anterior registrada, agenda para já (sem waitUntil), em vez do próximo 03:10', async () => {
    const a = args(undefined, { input: {}, shouldSchedule: true, waitUntil: WAIT_UNTIL_DO_PAYLOAD })
    const r = await primeiraPassadaNaHora(a)
    expect(a.defaultBeforeSchedule).toHaveBeenCalledOnce()
    expect(r.shouldSchedule).toBe(true)
    expect(r.waitUntil).toBeUndefined()
  })

  it('com passada anterior, devolve exatamente o que o Payload decidiu (o próximo 03:10)', async () => {
    const padrao = { input: {}, shouldSchedule: true, waitUntil: WAIT_UNTIL_DO_PAYLOAD }
    const r = await primeiraPassadaNaHora(args('2026-10-01T03:10:00.250Z', padrao))
    expect(r).toEqual(padrao)
  })

  it('nunca força agendamento: se já há um job pendente na fila, continua sem agendar', async () => {
    const semVaga = { input: {}, shouldSchedule: false, waitUntil: WAIT_UNTIL_DO_PAYLOAD }
    expect((await primeiraPassadaNaHora(args(undefined, semVaga))).shouldSchedule).toBe(false)
    expect((await primeiraPassadaNaHora(args('2026-10-01T03:10:00.250Z', semVaga))).shouldSchedule).toBe(false)
  })
})

/**
 * O job preso. O `defaultBeforeSchedule` do Payload 3.88 conta como pendente todo job agendado
 * sem `completedAt` e sem `error` — inclusive o que está em `processing`. O `runJobs` só pega
 * `processing: false`, e o Payload não tem nada que solte um job que ficou em `processing`
 * porque o processo morreu no meio (deploy às 03:10, requisição do Worker cortada por CPU).
 * Sem o hook soltar esse job, a agenda nunca mais agenda e o snapshot para para sempre.
 */
describe('primeiraPassadaNaHora solta o job preso em processing', () => {
  const AGORA = new Date('2026-10-03T03:10:00.250Z')

  it('antes de o Payload contar os pendentes, marca como erro os jobs do snapshot presos há mais de 6 h', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AGORA)
    try {
      const { req, updateJobs } = reqCom()
      const padrao = { input: {}, shouldSchedule: true, waitUntil: WAIT_UNTIL_DO_PAYLOAD }
      const a = args('2026-10-01T03:10:00.250Z', padrao, req)
      await primeiraPassadaNaHora(a)

      expect(JOB_PRESO_DEPOIS_DE_MS).toBe(6 * 60 * 60 * 1000)
      expect(updateJobs).toHaveBeenCalledOnce()
      // a ordem importa: soltar primeiro, contar depois — senão o preso ainda bloqueia hoje
      expect(updateJobs.mock.invocationCallOrder[0]).toBeLessThan(
        (a.defaultBeforeSchedule as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!,
      )
      const chamada = updateJobs.mock.calls[0] as unknown as [
        { data: Record<string, unknown>; req: unknown; where: { and: Record<string, unknown>[] } },
      ]
      const { data, where } = chamada[0]
      expect(chamada[0].req).toBe(req)
      // só o job desta agenda: a task, a fila, agendado, em processing, não concluído, parado
      expect(where.and).toEqual(
        expect.arrayContaining([
          { taskSlug: { equals: 'snapshotDesconto' } },
          { queue: { equals: 'diario' } },
          { 'meta.scheduled': { equals: true } },
          { processing: { equals: true } },
          { completedAt: { exists: false } },
          { updatedAt: { less_than: new Date(AGORA.getTime() - JOB_PRESO_DEPOIS_DE_MS).toISOString() } },
        ]),
      )
      expect(where.and).toHaveLength(6)
      // sai da contagem do Payload (`error` existe) e da fila do runJobs (hasError, sem processing)
      expect(data).toMatchObject({ hasError: true, processing: false })
      expect(data.error).toMatchObject({ message: expect.stringMatching(/preso/) })
    } finally {
      vi.useRealTimers()
    }
  })

  it('avisa no log quando soltou algum job (nunca em silêncio)', async () => {
    const { req, warn } = reqCom([{ id: 7 }])
    await primeiraPassadaNaHora(args('2026-10-01T03:10:00.250Z', { input: {}, shouldSchedule: true }, req))
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]!.at(-1))).toMatch(/preso/)
  })

  it('sem job preso, não avisa nada', async () => {
    const { req, warn } = reqCom([])
    await primeiraPassadaNaHora(args('2026-10-01T03:10:00.250Z', { input: {}, shouldSchedule: true }, req))
    expect(warn).not.toHaveBeenCalled()
  })
})
