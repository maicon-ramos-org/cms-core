/**
 * PRD 02 RF4 — webhook de invalidação chamado pelos hooks afterChange/afterDelete
 * do Payload. Auth: Bearer REVALIDATE_TOKEN. Body: { tags: string[] }.
 */
import type { APIRoute } from 'astro'

export const POST: APIRoute = async (context) => {
  const token = process.env.REVALIDATE_TOKEN
  const auth = context.request.headers.get('authorization') ?? ''
  if (!token || auth !== `Bearer ${token}`) {
    return Response.json({ ok: false, erro: 'não autorizado' }, { status: 401 })
  }

  let tags: unknown
  try {
    tags = ((await context.request.json()) as { tags?: unknown })?.tags
  } catch {
    return Response.json({ ok: false, erro: 'body inválido' }, { status: 400 })
  }
  if (!Array.isArray(tags) || tags.length === 0 || tags.length > 100 || !tags.every((t) => typeof t === 'string')) {
    return Response.json({ ok: false, erro: 'tags deve ser string[] (1-100)' }, { status: 400 })
  }

  if (context.cache.enabled) {
    await context.cache.invalidate({ tags: tags as string[] })
  }
  return Response.json({ ok: true, tags, cacheAtivo: context.cache.enabled })
}
