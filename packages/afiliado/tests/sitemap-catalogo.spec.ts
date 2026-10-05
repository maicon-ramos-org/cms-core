import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('virtual:afiliado/config', () => ({ default: { pastaPorOrigem: {}, redesDeRastreio: [] } }))

import { listarParaSitemap, type TenantDTO } from '../src/web/lib/cms'
import { sitemaps } from '../src/web/extensao'
import { urlset } from '@maicon-ramos-org/editorial/lib/sitemap'

type Documento = Record<string, string | number | boolean | null>
const tenant = { id: 1 } as TenantDTO
const consultas: URL[] = []

// Exercita o gerador e o cliente REST reais; só o transporte é substituído.
// Como o Payload, recusa _status no catálogo sem drafts, aplica where e pagina.
function cms(dados: Record<string, Documento[]>) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    consultas.push(url)
    const colecao = url.pathname.split('/').at(-1)!
    const filtros = [...url.searchParams].filter(([key]) => key.startsWith('where['))
    if (colecao === 'produtos_fisicos' && filtros.some(([key]) => key.includes('[_status]'))) {
      return Response.json({ errors: [{ message: 'The following path cannot be queried: _status' }] }, { status: 400 })
    }
    const filtrados = (dados[colecao] ?? []).filter(doc => filtros.every(([key, value]) => {
      const match = key.match(/^where(?:\[and\]\[\d+\])?\[([^\]]+)\]\[(equals|not_equals|not_in)\]$/)
      if (!match) throw new Error(`Filtro inesperado: ${key}`)
      const atual = String(doc[match[1]!])
      return match[2] === 'equals' ? atual === value
        : match[2] === 'not_equals' ? atual !== value : !value.split(',').includes(atual)
    }))
    const pagina = Number(url.searchParams.get('page') ?? 1)
    const limite = Number(url.searchParams.get('limit') ?? 10)
    const campos = [...url.searchParams.keys()].flatMap(key => key.match(/^select\[(.+)\]$/)?.[1] ?? [])
    const docs = filtrados.slice((pagina - 1) * limite, pagina * limite).map(doc => campos.length
      ? Object.fromEntries(Object.entries(doc).filter(([key]) => key === 'id' || campos.includes(key))) : doc)
    return Response.json({ docs, totalDocs: filtrados.length, totalPages: Math.max(1, Math.ceil(filtrados.length / limite)) })
  }))
}

beforeEach(() => {
  consultas.length = 0
  vi.stubEnv('CMS_URL', 'https://cms.example.test')
  vi.stubEnv('CMS_API_KEY', '')
  vi.stubEnv('CMS_SERVICE_REQUIRED', '')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it.each(['posts', 'pages', 'ofertas', 'produtos'])('preserva _status e filtros extras em %s com drafts', async colecao => {
  cms({ [colecao]: [
    { id: 1, tenant: 1, slug: 'publicado', _status: 'published', template: 'conteudo', updatedAt: '2026-10-01' },
    { id: 2, tenant: 1, slug: 'rascunho', _status: 'draft', template: 'conteudo' },
    { id: 3, tenant: 1, slug: 'fora', _status: 'published', template: 'ficha' },
    { id: 4, tenant: 2, slug: 'outro-tenant', _status: 'published', template: 'conteudo' },
  ] })
  expect(await listarParaSitemap(colecao, 1, 'updatedAt', [
    { campo: 'template', operador: 'not_in', valor: 'ficha,indice' },
  ])).toEqual([{ id: 1, slug: 'publicado', lastmod: '2026-10-01', wordpress_id: null }])
  expect(consultas[0]!.searchParams.get('where[and][1][_status][equals]')).toBe('published')
  expect(consultas[0]!.searchParams.get('where[and][2][template][not_in]')).toBe('ficha,indice')
})

it('gera sitemap sem REST 400: físico published/indexável, sem draft/noindex e com precedência sobre o legado', async () => {
  cms({
    produtos: [
      { id: 1, tenant: 1, slug: 'legado', _status: 'published', indexavel: true },
      { id: 2, tenant: 1, slug: 'mesmo-slug', _status: 'published', indexavel: true },
      { id: 3, tenant: 1, slug: 'legado-draft', _status: 'draft', indexavel: true },
      { id: 4, tenant: 1, slug: 'legado-noindex', _status: 'published', indexavel: false },
    ],
    produtos_fisicos: [
      { id: 1, tenant: 1, slug: 'fisico', estado: 'published', indexavel: true, updatedAt: '2026-10-01' },
      { id: 2, tenant: 1, slug: 'mesmo-slug', estado: 'published', indexavel: false },
      { id: 3, tenant: 1, slug: 'fisico-draft', estado: 'draft', indexavel: true },
      { id: 4, tenant: 1, slug: 'fisico-review', estado: 'review', indexavel: true },
      { id: 5, tenant: 1, slug: 'sem-flag', estado: 'published', indexavel: null },
      { id: 6, tenant: 2, slug: 'outro-tenant', estado: 'published', indexavel: true },
    ],
  })
  const result = await sitemaps.catalogo!(tenant, 'https://site.example')
  expect(result).toEqual([
    { loc: 'https://site.example/p/legado/', lastmod: null },
    { loc: 'https://site.example/p/fisico/', lastmod: '2026-10-01' },
  ])
  expect(urlset(result)).toContain('<lastmod>2026-10-01</lastmod>')
  const fisicos = consultas.filter(url => url.pathname === '/api/produtos_fisicos')
  expect(fisicos).toHaveLength(2)
  for (const url of fisicos) {
    expect([...url.searchParams.keys()].some(key => key.includes('[_status]'))).toBe(false)
    expect(url.searchParams.get('where[and][1][estado][equals]')).toBe('published')
    expect(url.searchParams.get('where[and][0][tenant][equals]')).toBe('1')
  }
  expect(fisicos.map(url => url.searchParams.get('where[and][2][indexavel][equals]'))).toEqual([null, 'true'])
})

it('mantém filtros e projeção nas páginas seguintes do catálogo físico', async () => {
  cms({ produtos_fisicos: Array.from({ length: 501 }, (_, id) => ({
    id, tenant: 1, slug: `fisico-${id}`, estado: 'published', indexavel: true, updatedAt: '2026-10-01',
  })) })
  const result = await sitemaps.catalogo!(tenant, 'https://site.example')
  expect(result).toHaveLength(501)
  expect(result.at(-1)).toEqual({ loc: 'https://site.example/p/fisico-500/', lastmod: '2026-10-01' })
  const fisicos = consultas.filter(url => url.pathname === '/api/produtos_fisicos')
  expect(fisicos.map(url => url.searchParams.get('page')).sort()).toEqual(['1', '1', '2', '2'])
  for (const url of fisicos) {
    expect(url.searchParams.get('where[and][1][estado][equals]')).toBe('published')
    expect(url.searchParams.get('where[and][0][tenant][equals]')).toBe('1')
    expect([...url.searchParams.keys()].some(key => key.includes('[_status]'))).toBe(false)
    expect(url.searchParams.get('limit')).toBe('500')
    expect(url.searchParams.get('depth')).toBe('0')
    expect(url.searchParams.get('select[slug]')).toBe('true')
    expect(url.searchParams.get('select[updatedAt]')).toBe('true')
  }
})
