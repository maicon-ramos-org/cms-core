import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('virtual:editorial/config', () => ({ default: { slugsSemPagina: ['home'], fichas: { apps: { pasta: 'apps' } } } }))

import { GET } from '../src/rotas/[slug].json'
import { GET as GET_MD } from '../src/rotas/[slug].md'

const tenant = { id: 9, slug: 'exemplo', canonical_host: 'exemplo.test' }
const corpo = { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Texto público da página.' }] }] } }
let documentos: Record<string, unknown>[]
let chamadas: URL[]

beforeEach(() => {
  documentos = []
  chamadas = []
  vi.stubEnv('CMS_URL', 'http://cms.example.test')
  vi.stubEnv('CMS_API_KEY', 'fixture-private-key')
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input)
    chamadas.push(url)
    const col = url.pathname.split('/')[2]
    const slug = url.searchParams.get('where[and][1][slug][equals]')
    const docs = documentos.filter(d => d.collection === col && d.slug === slug).map(({ collection: _collection, ...publico }) => publico)
    return Response.json({ docs, totalDocs: docs.length })
  }))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

const rota = async (slug: string, cache?: { enabled: boolean; set: ReturnType<typeof vi.fn> }) =>
  GET({ params: { slug }, locals: { tenant }, cache } as never)
const rotaMd = async (slug: string, cache?: { enabled: boolean; set: ReturnType<typeof vi.fn> }) =>
  GET_MD({ params: { slug }, locals: { tenant }, cache } as never)

describe('gêmeo JSON público', () => {
  it('expõe somente campos aprovados do post publicado, com canonical e cache por tag', async () => {
    documentos = [{ collection: 'posts', id: 12, slug: 'artigo', titulo: 'Artigo', corpo,
      categoria: { nome: 'Guias', slug: 'guias' }, tags: [{ nome: 'Teste', slug: 'teste' }],
      autor: { nome: 'Autora', slug: 'autora' }, faq: [{ pergunta: 'Por quê?', resposta: 'Porque sim.' }],
      publicado_em: '2026-09-27T10:00:00Z', url_afiliado_fonte: 'https://segredo.example/',
      comissao_estimada: '100', gates: { segredo: 'não publicar' }, apiKey: 'segredo',
    }]
    const set = vi.fn()
    const response = await rota('artigo', { enabled: true, set })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    expect(response.headers.get('link')).toBe('<https://exemplo.test/artigo/>; rel="canonical"')
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ url: 'https://exemplo.test/artigo/', slug: 'artigo',
      contentType: 'artigo', title: 'Artigo', contentText: 'Texto público da página.',
      category: { name: 'Guias', slug: 'guias' }, author: { name: 'Autora', slug: 'autora' } })
    expect(JSON.stringify(body)).not.toMatch(/segredo|comissao|gates|apiKey|url_afiliado/i)
    expect(set).toHaveBeenCalledWith({ maxAge: 3600, swr: 300, tags: ['tenant:exemplo', 'posts:12'] })
    expect(chamadas[0]!.searchParams.get('where[and][0][tenant][equals]')).toBe('9')
    expect(chamadas[0]!.searchParams.get('where[and][2][_status][equals]')).toBe('published')
    expect(chamadas).toHaveLength(1)
  })

  it('projeta página institucional sem devolver dados privados nem template fora da raiz', async () => {
    documentos = [{ collection: 'pages', id: 13, slug: 'sobre', titulo: 'Sobre', template: 'institucional',
      corpo, dados: { segredo: 'não publicar' } }]
    const set = vi.fn()
    const response = await rota('sobre', { enabled: true, set })
    expect(response.status).toBe(200)
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ contentType: 'page', title: 'Sobre', contentText: 'Texto público da página.' })
    expect(JSON.stringify(body)).not.toContain('segredo')
    expect(set).toHaveBeenCalledWith({ maxAge: 600, swr: 120, tags: ['tenant:exemplo', 'pages:13'] })
    documentos = [{ collection: 'pages', id: 14, slug: 'app', titulo: 'App', template: 'apps' }]
    expect((await rota('app', { enabled: true, set })).status).toBe(404)
  })

  it('não cria cache nem documento para slug inexistente ou página de builder', async () => {
    const set = vi.fn()
    const missing = await rota('inexistente', { enabled: true, set })
    expect(missing.status).toBe(404)
    expect(missing.headers.get('cache-control')).toBe('no-store')
    expect(set).not.toHaveBeenCalled()
    expect((await rota('home', { enabled: true, set })).status).toBe(404)
    expect(set).not.toHaveBeenCalled()
  })

  it('Markdown de post e página compartilha canonical, noindex e tags de cache do JSON', async () => {
    documentos = [{ collection: 'posts', id: 12, slug: 'artigo', titulo: 'Artigo', corpo }]
    const postSet = vi.fn()
    const post = await rotaMd('artigo', { enabled: true, set: postSet })
    expect(post.status).toBe(200)
    expect(post.headers.get('x-robots-tag')).toBe('noindex')
    expect(post.headers.get('link')).toBe('<https://exemplo.test/artigo/>; rel="canonical"')
    expect(postSet).toHaveBeenCalledWith({ maxAge: 3600, swr: 300, tags: ['tenant:exemplo', 'posts:12'] })
    expect(await post.text()).toContain('Texto público da página.')

    documentos = [{ collection: 'pages', id: 13, slug: 'sobre', titulo: 'Sobre', template: 'institucional', corpo }]
    const pageSet = vi.fn()
    const page = await rotaMd('sobre', { enabled: true, set: pageSet })
    expect(page.status).toBe(200)
    expect(page.headers.get('x-robots-tag')).toBe('noindex')
    expect(page.headers.get('link')).toBe('<https://exemplo.test/sobre/>; rel="canonical"')
    expect(pageSet).toHaveBeenCalledWith({ maxAge: 600, swr: 120, tags: ['tenant:exemplo', 'pages:13'] })
    expect(await page.text()).toContain('Texto público da página.')
  })
})
