/**
 * O snapshot diário de desconto roda UMA vez por dia — nem duas, nem zero — pelos dois
 * relógios que o site pode ter (PRD 24 RF8):
 *
 * - a VPS (Node): `jobs.autoRun` com `cron: '10 3 * * *'` na fila `diario`, igual à config
 *   do primeiro site da plataforma com `PAYLOAD_RUN_JOBS=1`. O tique é o callback que o
 *   PRÓPRIO Payload monta para o autoRun (`payload.crons[0].trigger()`):
 *   `handleSchedules` da fila e depois `run` da fila;
 * - os Workers: o Cron Trigger chama `GET /api/payload-jobs/run?queue=diario` (a rota do
 *   Payload, que também agenda antes de rodar), com o Bearer do `CRON_SECRET`.
 *
 * Até esta versão a task não tinha `schedule`: o autoRun rodava a fila `diario` todo dia, mas
 * ninguém punha o job nela — em produção, `historico_desconto` só tem o dia 2026-08-28, da
 * execução manual. O primeiro passo abaixo reproduz isso.
 *
 * O relógio é falso (só `Date`); o banco, o Payload e a agenda são os de verdade. Cada
 * execução da task é contada por dia (o handler é embrulhado na config deste teste).
 *
 * Precisa de um Postgres alcançável (`DATABASE_URL`) e das `R2_*` (nenhum teste toca o
 * bucket); no CI os dois estão no job e sem eles o teste REPROVA; fora do CI, pula. O schema
 * sobe por `push` (só nesta config, só neste processo).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cmsCore } from '@maicon-ramos-org/cms-core'
import { getPayload, handleEndpoints, type Payload, type SanitizedConfig, type TaskConfig } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { afiliado, agendaDoSnapshot } from '../../src/cms'

const semAmbiente = !process.env.DATABASE_URL || !process.env.R2_BUCKET
const CHAVE = 'agenda-snapshot'
const CRON_SECRET = 'segredo-do-teste'

it.runIf(semAmbiente && process.env.CI)('no CI, banco e bucket são obrigatórios — sem eles este teste não pode pular calado', () => {
  expect(process.env.DATABASE_URL, 'DATABASE_URL').toBeTruthy()
  expect(process.env.R2_BUCKET, 'R2_BUCKET').toBeTruthy()
})

describe.skipIf(semAmbiente)('a agenda do snapshotDesconto contra o Payload e o Postgres de verdade', () => {
  let pasta: string
  let config: SanitizedConfig
  let payload: Payload
  let tarefa: TaskConfig<'snapshotDesconto'>
  /** o dia (UTC) de cada execução do handler */
  const execucoes: string[] = []
  let falhaNaProxima = false

  const noDia = (dia: string) => execucoes.filter((d) => d === dia).length

  /** O tique do autoRun da VPS: o callback do cron que o Payload montou para `jobs.autoRun`. */
  const tiqueDaVps = async (quando: string) => {
    vi.setSystemTime(new Date(quando))
    expect(payload.crons).toHaveLength(1)
    await payload.crons[0]!.trigger()
  }

  /** O tique do Cron Trigger dos Workers: a rota do Payload, como o Worker de cron do site chama. */
  const tiqueDoWorker = async (quando: string) => {
    vi.setSystemTime(new Date(quando))
    const resposta = await handleEndpoints({
      config,
      payloadInstanceCacheKey: CHAVE,
      request: new Request(`http://teste.local/api/payload-jobs/run?queue=${agendaDoSnapshot.queue}`, {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    })
    expect(resposta.status).toBe(200)
  }

  /** Banco sem jobs e sem registro de agendamento — como um site que acabou de subir. */
  const zera = async () => {
    await payload.db.deleteMany({ collection: 'payload-jobs', where: {} })
    await payload.updateGlobal({ slug: 'payload-jobs-stats', data: { stats: {} } })
    execucoes.length = 0
  }

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-30T12:00:00.000Z'))

    pasta = mkdtempSync(join(tmpdir(), 'app-agenda-'))
    const pushAntes = process.env.PAYLOAD_DB_PUSH
    process.env.PAYLOAD_DB_PUSH = '1'
    config = await cmsCore({
      raiz: pasta,
      plugins: [afiliado()],
      jobs: {
        // o relógio do primeiro site da plataforma na VPS (a config dele com PAYLOAD_RUN_JOBS=1)
        autoRun: [{ cron: '10 3 * * *', limit: 5, queue: 'diario' }],
        shouldAutoRun: () => true,
        // o Cron Trigger dos Workers entra com o Bearer do CRON_SECRET (RF8, `acessoCron`)
        access: { run: ({ req }) => req.headers.get('authorization') === `Bearer ${CRON_SECRET}` },
      },
    })
    process.env.PAYLOAD_DB_PUSH = pushAntes

    // conta cada execução da task de verdade (e deixa simular uma falha)
    const i = config.jobs.tasks!.findIndex((t) => t.slug === 'snapshotDesconto')
    const original = config.jobs.tasks![i]! as TaskConfig<'snapshotDesconto'>
    const handler = original.handler as Extract<TaskConfig<'snapshotDesconto'>['handler'], (...a: never[]) => unknown>
    tarefa = {
      ...original,
      handler: async (args) => {
        execucoes.push(new Date().toISOString().slice(0, 10))
        if (falhaNaProxima) {
          falhaNaProxima = false
          throw new Error('falha simulada (o banco caiu no meio)')
        }
        return handler(args)
      },
    }
    config.jobs.tasks![i] = tarefa as NonNullable<typeof config.jobs.tasks>[number]

    payload = await getPayload({ config, key: CHAVE, cron: true })
    // o relógio de verdade do croner fica parado; quem dá o tique é o teste
    for (const c of payload.crons) c.pause()
    await zera()
  }, 180_000)

  afterAll(async () => {
    await payload?.destroy()
    vi.useRealTimers()
    if (pasta) rmSync(pasta, { recursive: true, force: true })
  })

  it('sem `schedule` na task, o autoRun da VPS não roda nada — o estado de produção até hoje', async () => {
    const agenda = tarefa.schedule
    tarefa.schedule = undefined
    try {
      await tiqueDaVps('2026-09-30T03:10:00.250Z')
      await tiqueDaVps('2026-10-01T03:10:00.250Z')
    } finally {
      tarefa.schedule = agenda
    }
    expect(execucoes).toEqual([])
    await zera()
  }, 60_000)

  it('VPS (autoRun): uma execução por dia, desde o primeiro 03:10 — e nunca duas', async () => {
    // 1º dia depois do deploy: roda já no primeiro tique (sem a primeiraPassadaNaHora, só amanhã)
    await tiqueDaVps('2026-10-01T03:10:00.250Z')
    expect(noDia('2026-10-01')).toBe(1)

    await tiqueDaVps('2026-10-02T03:10:00.250Z')
    expect(noDia('2026-10-02')).toBe(1)

    // um segundo tique no mesmo dia (o processo reiniciou, o cron foi montado de novo): nada
    await tiqueDaVps('2026-10-02T03:10:30.000Z')
    expect(noDia('2026-10-02')).toBe(1)

    // e o job que esse segundo tique agendou é o de amanhã: roda uma vez, no dia certo
    await tiqueDaVps('2026-10-03T03:10:00.250Z')
    expect(noDia('2026-10-03')).toBe(1)

    // o handler falha num dia: uma tentativa nesse dia...
    falhaNaProxima = true
    await tiqueDaVps('2026-10-04T03:10:00.250Z')
    expect(noDia('2026-10-04')).toBe(1)
    // ...e no dia seguinte UMA execução (a nova tentativa OU o job do dia, nunca os dois)
    await tiqueDaVps('2026-10-05T03:10:00.250Z')
    expect(noDia('2026-10-05')).toBe(1)
    await tiqueDaVps('2026-10-06T03:10:00.250Z')
    expect(noDia('2026-10-06')).toBe(1)

    // a VPS esteve fora no 03:10 do dia 7: o dia 8 roda uma vez (não tenta recuperar o 7)
    await tiqueDaVps('2026-10-08T03:10:00.250Z')
    expect(noDia('2026-10-07')).toBe(0)
    expect(noDia('2026-10-08')).toBe(1)
    await tiqueDaVps('2026-10-09T03:10:00.250Z')
    expect(noDia('2026-10-09')).toBe(1)

    expect(execucoes).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-08',
      '2026-10-09',
    ])
  }, 60_000)

  it('Workers (Cron Trigger → /api/payload-jobs/run?queue=diario): a mesma regra, e o primeiro tique já roda', async () => {
    await zera()
    // o aceite da RF8: o primeiro tique num banco que nunca agendou nada já roda o snapshot
    await tiqueDoWorker('2026-10-11T03:10:02.000Z')
    expect(noDia('2026-10-11')).toBe(1)
    // repetir a chamada no mesmo dia (alguém rodou o curl de novo) não roda outra vez
    await tiqueDoWorker('2026-10-11T03:15:00.000Z')
    expect(noDia('2026-10-11')).toBe(1)

    await tiqueDoWorker('2026-10-12T03:10:02.000Z')
    expect(noDia('2026-10-12')).toBe(1)
  }, 60_000)

  it('VPS e Workers no mesmo banco no mesmo dia (a virada): uma execução, não duas', async () => {
    await tiqueDaVps('2026-10-13T03:10:00.250Z')
    await tiqueDoWorker('2026-10-13T03:10:02.000Z')
    expect(noDia('2026-10-13')).toBe(1)

    await tiqueDoWorker('2026-10-14T03:10:01.000Z')
    await tiqueDaVps('2026-10-14T03:10:05.000Z')
    expect(noDia('2026-10-14')).toBe(1)
  }, 60_000)

  it('o job que ficou preso em processing (o processo morreu no meio) não trava a agenda: no dia seguinte volta a rodar uma vez', async () => {
    await zera()
    await tiqueDaVps('2026-10-20T03:10:00.250Z')
    expect(noDia('2026-10-20')).toBe(1)

    // dia 21, 03:10: a agenda põe o job do dia na fila, o runJobs o pega (processing: true) e o
    // processo morre antes de terminar — deploy ou reinício da VPS, ou a requisição do Worker
    // cortada por CPU
    vi.setSystemTime(new Date('2026-10-21T03:10:00.250Z'))
    await payload.jobs.handleSchedules({ queue: agendaDoSnapshot.queue })
    const pegos = await payload.db.updateJobs({
      where: {
        and: [
          { queue: { equals: agendaDoSnapshot.queue } },
          { taskSlug: { equals: 'snapshotDesconto' } },
          { completedAt: { exists: false } },
        ],
      },
      data: { processing: true },
    })
    expect(pegos).toHaveLength(1)
    const preso = pegos![0]!.id

    // minutos depois, outro tique no mesmo dia: o job pode estar rodando de verdade — não mexe
    await tiqueDoWorker('2026-10-21T03:15:00.000Z')
    expect(noDia('2026-10-21')).toBe(0)
    expect(await payload.findByID({ collection: 'payload-jobs', id: preso, depth: 0 })).toMatchObject({
      processing: true,
    })

    // nos dias seguintes o preso é solto e o snapshot volta: uma vez por dia
    await tiqueDaVps('2026-10-22T03:10:00.250Z')
    expect(noDia('2026-10-22')).toBe(1)
    await tiqueDaVps('2026-10-23T03:10:00.250Z')
    expect(noDia('2026-10-23')).toBe(1)
    await tiqueDoWorker('2026-10-24T03:10:02.000Z')
    expect(noDia('2026-10-24')).toBe(1)
    expect(execucoes).toEqual(['2026-10-20', '2026-10-22', '2026-10-23', '2026-10-24'])

    // o preso não sumiu: ficou como erro, com o motivo, para quem olhar o admin
    const depois = await payload.findByID({ collection: 'payload-jobs', id: preso, depth: 0 })
    expect(depois).toMatchObject({ processing: false, hasError: true })
    expect(JSON.stringify(depois.error)).toMatch(/preso/)
  }, 60_000)
})
