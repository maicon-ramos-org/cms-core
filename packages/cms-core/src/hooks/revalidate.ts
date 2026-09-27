import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionAfterOperationHook,
  CollectionBeforeOperationHook,
  PayloadRequest,
} from 'payload'

/**
 * PRD 01 RF5 — afterChange/afterDelete avisam o endpoint de revalidação do site com tags:
 * {colecao}:{id}, tenant:{slug} e as extras de quem chama.
 * Nunca derruba o save: falha vira warning no logger.
 *
 * As extras existem porque o núcleo não conhece as coleções do plugin (PRD 17 RF1b): a tag
 * `loja:{slug}` é do afiliado e vem de lá, pela opção `tagsExtras`.
 *
 * PRD 24 RF1 — as tags de uma OPERAÇÃO saem juntas, sem timer. O purge por tag da Cloudflare
 * aceita 5 requisições por minuto (rajada de 25), com 100 tags cada: um POST por documento
 * num `update` em massa de 250 eram 250 purges. A fábrica põe em toda coleção um
 * `beforeOperation`, que abre o quadro da operação de escrita, e um `afterOperation`, que o
 * fecha; `afterChange`/`afterDelete` só acumulam no quadro aberto. A escrita aninhada (um hook
 * que grava em outra coleção com o mesmo `req`) entrega as tags à de fora, e só a de fora
 * envia: uma vez por operação, em lotes de no máximo 100 tags por POST.
 *
 * O `afterOperation` roda antes do commit. Quando há transação, as tags aguardam o
 * `db.commitTransaction` resolver com sucesso; só então o site recebe o webhook.
 * Quem segura a promessa de rede é o `emSegundoPlano` da fábrica — em Node, ninguém;
 * num Worker, `ctx.waitUntil`.
 *
 * Em scripts de import nada muda: `REVALIDATE_URL=` vazio e um purge geral no fim.
 */

/** O teto do endpoint de revalidação do site, e o de tags por purge da Cloudflare. */
export const TAGS_POR_POST = 100

const getEndpoint = (): string | null => process.env.REVALIDATE_URL || null

/** O `slug` do documento relacionado: do próprio valor, se veio populado, ou do banco. */
export async function slugDeRelacao(req: PayloadRequest, collection: string, value: unknown): Promise<string | null> {
  if (!value) return null
  if (typeof value === 'object' && value !== null && 'slug' in value) {
    return (value as { slug?: string }).slug ?? null
  }
  if (typeof value === 'string' || typeof value === 'number') {
    try {
      const doc = await req.payload.findByID({ collection: collection as 'tenants', id: value, depth: 0 })
      return (doc as { slug?: string })?.slug ?? null
    } catch {
      return null
    }
  }
  return null
}

/** Tags além de `{colecao}:{id}` e `tenant:{slug}`, que vêm depois delas. */
export type TagsExtras = (req: PayloadRequest, colecao: string, doc: Record<string, unknown>) => Promise<string[]>

export interface OpcoesRevalidacao {
  tagsExtras?: TagsExtras
}

async function montaTags(req: PayloadRequest, colecao: string, doc: Record<string, unknown>, opcoes: OpcoesRevalidacao) {
  const tags: string[] = [`${colecao}:${String(doc.id)}`]
  const tenantSlug = await slugDeRelacao(req, 'tenants', doc.tenant)
  if (tenantSlug) tags.push(`tenant:${tenantSlug}`)
  if (opcoes.tagsExtras) tags.push(...(await opcoes.tagsExtras(req, colecao, doc)))
  return tags
}

/** Um POST por lote de até 100 tags. Falha de qualquer lote vira warning: a promessa nunca rejeita. */
async function envia(req: PayloadRequest, tags: string[]): Promise<void> {
  const url = getEndpoint()
  if (!url || !tags.length) return
  const lotes: string[][] = []
  for (let i = 0; i < tags.length; i += TAGS_POR_POST) lotes.push(tags.slice(i, i + TAGS_POR_POST))
  await Promise.all(
    lotes.map(async (lote) => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${process.env.REVALIDATE_TOKEN ?? ''}`,
          },
          body: JSON.stringify({ tags: lote }),
          signal: AbortSignal.timeout(3000),
        })
        // o site devolve 429 quando o purge da Cloudflare recusa (PRD 24 RF3)
        if (!res.ok) req.payload.logger.warn({ status: res.status, tags: lote }, 'revalidate: o site recusou a revalidação')
      } catch (err) {
        req.payload.logger.warn({ err, tags: lote }, 'revalidate: webhook falhou (site fora do ar?)')
      }
    }),
  )
}

/**
 * Quem segura a promessa do envio. Em Node, ninguém (`void`): o save não espera o site, como
 * sempre foi. Num Worker, `(p) => getCloudflareContext().ctx.waitUntil(p)`, para a promessa
 * não morrer com a resposta. Vem de `OpcoesCmsCore.revalidacao.emSegundoPlano`, que a fábrica
 * guarda em `config.custom` (só do servidor).
 */
export type EmSegundoPlano = (envio: Promise<unknown>) => void

export interface CustomDaRevalidacao {
  revalidacao?: { emSegundoPlano?: EmSegundoPlano }
}

const soltaNoNode: EmSegundoPlano = (envio) => {
  void envio.catch(() => {})
}

/**
 * Inicia o envio e o entrega ao agendador — NUNCA o espera. É chamado somente depois do
 * commit, ou quando não há transação para aguardar.
 */
function despacha(req: PayloadRequest, tags: string[]): void {
  if (!tags.length) return
  const custom = req.payload?.config?.custom as CustomDaRevalidacao | undefined
  const agenda = custom?.revalidacao?.emSegundoPlano ?? soltaNoNode
  const envio = envia(req, tags)
  try {
    agenda(envio)
  } catch (err) {
    // agendador que falha (fora de uma requisição do Worker, por exemplo) não derruba o save
    req.payload.logger.warn({ err, tags }, 'revalidate: o agendador recusou o envio')
    soltaNoNode(envio)
  }
}

type Adapter = PayloadRequest['payload']['db']
type IdTransacao = Parameters<Adapter['commitTransaction']>[0]
interface Pendente { req: PayloadRequest; tags: string[] }

/** Um observador por adapter; nunca mistura as transações de requests concorrentes. */
const pendentesPorAdapter = new WeakMap<Adapter, Map<IdTransacao, Pendente>>()

/**
 * Payload 3.88 não oferece hook pós-commit: `afterOperation` precede o commit. Observamos
 * os dois métodos públicos do adapter, uma vez por instância, sem interceptar consultas.
 * O commit original termina ANTES de iniciar o fetch. Rollback descarta as tags.
 */
function observaTransacoes(db: Adapter): Map<IdTransacao, Pendente> {
  const existente = pendentesPorAdapter.get(db)
  if (existente) return existente

  const pendentes = new Map<IdTransacao, Pendente>()
  const commitOriginal = db.commitTransaction.bind(db)
  const rollbackOriginal = db.rollbackTransaction.bind(db)
  db.commitTransaction = async (id) => {
    await commitOriginal(id)
    const pendente = pendentes.get(id)
    if (pendente) {
      pendentes.delete(id)
      despacha(pendente.req, [...new Set(pendente.tags)])
    }
  }
  db.rollbackTransaction = async (id) => {
    try {
      await rollbackOriginal(id)
    } finally {
      pendentes.delete(id)
    }
  }
  pendentesPorAdapter.set(db, pendentes)
  return pendentes
}

function despachaAposCommit(req: PayloadRequest, tags: string[]): void {
  if (!tags.length || !getEndpoint()) return
  const db = req.payload?.db
  const id = req.transactionID
  if (!db || id === undefined || id === null || id instanceof Promise) {
    // Hook isolado ou operação sem transação: a escrita já foi concluída pelo adapter.
    despacha(req, tags)
    return
  }
  const pendentes = observaTransacoes(db)
  const anterior = pendentes.get(id)
  if (anterior) anterior.tags.push(...tags)
  else pendentes.set(id, { req, tags })
}

/**
 * Uma operação de escrita em andamento: as tags que os documentos dela (e das escritas
 * aninhadas nela) acumularam, e a transação em que ela começou.
 */
interface Quadro {
  tags: string[]
  transacao: unknown
}

/** A pilha de operações de escrita abertas nesta requisição, a de fora embaixo. */
type ComPilha = { pilhaDeRevalidacao?: Quadro[] }

/** Marca, nos `args` da operação, o quadro dela: o `beforeOperation` põe, o `afterOperation` acha. */
const QUADRO = Symbol.for('@maicon-ramos-org/cms-core:revalidacao')

/** As operações de escrita como o `beforeOperation` as nomeia (Payload 3.88: `updateByID` é `update`, `deleteByID` é `delete`). */
const ESCRITAS = new Set(['create', 'update', 'delete', 'restoreVersion'])

/**
 * Acumula no quadro da operação de escrita aberta mais de dentro. Sem nenhuma aberta — hook
 * usado numa config que não veio da fábrica, ou chamado à mão —, envia na hora, um POST por
 * documento, como antes: nada fica preso numa fila que ninguém esvazia.
 */
function registra(req: PayloadRequest, tags: string[]) {
  const pilha = (req.context as ComPilha | undefined)?.pilhaDeRevalidacao
  const aberto = pilha?.at(-1)
  if (aberto) {
    aberto.tags.push(...tags)
    return
  }
  despachaAposCommit(req, [...new Set(tags)])
}

export const revalidateAfterChange =
  (colecao: string, opcoes: OpcoesRevalidacao = {}): CollectionAfterChangeHook =>
  async ({ doc, req }) => {
    registra(req, await montaTags(req, colecao, doc as Record<string, unknown>, opcoes))
    return doc
  }

export const revalidateAfterDelete =
  (colecao: string, opcoes: OpcoesRevalidacao = {}): CollectionAfterDeleteHook =>
  async ({ doc, req }) => {
    registra(req, await montaTags(req, colecao, doc as Record<string, unknown>, opcoes))
    return doc
  }

/**
 * Abre o quadro de uma operação de escrita. Leitura não abre: uma busca no meio de um lote
 * (com o mesmo `req`) não o parte em pedaços.
 *
 * Quadro de outra transação é resto de uma operação que falhou antes do `afterOperation`
 * (a falha desfaz a transação e o `req` perde o `transactionID`) num `req` que seguiu em uso:
 * suas tags são descartadas. Uma escrita revertida não deve purgar cache após outra.
 * A escrita aninhada, com o mesmo `req`, está na mesma transação da de fora.
 */
export const revalidateBeforeOperation: CollectionBeforeOperationHook = async ({ args, operation, req }) => {
  if (!ESCRITAS.has(operation)) return args
  const context = req.context as ComPilha | undefined
  if (!context) return args
  const quadro: Quadro = { tags: [], transacao: req.transactionID }
  const pilha = (context.pilhaDeRevalidacao ??= [])
  if (pilha.length && pilha.at(-1)!.transacao !== quadro.transacao) {
    pilha.splice(0)
  }
  pilha.push(quadro)
  ;(args as Record<symbol, unknown>)[QUADRO] = quadro
  return args
}

/**
 * Fecha o quadro da operação. Escrita aninhada — um hook que grava em outra coleção com o
 * mesmo `req`, como o histórico de preço do catálogo — entrega as tags à operação de fora,
 * e só a de fora envia: uma vez por operação, cada tag uma vez, na ordem em que chegaram.
 * Quadros acima do dela são de escritas aninhadas que falharam e foram engolidas por um
 * hook; as tags delas vão junto.
 */
export const revalidateAfterOperation: CollectionAfterOperationHook = async ({ args, req, result }) => {
  const quadro = (args as Record<symbol, unknown> | undefined)?.[QUADRO] as Quadro | undefined
  const pilha = (req.context as ComPilha | undefined)?.pilhaDeRevalidacao
  const i = quadro && pilha ? pilha.indexOf(quadro) : -1
  if (i < 0) return result
  const tags = pilha!.splice(i).flatMap((q) => q.tags)
  if (i > 0) pilha![i - 1]!.tags.push(...tags)
  else if (quadro!.transacao === req.transactionID) despachaAposCommit(req, [...new Set(tags)])
  // Uma escrita aninhada pode ter dado rollback e apagado req.transactionID enquanto o
  // hook externo engole o erro. Tags da transação revertida nunca viram purge imediato.
  return result
}
