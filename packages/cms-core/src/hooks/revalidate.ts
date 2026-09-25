import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionAfterOperationHook,
  PayloadRequest,
  SanitizedCollectionConfig,
} from 'payload'

/**
 * PRD 01 RF5 — afterChange/afterDelete avisam o endpoint de revalidação do site com tags:
 * {colecao}:{id}, tenant:{slug} e as extras de quem chama.
 * Nunca derruba o save: falha vira warning no logger.
 *
 * As extras existem porque o núcleo não conhece as coleções do plugin (PRD 17 RF1b): a tag
 * `loja:{slug}` é do afiliado e vem de lá, pela opção `tagsExtras`.
 *
 * PRD 24 RF1 — as tags de uma OPERAÇÃO saem juntas, sem timer. `afterChange`/`afterDelete`
 * só acumulam em `req.context.tagsPendentes`; o `revalidateAfterOperation`, que a fábrica põe
 * em toda coleção, envia uma vez por operação de escrita, em lotes de no máximo 100 tags
 * por POST, e só volta quando o envio terminou. Dois motivos:
 * - o purge por tag da Cloudflare aceita 5 requisições por minuto (rajada de 25), com 100
 *   tags cada — um POST por documento num `update` em massa de 250 eram 250 purges;
 * - num Worker, promessa solta (ou `setTimeout` fora de `ctx.waitUntil`) morre com a
 *   resposta, e o hook não tem `ctx`. Por isso o envio é esperado, com o teto de 3 s de
 *   sempre: o save espera o site responder, e com o site fora do ar espera até 3 s.
 *
 * Em scripts de import nada muda: `REVALIDATE_URL=` vazio e um purge geral no fim.
 */

/** O teto do endpoint de revalidação do site, e o de tags por purge da Cloudflare. */
export const TAGS_POR_POST = 100

/** As operações que rodam `afterChange`/`afterDelete` (Payload 3.88; `duplicate` é um `create`). */
const ESCRITAS = new Set(['create', 'update', 'updateByID', 'delete', 'deleteByID', 'restoreVersion'])

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

/** Um POST por lote de até 100 tags, todos esperados. Falha de qualquer lote vira warning. */
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

type ComPendentes = { tagsPendentes?: string[] }

/**
 * Acumula para o `afterOperation`, se a coleção o tem (a fábrica põe em toda coleção). Hook
 * usado fora da fábrica — sem o `afterOperation`, ou chamado sem a coleção — envia na hora,
 * um POST por documento, como antes: nada fica preso numa fila que ninguém esvazia.
 */
async function registra(req: PayloadRequest, collection: SanitizedCollectionConfig | undefined, tags: string[]) {
  const context = req.context as ComPendentes | undefined
  if (context && collection?.hooks?.afterOperation?.includes(revalidateAfterOperation)) {
    ;(context.tagsPendentes ??= []).push(...tags)
    return
  }
  await envia(req, [...new Set(tags)])
}

export const revalidateAfterChange =
  (colecao: string, opcoes: OpcoesRevalidacao = {}): CollectionAfterChangeHook =>
  async ({ collection, doc, req }) => {
    await registra(req, collection, await montaTags(req, colecao, doc as Record<string, unknown>, opcoes))
    return doc
  }

export const revalidateAfterDelete =
  (colecao: string, opcoes: OpcoesRevalidacao = {}): CollectionAfterDeleteHook =>
  async ({ collection, doc, req }) => {
    await registra(req, collection, await montaTags(req, colecao, doc as Record<string, unknown>, opcoes))
    return doc
  }

/**
 * Envia as tags que as escritas desta requisição acumularam — cada uma uma vez, na ordem em
 * que chegaram. Leitura não envia: uma busca no meio de um lote (com o mesmo `req`) não o
 * parte em pedaços.
 */
export const revalidateAfterOperation: CollectionAfterOperationHook = async ({ operation, req, result }) => {
  if (!ESCRITAS.has(operation)) return result
  const context = req.context as ComPendentes | undefined
  const tags = [...new Set(context?.tagsPendentes ?? [])]
  if (context) context.tagsPendentes = []
  await envia(req, tags)
  return result
}
