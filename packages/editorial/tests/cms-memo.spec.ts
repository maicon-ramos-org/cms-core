import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cmsFetch } from '../src/lib/cms'
import { comContextoLeituraCms } from '../src/lib/contexto-requisicao'

beforeEach(() => {
  vi.stubEnv('CMS_URL', 'https://cms.test')
  vi.stubEnv('CMS_API_KEY', 'ficticia-teste')
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ docs: [{ id: 1 }] })))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('cmsFetch no contexto opt-in', () => {
  it('cabeçalho e rodapé com mesma query fazem um GET real', async () => {
    const r = await comContextoLeituraCms(async () => {
      const path = '/api/categorias?where[tenant][equals]=1&depth=1'
      const [a, b] = await Promise.all([cmsFetch(path), cmsFetch(path)])
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
      return Response.json(a)
    })
    expect(await r.json()).toEqual({ docs: [{ id: 1 }] })
    expect(fetch).toHaveBeenCalledTimes(1)
    const opcoes = vi.mocked(fetch).mock.calls[0]![1]!
    expect(new Headers(opcoes.headers).get('authorization')).toBe('users API-Key ficticia-teste')
    expect(opcoes.signal).toBeInstanceOf(AbortSignal)
  })

  it('fora do opt-in segue com duas chamadas', async () => {
    await Promise.all([cmsFetch('/api/categorias'), cmsFetch('/api/categorias')])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('cliques POST não são colapsados nem dentro de contexto público', async () => {
    const r = await comContextoLeituraCms(async () => {
      const dados = { method: 'POST', body: JSON.stringify({ ref: 'pagina' }) }
      await Promise.all([cmsFetch('/api/cliques', dados), cmsFetch('/api/cliques', dados)])
      return new Response(null, { status: 204 })
    })
    expect(r.status).toBe(204)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it.each([404, 503])('mantém timeout customizado e não mascara HTTP %s no mesmo request', async status => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status }))
    const r = await comContextoLeituraCms(async () => {
      await expect(cmsFetch('/api/categorias')).rejects.toThrow('HTTP ' + status)
      await cmsFetch('/api/categorias')
      await cmsFetch('/api/categorias')
      const signal = new AbortController().signal
      await cmsFetch('/api/categorias', { signal })
      expect(vi.mocked(fetch).mock.calls.at(-1)![1]!.signal).toBe(signal)
      return new Response(null)
    })
    await r.text()
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})
