import { describe, expect, it, vi } from 'vitest'
import { respondeRenderSiteReaderV1 } from '../src/site-reader/render'

const url = 'https://cms.example.test/api/editorial/render-v1?slug=guia-alma'
const identidade = { versao: 1 as const, papel: 'site-reader' as const, tenantId: '7' }
const payload = {} as never
const pedir = (urlDaPagina = url, method = 'GET', headers: HeadersInit = {}) =>
  new Request(urlDaPagina, { method, headers })

describe('render-v1: projeção privada, pequena e fail-closed', () => {
  it('aceita somente slug exato e entrega envelope do tenant autenticado', async () => {
    const projetor = vi.fn(async () => ({ revisao: '2026-09-26T19:00:00.000Z', dados: { titulo: 'Guia', ofertas: [{ id: 12, preco: null }] } }))
    const r = await respondeRenderSiteReaderV1(pedir(), identidade, payload, projetor)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ versao: 1, tenantId: '7', slug: 'guia-alma', revisao: '2026-09-26T19:00:00.000Z',
      dados: { titulo: 'Guia', ofertas: [{ id: 12, preco: null }] } })
    expect(projetor).toHaveBeenCalledWith({ payload, tenantId: '7', slug: 'guia-alma' })
    expect(r.headers.get('cache-control')).toBe('private, no-store')
    expect(r.headers.get('vary')).toBe('Authorization')
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.has('set-cookie')).toBe(false)
  })

  it.each(['', '?slug=guia-alma&tenant=8', '?slug=guia-alma&slug=outro', '?slug=../admin', '?slug=Guia-Alma', `?slug=${'a'.repeat(201)}`])
  ('rejeita consulta fora do contrato: %s', async query => {
    const projetor = vi.fn()
    expect((await respondeRenderSiteReaderV1(pedir('https://cms.example.test/api/editorial/render-v1' + query), identidade, payload, projetor)).status).toBe(400)
    expect(projetor).not.toHaveBeenCalled()
  })

  it('não executa projetor em outro método ou override', async () => {
    const projetor = vi.fn()
    for (const request of [pedir(url, 'POST'), pedir(url, 'GET', { 'X-HTTP-Method-Override': 'GET' }),
      pedir(url, 'GET', { 'X-Payload-HTTP-Method-Override': 'GET' })]) {
      expect((await respondeRenderSiteReaderV1(request, identidade, payload, projetor)).status).toBe(405)
    }
    expect(projetor).not.toHaveBeenCalled()
  })

  it('não distingue rascunho de página inexistente e não devolve erro privado', async () => {
    expect((await respondeRenderSiteReaderV1(pedir(), identidade, payload, async () => null)).status).toBe(404)
    const r = await respondeRenderSiteReaderV1(pedir(), identidade, payload, async () => { throw new Error('segredo-sintetico') })
    expect(r.status).toBe(503)
    expect(await r.text()).not.toContain('segredo-sintetico')
  })

  it.each([
    { revisao: '', dados: {} }, { revisao: 'rev 1', dados: {} },
    { revisao: 'rev-1', dados: { n: Infinity } },
    { revisao: 'rev-1', dados: { data: new Date() } },
    { revisao: 'rev-1', dados: { funcao: () => 1 } },
    { revisao: 'rev-1', dados: { corpo: 'x'.repeat(2_000_000) } },
  ])('recusa projeção inválida ou maior que 2 MB sem expor dados', async pagina => {
    const r = await respondeRenderSiteReaderV1(pedir(), identidade, payload, async () => pagina as never)
    expect(r.status).toBe(503)
    expect(await r.text()).not.toContain('x'.repeat(100))
  })

  it('recusa objeto cíclico, mas aceita referência reutilizada sem ciclo', async () => {
    const ciclo: Record<string, unknown> = {}
    ciclo.eu = ciclo
    expect((await respondeRenderSiteReaderV1(pedir(), identidade, payload,
      async () => ({ revisao: 'r1', dados: ciclo }))).status).toBe(503)
    const comum = { numero: 1 }
    expect((await respondeRenderSiteReaderV1(pedir(), identidade, payload,
      async () => ({ revisao: 'r1', dados: { a: comum, b: comum } }))).status).toBe(200)
  })

  it('não executa getters/toJSON nem aceita campos que JSON omitiria', async () => {
    const getter = vi.fn(() => 'segredo-sintetico')
    const dados = Object.defineProperty({}, 'segredo', { enumerable: true, get: getter })
    expect((await respondeRenderSiteReaderV1(pedir(), identidade, payload,
      async () => ({ revisao: 'r1', dados }))).status).toBe(503)
    expect(getter).not.toHaveBeenCalled()
    const toJSON = vi.fn(() => ({ segredo: 'segredo-sintetico' }))
    expect((await respondeRenderSiteReaderV1(pedir(), identidade, payload,
      async () => ({ revisao: 'r1', dados: { toJSON } }))).status).toBe(503)
    expect(toJSON).not.toHaveBeenCalled()
    const simbolo = { [Symbol('oculto')]: 'valor' }
    expect((await respondeRenderSiteReaderV1(pedir(), identidade, payload,
      async () => ({ revisao: 'r1', dados: simbolo }))).status).toBe(503)
    const lacuna = new Array(1)
    expect((await respondeRenderSiteReaderV1(pedir(), identidade, payload,
      async () => ({ revisao: 'r1', dados: { lacuna } }))).status).toBe(503)
  })
})
