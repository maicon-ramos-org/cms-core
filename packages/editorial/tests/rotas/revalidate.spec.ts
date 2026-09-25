/**
 * PRD 24 RF3 — `/api/revalidate` nos dois formatos.
 *
 * Em Node, o de sempre: o cache de rota do Astro (em memória) invalida pelas tags. Nos
 * Workers, o purge por tag da Cloudflare tem limite (5 por minuto, rajada de 25) e, quando
 * recusa, NÃO lança: devolve `success: false`. O provedor de cache do adaptador descarta
 * esse retorno, e a rota responderia 200 a um purge que não aconteceu — a página velha
 * ficaria no ar sem ninguém saber. Por isso a rota purga ela mesma nos Workers e responde
 * 429 quando a Cloudflare recusa; e nunca 500, que o CMS leria como site quebrado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cf = vi.hoisted(() => ({ purga: null as null | ((o: { tags: string[] }) => Promise<unknown>) }))

vi.mock('../../src/lib/ambiente', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/ambiente')>()),
  purgaDaCloudflare: async () => cf.purga,
}))

const { POST } = await import('../../src/rotas/api/revalidate')

const TOKEN = 'token-de-teste'

/** O `context` do Astro com o que a rota lê: o request e o `cache` da rota. */
function contexto(corpo: unknown, opcoes: { token?: string; cacheAtivo?: boolean; invalidate?: () => Promise<unknown> } = {}) {
  const invalidate = vi.fn(opcoes.invalidate ?? (async () => undefined))
  const request = new Request('https://exemplo.test/api/revalidate', {
    method: 'POST',
    headers: { authorization: `Bearer ${opcoes.token ?? TOKEN}`, 'content-type': 'application/json' },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  })
  const context = { request, cache: { enabled: opcoes.cacheAtivo ?? true, invalidate } }
  return { context: context as unknown as Parameters<typeof POST>[0], invalidate }
}

beforeEach(() => {
  vi.stubEnv('REVALIDATE_TOKEN', TOKEN)
  cf.purga = null
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('autenticação e corpo (o contrato de antes)', () => {
  it('token errado: 401', async () => {
    const { context } = contexto({ tags: ['a'] }, { token: 'outro' })
    expect((await POST(context)).status).toBe(401)
  })
  it('sem REVALIDATE_TOKEN no ambiente: 401 para qualquer um', async () => {
    vi.stubEnv('REVALIDATE_TOKEN', undefined)
    const { context } = contexto({ tags: ['a'] })
    expect((await POST(context)).status).toBe(401)
  })
  it('corpo que não é JSON: 400', async () => {
    const { context } = contexto('{')
    expect((await POST(context)).status).toBe(400)
  })
  it('o teto de 100 tags continua', async () => {
    const tags = Array.from({ length: 101 }, (_, i) => `t${i}`)
    const { context, invalidate } = contexto({ tags })
    expect((await POST(context)).status).toBe(400)
    expect(invalidate).not.toHaveBeenCalled()
  })
})

describe('em Node (sem a Cloudflare)', () => {
  it('invalida pelo cache de rota do Astro e responde como antes', async () => {
    const { context, invalidate } = contexto({ tags: ['tenant:a', 'posts:1'] })
    const r = await POST(context)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, tags: ['tenant:a', 'posts:1'], cacheAtivo: true })
    expect(invalidate).toHaveBeenCalledWith({ tags: ['tenant:a', 'posts:1'] })
  })
  it('sem cache de rota ligado: 200 sem invalidar nada', async () => {
    const { context, invalidate } = contexto({ tags: ['a'] }, { cacheAtivo: false })
    const r = await POST(context)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, tags: ['a'], cacheAtivo: false })
    expect(invalidate).not.toHaveBeenCalled()
  })
  it('um provedor que devolva `success: false` também vira 429', async () => {
    const { context } = contexto({ tags: ['a'] }, { invalidate: async () => ({ success: false, errors: [] }) })
    expect((await POST(context)).status).toBe(429)
  })
})

describe('nos Workers (purge da Cloudflare)', () => {
  it('purga uma vez, pelas tags, sem passar também pelo provedor (seriam dois purges da cota)', async () => {
    const purga = vi.fn(async () => ({ success: true, errors: [] }))
    cf.purga = purga
    const { context, invalidate } = contexto({ tags: ['tenant:a'] })
    const r = await POST(context)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, tags: ['tenant:a'], cacheAtivo: true })
    expect(purga).toHaveBeenCalledTimes(1)
    expect(purga).toHaveBeenCalledWith({ tags: ['tenant:a'] })
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('purge recusado (`success: false`, sem lançar): 429 com Retry-After, e o motivo no corpo', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const erros = [{ code: 1134, message: 'rate limited' }]
    cf.purga = async () => ({ success: false, errors: erros })
    const { context } = contexto({ tags: ['tenant:a'] })
    const r = await POST(context)
    expect(r.status).toBe(429)
    expect(r.headers.get('retry-after')).toBe('60')
    const corpo = (await r.json()) as { ok: boolean; tags: string[]; erros: unknown[] }
    expect(corpo.ok).toBe(false)
    expect(corpo.tags).toEqual(['tenant:a'])
    expect(corpo.erros).toEqual(erros)
  })

  it('purge que lança não vira 500: 503 com Retry-After', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    cf.purga = async () => {
      throw new Error('rede')
    }
    const { context } = contexto({ tags: ['tenant:a'] })
    const r = await POST(context)
    expect(r.status).toBe(503)
    expect(r.headers.get('retry-after')).toBe('60')
  })

  it('sem cache de rota ligado no site, não purga nem nos Workers', async () => {
    const purga = vi.fn(async () => ({ success: true }))
    cf.purga = purga
    const { context } = contexto({ tags: ['a'] }, { cacheAtivo: false })
    expect((await POST(context)).status).toBe(200)
    expect(purga).not.toHaveBeenCalled()
  })
})
