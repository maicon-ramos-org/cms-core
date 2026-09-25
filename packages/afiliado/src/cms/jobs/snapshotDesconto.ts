import type { Payload, TaskConfig } from 'payload'

import { compor, type CupomParaCompor, type DescontoDaLoja } from '@maicon-ramos-org/desconto'

/*
 * O recorte de `ofertas` e `cupons` que a tarefa lê. O tipo completo sai do
 * `payload-types.ts` do SITE, que um pacote não enxerga (PRD 17 RF1c).
 */
type Cupon = CupomParaCompor & { codigo?: string | null }
interface Oferta {
  id: number | string
  slug?: string | null
  tenant?: number | string | { id: number | string } | null
  preco?: { valor?: number | null } | null
  cupom?: number | string | Cupon | null
  desconto_loja?: DescontoDaLoja | null
}

/**
 * Fotografia diária do desconto de cada oferta (spec-desconto-e-historico §2).
 *
 * Mora aqui — e não no script — porque a série precisa acumular TODO dia sem ninguém
 * lembrar de rodar: quem esquece de coletar não recupera o passado. O script
 * `snapshot:desconto` virou só um gatilho manual desta mesma função.
 *
 * Idempotente pelo índice (oferta, data): rodar duas vezes no mesmo dia atualiza a linha.
 */

/** Data do dia em UTC, zerada — a chave do registro é o DIA, não o instante. */
export const diaDeHoje = (): string => new Date(new Date().toISOString().slice(0, 10)).toISOString()

export interface ResumoSnapshot {
  data: string
  criados: number
  atualizados: number
  sem_percentual: number
  falhas: string[]
}

export async function rodaSnapshotDesconto(payload: Payload): Promise<ResumoSnapshot> {
  const data = diaDeHoje()
  const resumo: ResumoSnapshot = { data, criados: 0, atualizados: 0, sem_percentual: 0, falhas: [] }

  let pagina = 1
  let totalPages = 1
  do {
    const lote = await payload.find({
      collection: 'ofertas',
      where: { _status: { equals: 'published' } },
      limit: 200,
      page: pagina,
      depth: 1,
      overrideAccess: true,
    })
    totalPages = lote.totalPages

    for (const oferta of lote.docs as Oferta[]) {
      try {
        const cupom = oferta.cupom && typeof oferta.cupom === 'object' ? (oferta.cupom as Cupon) : null
        const descontoLoja = oferta.desconto_loja ?? null

        // o efetivo do dia: composto quando dá, senão o maior isolado que conhecemos
        const composto = compor(descontoLoja, cupom)
        const pctCupom =
          cupom?.desconto_tipo === 'percentual' && typeof cupom.desconto_valor === 'number' ? cupom.desconto_valor : null
        const pctLoja =
          descontoLoja?.tipo === 'percentual' && typeof descontoLoja.valor === 'number' ? descontoLoja.valor : null
        const efetivo = composto?.total_pct ?? pctLoja ?? pctCupom

        if (efetivo === null || efetivo === undefined) {
          resumo.sem_percentual += 1
          continue // sem percentual conhecido não há o que fotografar (nada inventado)
        }

        const jaExiste = await payload.find({
          collection: 'historico_desconto',
          where: { and: [{ oferta: { equals: oferta.id } }, { data: { equals: data } }] },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })

        const dados = {
          tenant: oferta.tenant,
          oferta: oferta.id,
          data,
          desconto_pct: efetivo,
          ...(typeof oferta.preco?.valor === 'number' ? { preco: oferta.preco.valor } : {}),
          ...(cupom?.codigo ? { cupom_codigo: cupom.codigo } : {}),
          fonte: 'snapshot-diario' as const,
        }

        if (jaExiste.docs[0]) {
          await payload.update({
            collection: 'historico_desconto',
            id: (jaExiste.docs[0] as { id: number }).id,
            data: dados as never,
            overrideAccess: true,
          })
          resumo.atualizados += 1
        } else {
          await payload.create({ collection: 'historico_desconto', data: dados as never, overrideAccess: true })
          resumo.criados += 1
        }
      } catch (err) {
        // RF8: um item que falha nunca aborta o lote
        resumo.falhas.push(`${String(oferta.slug)}: ${(err as Error).message}`)
      }
    }
    pagina += 1
  } while (pagina <= totalPages)

  return resumo
}

/**
 * QUANDO o snapshot roda (PRD 24 RF8): todo dia às 03:10 UTC, na fila `diario`. O site que
 * passa o relógio usa esta mesma hora e esta mesma fila — no `jobs.autoRun` (Node) ou no Cron
 * Trigger que chama `/api/payload-jobs/run?queue=diario` (Workers). Fila diferente aqui e lá
 * é job que nunca roda.
 */
export const agendaDoSnapshot = { cron: '10 3 * * *', queue: 'diario' } as const

type Agenda = NonNullable<TaskConfig<'snapshotDesconto'>['schedule']>[number]
type AntesDeAgendar = NonNullable<NonNullable<Agenda['hooks']>['beforeSchedule']>

/**
 * Quanto tempo um job agendado pode ficar em `processing` sem sinal de vida antes de ser dado
 * como preso. O snapshot leva segundos, e o Payload atualiza o `updatedAt` do job a cada passo
 * (ao pôr em `processing`, a cada log de task); 6 h parado é processo que morreu no meio.
 */
export const JOB_PRESO_DEPOIS_DE_MS = 6 * 60 * 60 * 1000

type ReqDoHook = Parameters<AntesDeAgendar>[0]['req']

/**
 * Solta os jobs desta agenda que ficaram presos em `processing`: marca como erro (`hasError`,
 * `error`), sem apagar, para ficar o rastro no admin. Devolve quantos soltou.
 *
 * Por que existe: o `defaultBeforeSchedule` do Payload 3.88 conta como pendente todo job
 * agendado sem `completedAt` e sem `error` — inclusive o que está em `processing` — e só agenda
 * com a contagem em zero; o `runJobs` só pega `processing: false`; e o Payload não tem nada que
 * recupere um job preso. Se o processo morre no meio (deploy ou reinício da VPS às 03:10, ou a
 * requisição do Cron Trigger dos Workers cortada por CPU ou por queda de conexão), o job fica
 * `processing: true` para sempre e a agenda nunca mais agenda: o snapshot para, sem aviso.
 */
export async function soltaJobsPresos(req: ReqDoHook, queue: string, taskSlug: string): Promise<number> {
  const limite = new Date(Date.now() - JOB_PRESO_DEPOIS_DE_MS).toISOString()
  const soltos = await req.payload.db.updateJobs({
    where: {
      and: [
        { taskSlug: { equals: taskSlug } },
        { queue: { equals: queue } },
        { 'meta.scheduled': { equals: true } },
        { processing: { equals: true } },
        { completedAt: { exists: false } },
        { updatedAt: { less_than: limite } },
      ],
    },
    data: {
      processing: false,
      hasError: true,
      error: {
        message: `job preso em processing desde antes de ${limite} (o processo morreu no meio); solto pela agenda para o snapshot do dia voltar a rodar`,
      },
    },
    req,
  })
  const quantos = soltos?.length ?? 0
  if (quantos > 0) {
    req.payload.logger.warn(
      { ids: soltos!.map((j) => j.id), queue, taskSlug },
      `${quantos} job(s) ${taskSlug} preso(s) em processing foram marcados como erro para a agenda voltar a rodar`,
    )
  }
  return quantos
}

/**
 * O `schedule` do Payload 3.88 agenda sempre a PRÓXIMA ocorrência do cron depois da última
 * vez que agendou. Na primeira vez não há "última": o tique das 03:10 agenda o job para as
 * 03:10 de AMANHÃ, e o primeiro dia depois do deploy fica sem fotografia — e o `curl` do
 * aceite não roda nada. Sem agendamento anterior registrado, este hook agenda para já.
 *
 * Todo o resto é do Payload (`defaultBeforeSchedule`): no máximo um job agendado pendente
 * por fila. É isso que impede duas execuções no mesmo dia; este hook nunca agenda quando o
 * padrão diz que não. A única coisa que ele faz antes é soltar o job preso em `processing`
 * há mais de `JOB_PRESO_DEPOIS_DE_MS`, que o padrão contaria como pendente para sempre.
 */
export const primeiraPassadaNaHora: AntesDeAgendar = async (args) => {
  const { queueable, jobStats } = args
  const slug = queueable.taskConfig?.slug
  // antes de o Payload contar os pendentes: um job preso em processing conta como pendente
  // para sempre e trava a agenda (ver `soltaJobsPresos`)
  if (slug) await soltaJobsPresos(args.req, queueable.scheduleConfig.queue, slug)
  const padrao = await args.defaultBeforeSchedule(args)
  // O Payload tipa `tasks` com o `TaskType` do site; com os tipos gerados, ele é uma união de
  // literais e o índice some. O que se lê é um registro por slug.
  const tarefas = jobStats?.stats?.scheduledRuns?.queues?.[queueable.scheduleConfig.queue]?.tasks as
    | Record<string, { lastScheduledRun?: string } | undefined>
    | undefined
  const ultima = slug ? tarefas?.[slug]?.lastScheduledRun : undefined
  if (!padrao.shouldSchedule || ultima) return padrao
  return { ...padrao, waitUntil: undefined }
}

export const snapshotDescontoTask: TaskConfig<'snapshotDesconto'> = {
  slug: 'snapshotDesconto',
  label: 'Snapshot diário do desconto',
  // quem agenda é a task; quem passa o relógio é o site (autoRun na VPS, Cron Trigger nos
  // Workers). Muda o schema: o Payload cria o global `payload-jobs-stats` e o campo `meta`
  // em `payload-jobs` — o site precisa de migration ao receber esta versão.
  schedule: [{ ...agendaDoSnapshot, hooks: { beforeSchedule: primeiraPassadaNaHora } }],
  // uma tentativa: se falhar, a próxima execução diária cobre — represar retry de um job
  // que roda todo dia só empilha trabalho
  retries: 1,
  outputSchema: [
    { name: 'criados', type: 'number' },
    { name: 'atualizados', type: 'number' },
    { name: 'sem_percentual', type: 'number' },
    { name: 'falhas', type: 'number' },
  ],
  handler: async ({ req }) => {
    const resumo = await rodaSnapshotDesconto(req.payload)
    req.payload.logger.info(
      { ...resumo, falhas: resumo.falhas.length },
      `snapshot de desconto ${resumo.data.slice(0, 10)}`,
    )
    return {
      output: {
        criados: resumo.criados,
        atualizados: resumo.atualizados,
        sem_percentual: resumo.sem_percentual,
        falhas: resumo.falhas.length,
      },
    }
  },
}
