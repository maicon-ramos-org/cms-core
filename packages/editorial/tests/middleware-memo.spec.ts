import { afterEach, describe, expect, it, vi } from 'vitest'
import { cmsFetch } from '../src/lib/cms'
import { comContextoLeituraCms } from '../src/lib/contexto-requisicao'

const config = vi.hoisted(() => ({ tenantPadrao: 'exemplo', semBarra: ['r'], pastasComMd: ['fichas'],
  memoLeituras: undefined as undefined | { caminhosPublicos: string[] } }))
vi.mock('astro:middleware', () => ({ defineMiddleware: (f: unknown) => f }))
vi.mock('virtual:editorial/config', () => ({ default: config }))
const { onRequest } = await import('../src/middleware')
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); config.memoLeituras = undefined })

async function pede(path: string, optin: boolean, headers: Record<string, string> = {}) {
  if (optin) config.memoLeituras = { caminhosPublicos: ['/', '/fichas/*', '/search-index.json', '/r/*'] }
  vi.stubEnv('CMS_URL', 'https://cms.test')
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => String(input).includes('/api/tenants')
    ? Response.json({ docs: [{ id: 1, slug: 'exemplo' }] })
    : Response.json({ docs: [{ titulo: 'Conteúdo público' }] })))
  const url = new URL('https://exemplo.test' + path)
  const locals = {}
  const contexto = (alvo: URL, aceitar = headers.accept ?? ''): Parameters<typeof onRequest>[0] => ({
    url: alvo, locals,
    request: new Request(alvo, { headers: { host: alvo.host, ...headers, accept: aceitar } }),
    rewrite: async (destino: string) => onRequest(contexto(new URL(destino, alvo), ''), render),
    redirect: (destino: string, status: number) => new Response(null, { status, headers: { location: destino } }),
  } as unknown as Parameters<typeof onRequest>[0])
  const render = async () => {
    const [a, b] = await Promise.all([cmsFetch('/api/publico?tenant=1'), cmsFetch('/api/publico?tenant=1')])
    return Response.json({ a, b }, { headers: { 'cache-tag': 'tenant:exemplo' } })
  }
  const resposta = await onRequest(contexto(url), render)
  if (!resposta) throw new Error('middleware não respondeu')
  const corpo = await resposta.json()
  const chamadas = vi.mocked(fetch).mock.calls.filter(([u]) => String(u).includes('/api/publico')).length
  return { resposta, corpo, chamadas }
}

describe('middleware memo opt-in', () => {
  it('padrão não muda e opção reduz duplicata mantendo corpo/headers', async () => {
    const normal = await pede('/', false)
    const memo = await pede('/', true)
    expect(normal.chamadas).toBe(2)
    expect(memo.chamadas).toBe(1)
    expect(memo.corpo).toEqual(normal.corpo)
    expect([...memo.resposta.headers]).toEqual([...normal.resposta.headers])
  })
  it('rota JSON participa quando explicitamente declarada', async () => {
    expect((await pede('/search-index.json', true)).chamadas).toBe(1)
  })
  it('rewrite Accept markdown cria contexto e preserva Vary', async () => {
    const { chamadas, resposta } = await pede('/fichas/exemplo/', true, { accept: 'text/markdown' })
    expect(chamadas).toBe(1)
    expect(resposta.headers.get('vary')).toContain('Accept')
    expect(resposta.headers.get('vary')).toContain('Host')
  })
  it.each(['/r/c1', '/fora/'])('nunca ativa para %s', async path => {
    expect((await pede(path, true)).chamadas).toBe(2)
  })
  it('cookie ou Authorization nunca ativam memo', async () => {
    expect((await pede('/', true, { cookie: 'teste=ficticio' })).chamadas).toBe(2)
    expect((await pede('/', true, { authorization: 'Bearer ficticio' })).chamadas).toBe(2)
  })
  it('rota excluída não herda memo de um render público que fez rewrite', async () => {
    const r = await comContextoLeituraCms(async () => {
      expect((await pede('/r/c1', true)).chamadas).toBe(2)
      return new Response('fim')
    })
    await r.text()
  })
})
