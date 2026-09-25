/**
 * PRD 24 RF3 — `Vary: Host` em toda resposta cacheável.
 *
 * Um Worker só serve os dois tenants, e a chave do cache da Cloudflare na frente do Worker
 * é o caminho, não o host: sem `Vary: Host`, a home do `3d.` guardada primeiro seria
 * servida a quem pede a home do domínio principal. O cache honra o `Vary` (RFC 9111), então
 * o middleware do tema o acrescenta em toda resposta que PODE ir para cache — GET/HEAD sem
 * `no-store`/`private` —, inclusive o 301 da barra e o 404 de host desconhecido, que um
 * cache também guarda. A negociação de markdown continua com `Vary: Accept`.
 *
 * O que este teste NÃO cobre: o `Vary` separa as cópias, não a limpeza por tag (ver o
 * comentário de `varia` no middleware). Isso só se prova num Worker de verdade.
 *
 * O middleware roda de verdade: só o `astro:middleware`, a config virtual e o CMS são de
 * mentira.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('astro:middleware', () => ({ defineMiddleware: (f: unknown) => f }))
vi.mock('virtual:editorial/config', () => ({
  default: {
    tenantPadrao: 'principal',
    sufixosDeHost: ['.exemplo.local'],
    semBarra: ['r'],
    pastasComMd: ['ofertas'],
    semTenant: ['/wp-content/uploads'],
  },
}))
vi.mock('../src/lib/cms', () => ({
  getTenantByHost: async (host: string) => (host === 'exemplo.test' ? { id: 1, slug: 'principal' } : null),
  getTenantBySlug: async (slug: string) => (slug === 'principal' || slug === '3d' ? { id: slug, slug } : null),
}))

type Middleware = (context: unknown, next: () => Promise<Response>) => Promise<Response>
const { onRequest } = (await import('../src/middleware')) as unknown as { onRequest: Middleware }

interface Pedido {
  metodo?: string
  headers?: Record<string, string>
  /** o que a rota devolve */
  resposta?: () => Response
}

async function pede(url: string, { metodo = 'GET', headers = {}, resposta }: Pedido = {}) {
  const u = new URL(url)
  const next = vi.fn(async () => (resposta ? resposta() : new Response('<p>ok</p>', { headers: { 'content-type': 'text/html' } })))
  const context = {
    url: u,
    request: new Request(u, { method: metodo, headers: { host: u.host, ...headers } }),
    locals: {} as Record<string, unknown>,
    redirect: (destino: string, status: number) => new Response(null, { status, headers: { location: destino } }),
    rewrite: vi.fn(async (caminho: string) => new Response(`# ${caminho}`, { headers: { 'content-type': 'text/markdown' } })),
  }
  const r = await onRequest(context, next)
  return { r, next, context }
}

/** Os tokens do `Vary`, normalizados — a ordem não importa, a repetição sim. */
const vary = (r: Response): string[] =>
  (r.headers.get('vary') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('Vary: Host', () => {
  it('página de tenant, GET: leva Host (e Accept, porque tem gêmeo .md)', async () => {
    const { r } = await pede('https://exemplo.test/post-qualquer/')
    expect(r.status).toBe(200)
    expect(vary(r).sort()).toEqual(['accept', 'host'])
  })

  it('rota sem gêmeo .md: só Host', async () => {
    const { r } = await pede('https://exemplo.test/blog/')
    expect(vary(r)).toEqual(['host'])
  })

  it('o subdomínio de dev resolve pelo sufixo e também leva Host', async () => {
    const { r, context } = await pede('https://3d.exemplo.local/blog/')
    expect(context.locals.tenant).toEqual({ id: '3d', slug: '3d' })
    expect(vary(r)).toEqual(['host'])
  })

  it('negociação de markdown: Accept e Host na variante markdown', async () => {
    const { r, context } = await pede('https://exemplo.test/post-qualquer/', { headers: { accept: 'text/markdown' } })
    expect(context.rewrite).toHaveBeenCalledWith('/post-qualquer.md')
    expect(vary(r).sort()).toEqual(['accept', 'host'])
  })

  it('o 301 da barra final leva Host (um cache guarda 301, e o destino tem o host)', async () => {
    const { r } = await pede('https://exemplo.test/blog')
    expect(r.status).toBe(301)
    expect(r.headers.get('location')).toBe('https://exemplo.test/blog/')
    expect(vary(r)).toEqual(['host'])
  })

  it('host desconhecido: o 404 leva Host (senão um 404 guardado derrubaria o host bom)', async () => {
    const { r, next } = await pede('https://desconhecido.test/blog/')
    expect(r.status).toBe(404)
    expect(next).not.toHaveBeenCalled()
    expect(vary(r)).toEqual(['host'])
  })

  it('o /feed reescrito para o feed.xml leva Host', async () => {
    const { r, context } = await pede('https://exemplo.test/feed/')
    expect(context.rewrite).toHaveBeenCalledWith('/feed.xml')
    expect(vary(r)).toEqual(['host'])
  })

  it('HEAD é cacheável como GET', async () => {
    const { r } = await pede('https://exemplo.test/blog/', { metodo: 'HEAD' })
    expect(vary(r)).toEqual(['host'])
  })
})

describe('o que não vai para cache fica sem Host', () => {
  it.each(['no-store', 'private, max-age=0', 'no-store, no-cache'])('Cache-Control: %s', async (cc) => {
    const { r } = await pede('https://exemplo.test/blog/', {
      resposta: () => new Response('x', { headers: { 'content-type': 'text/html', 'cache-control': cc } }),
    })
    expect(vary(r)).not.toContain('host')
  })

  it('Cloudflare-CDN-Cache-Control: public vence o Cache-Control: private da origem (PRD 24)', async () => {
    const { r } = await pede('https://exemplo.test/blog/', {
      resposta: () =>
        new Response('x', {
          headers: { 'content-type': 'text/html', 'cache-control': 'private', 'cloudflare-cdn-cache-control': 'public, max-age=3600' },
        }),
    })
    expect(vary(r)).toEqual(['host'])
  })

  it('o redirect de afiliado (no-store) sai sem Vary nenhum', async () => {
    const { r } = await pede('https://exemplo.test/r/c1', {
      resposta: () => new Response(null, { status: 302, headers: { location: 'https://loja.test', 'cache-control': 'no-store' } }),
    })
    expect(r.headers.get('vary')).toBeNull()
  })

  it('POST não é cacheável', async () => {
    const { r } = await pede('https://exemplo.test/api/contato', {
      metodo: 'POST',
      resposta: () => new Response(null, { status: 303, headers: { location: '/contato/?enviado=1' } }),
    })
    expect(vary(r)).not.toContain('host')
  })

  it('/api/revalidate e /healthz passam direto, sem tenant — mas levam Vary: Host como qualquer resposta cacheável', async () => {
    for (const caminho of ['/api/revalidate', '/healthz']) {
      const original = new Response('{}')
      const { r } = await pede(`https://qualquer.test${caminho}`, { resposta: () => original })
      expect(await r.text()).toBe('{}')
      expect(vary(r)).toEqual(['host'])
    }
  })

  it('/api/revalidate e /healthz sem Vary quando a resposta não é cacheável (POST, no-store)', async () => {
    const original = new Response(null, { status: 303, headers: { 'cache-control': 'no-store' } })
    const { r } = await pede('https://qualquer.test/api/revalidate', { metodo: 'POST', resposta: () => original })
    expect(r).toBe(original)
  })

  it('`semTenant` da config (PRD 24) também passa direto — host desconhecido não vira 404, e leva Vary: Host', async () => {
    const original = new Response('redireciona pro r2', { status: 301 })
    const { r, next } = await pede('https://host-sem-cms-no-ar.test/wp-content/uploads/2022/foo.jpg', {
      resposta: () => original,
    })
    expect(await r.text()).toBe('redireciona pro r2')
    expect(r.status).toBe(301)
    expect(next).toHaveBeenCalledTimes(1)
    expect(vary(r)).toEqual(['host'])
  })

  it('`semTenant` também não redireciona por barra final (a regra roda depois do bypass)', async () => {
    const { r, next } = await pede('https://exemplo.test/wp-content/uploads/sem-extensao-nem-barra')
    expect(r.status).not.toBe(301)
    expect(next).toHaveBeenCalledTimes(1)
  })
})

describe('o Vary que a rota já trouxe', () => {
  it('é mantido, e Accept-Encoding não conta como Accept', async () => {
    const { r } = await pede('https://exemplo.test/post-qualquer/', {
      resposta: () => new Response('x', { headers: { 'content-type': 'text/html', vary: 'Accept-Encoding' } }),
    })
    expect(vary(r).sort()).toEqual(['accept', 'accept-encoding', 'host'])
  })

  it('sem repetir o que já estava, em qualquer caixa', async () => {
    const { r } = await pede('https://exemplo.test/post-qualquer/', {
      resposta: () => new Response('x', { headers: { 'content-type': 'text/html', vary: 'host, ACCEPT' } }),
    })
    expect(vary(r).sort()).toEqual(['accept', 'host'])
  })

  it('o Link para o gêmeo .md continua no HTML', async () => {
    const { r } = await pede('https://exemplo.test/post-qualquer/')
    expect(r.headers.get('link')).toBe('</post-qualquer.md>; rel="alternate"; type="text/markdown"')
  })
})
