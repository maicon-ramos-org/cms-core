import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

/**
 * PRD 01 RF5 — afterChange/afterDelete POSTam pro endpoint de revalidação do site
 * com tags: {colecao}:{id}, tenant:{slug} e as extras de quem chama.
 * Nunca derruba o save: falha vira warning no logger.
 *
 * As extras existem porque o núcleo não conhece as coleções do plugin (PRD 17 RF1b): a tag
 * `loja:{slug}` é do afiliado e vem de lá, pela opção `tagsExtras`.
 */

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

function dispara(req: PayloadRequest, tags: string[]): void {
  const url = getEndpoint()
  if (!url) return
  void fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.REVALIDATE_TOKEN ?? ''}`,
    },
    body: JSON.stringify({ tags }),
    signal: AbortSignal.timeout(3000),
  }).catch((err: unknown) => {
    req.payload.logger.warn({ err, tags }, 'revalidate: webhook falhou (site fora do ar?)')
  })
}

export const revalidateAfterChange =
  (colecao: string, opcoes: OpcoesRevalidacao = {}): CollectionAfterChangeHook =>
  async ({ doc, req }) => {
    dispara(req, await montaTags(req, colecao, doc as Record<string, unknown>, opcoes))
    return doc
  }

export const revalidateAfterDelete =
  (colecao: string, opcoes: OpcoesRevalidacao = {}): CollectionAfterDeleteHook =>
  async ({ doc, req }) => {
    dispara(req, await montaTags(req, colecao, doc as Record<string, unknown>, opcoes))
    return doc
  }
