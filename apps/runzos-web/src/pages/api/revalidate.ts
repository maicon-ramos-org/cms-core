/**
 * PRD 02 RF4 — webhook de invalidação chamado pelos hooks afterChange/afterDelete
 * do Payload. Auth: Bearer REVALIDATE_TOKEN. Body: { tags: string[] }.
 */
import { createHash, timingSafeEqual } from 'node:crypto'

import type { APIRoute } from 'astro'

const igualTimingSafe = (a: string, b: string): boolean => {
  // compara digests de tamanho fixo — timingSafeEqual exige buffers iguais
  const da = createHash('sha256').update(a).digest()
  const db = createHash('sha256').update(b).digest()
  return timingSafeEqual(da, db)
}

export const POST: APIRoute = async (context) => {
  const token = process.env.REVALIDATE_TOKEN
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

  if (context.cache.enabled) {
    await context.cache.invalidate({ tags: tags as string[] })
  }
  return Response.json({ ok: true, tags, cacheAtivo: context.cache.enabled })
}
