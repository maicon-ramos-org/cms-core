/**
 * PRD 02 RF4 — webhook de invalidação chamado pelos hooks afterChange/afterDelete
 * do Payload. Auth: Bearer REVALIDATE_TOKEN. Body: { tags: string[] }.
 *
 * PRD 24 RF3 — nos Workers, o purge por tag da Cloudflare tem limite (5 por minuto,
 * rajada de 25, 100 tags por pedido) e, quando recusa, não lança: devolve
 * `success: false`. A rota responde 429 nesse caso (com `Retry-After`), e 503 se o purge
 * falhar de outro jeito — nunca 500, que o CMS leria como site quebrado e esconderia que a
 * página velha ficou no ar.
 */
import { createHash, timingSafeEqual } from 'node:crypto'

import type { APIContext, APIRoute } from 'astro'

import { purgaDaCloudflare, variavel } from '../../lib/ambiente'

/** O limite do purge é por minuto: um minuto de espera cobre o pior caso. */
const ESPERA_S = '60'

interface ResultadoDaPurga {
  recusada: boolean
  erros: unknown[]
}

/**
 * Purga as tags no cache que o site usa, UMA vez (passar pelos dois caminhos gastaria dois
 * purges da cota). Nos Workers, o purge da Cloudflare direto — o provedor de cache do
 * adaptador faz a mesma chamada, com as mesmas tags, mas descarta a recusa (ver
 * `purgaDaCloudflare`). Fora deles, o cache de rota do Astro, como sempre; se um provedor
 * um dia devolver `success: false`, a recusa também é vista.
 */
async function purgaAsTags(cache: APIContext['cache'], tags: string[]): Promise<ResultadoDaPurga> {
  if (!cache.enabled) return { recusada: false, erros: [] }
  const daCloudflare = await purgaDaCloudflare()
  const resposta: unknown = daCloudflare ? await daCloudflare({ tags }) : await cache.invalidate({ tags })
  if (resposta && typeof resposta === 'object' && (resposta as { success?: unknown }).success === false) {
    return { recusada: true, erros: (resposta as { errors?: unknown[] }).errors ?? [] }
  }
  return { recusada: false, erros: [] }
}

const igualTimingSafe = (a: string, b: string): boolean => {
  // compara digests de tamanho fixo — timingSafeEqual exige buffers iguais
  const da = createHash('sha256').update(a).digest()
  const db = createHash('sha256').update(b).digest()
  return timingSafeEqual(da, db)
}

export const POST: APIRoute = async (context) => {
  const token = variavel('REVALIDATE_TOKEN')
  const auth = context.request.headers.get('authorization') ?? ''
  if (!token || !igualTimingSafe(auth, `Bearer ${token}`)) {
    return Response.json({ ok: false, erro: 'não autorizado' }, { status: 401 })
  }

  let tags: unknown
  try {
    tags = ((await context.request.json()) as { tags?: unknown })?.tags
  } catch {
    return Response.json({ ok: false, erro: 'body inválido' }, { status: 400 })
  }
  if (!Array.isArray(tags) || tags.length === 0 || tags.length > 100 || !tags.every((t) => typeof t === 'string' && t.length <= 200)) {
    return Response.json({ ok: false, erro: 'tags deve ser string[] (1-100 itens, cada uma ≤200 chars)' }, { status: 400 })
  }

  let purga: ResultadoDaPurga
  try {
    purga = await purgaAsTags(context.cache, tags as string[])
  } catch (err) {
    console.error('[revalidate] o purge falhou:', (err as Error).message)
    return Response.json(
      { ok: false, erro: 'o purge falhou; tente de novo', tags },
      { status: 503, headers: { 'retry-after': ESPERA_S } },
    )
  }
  if (purga.recusada) {
    console.warn(`[revalidate] purge recusado (${tags.length} tags) — limite de purge da Cloudflare`)
    return Response.json(
      { ok: false, erro: 'purge recusado pelo limite da Cloudflare; tente de novo', tags, erros: purga.erros },
      { status: 429, headers: { 'retry-after': ESPERA_S } },
    )
  }
  return Response.json({ ok: true, tags, cacheAtivo: context.cache.enabled })
}
