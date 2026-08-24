import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

/**
 * PRD 01 RF5 — afterChange/afterDelete POSTam pro endpoint de revalidação do site
 * com tags: tenant:{slug}, {colecao}:{id}, loja:{slug}.
 * Nunca derruba o save: falha vira warning no logger.
 */

const getEndpoint = (): string | null => process.env.REVALIDATE_URL || null

async function slugDeRelacao(
  req: PayloadRequest,
  collection: 'tenants' | 'lojas',
  value: unknown,
): Promise<string | null> {
  if (!value) return null
  if (typeof value === 'object' && value !== null && 'slug' in value) {
    return (value as { slug?: string }).slug ?? null
  }
  if (typeof value === 'string' || typeof value === 'number') {
    try {
      const doc = await req.payload.findByID({ collection, id: value, depth: 0 })
      return (doc as { slug?: string })?.slug ?? null
    } catch {
      return null
    }
  }
  return null
}

async function montaTags(req: PayloadRequest, colecao: string, doc: Record<string, unknown>) {
  const tags: string[] = [`${colecao}:${String(doc.id)}`]
  const tenantSlug = await slugDeRelacao(req, 'tenants', doc.tenant)
  if (tenantSlug) tags.push(`tenant:${tenantSlug}`)
  const lojaSlug = await slugDeRelacao(req, 'lojas', doc.loja)
  if (lojaSlug) tags.push(`loja:${lojaSlug}`)
  if (colecao === 'lojas' && typeof doc.slug === 'string') tags.push(`loja:${doc.slug}`)
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
  (colecao: string): CollectionAfterChangeHook =>
  async ({ doc, req }) => {
    dispara(req, await montaTags(req, colecao, doc as Record<string, unknown>))
    return doc
  }

export const revalidateAfterDelete =
  (colecao: string): CollectionAfterDeleteHook =>
  async ({ doc, req }) => {
    dispara(req, await montaTags(req, colecao, doc as Record<string, unknown>))
    return doc
  }
