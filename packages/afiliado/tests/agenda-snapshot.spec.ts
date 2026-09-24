import { describe, expect, it, vi } from 'vitest'

import { agendaDoSnapshot, primeiraPassadaNaHora, snapshotDescontoTask } from '../src/cms'

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

/** Os argumentos que o `handleSchedules` do Payload 3.88 passa ao hook. */
const args = (lastScheduledRun: string | undefined, padrao: Awaited<ReturnType<AntesDeAgendar>>): Args => ({
  defaultBeforeSchedule: vi.fn(async () => padrao),
  jobStats: lastScheduledRun
    ? { stats: { scheduledRuns: { queues: { diario: { tasks: { snapshotDesconto: { lastScheduledRun } } } } } } }
    : (null as unknown as Args['jobStats']), // o global ainda não existe no primeiro agendamento
  queueable: {
    scheduleConfig: snapshotDescontoTask.schedule![0]!,
    taskConfig: snapshotDescontoTask as Args['queueable']['taskConfig'],
    waitUntil: WAIT_UNTIL_DO_PAYLOAD,
  },
  req: {} as Args['req'],
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
