import { expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ listar: vi.fn() }))
vi.mock('../src/web/lib/cms', () => ({
  cmsCategoriasOferta: async () => [], getLojas: async () => [], lojasComOferta: async () => new Set(),
  listarParaSitemap: mocks.listar,
}))
vi.mock('../src/web/lib/links-de-afiliado', () => ({ ehLinkDeAfiliado: () => false }))

import { sitemaps } from '../src/web/extensao'

it('indexa o produto físico publicado com flag e respeita a precedência de /p sobre o legado', async () => {
  mocks.listar.mockImplementation(async (collection: string, _tenant: number, _date: string, filters?: Array<{ campo: string; valor: string }>) => {
    if (collection === 'produtos') return [{ slug: 'mesmo-slug', lastmod: '2026-09-01' }, { slug: 'legado', lastmod: null }]
    if (collection === 'produtos_fisicos' && filters?.some(f => f.campo === 'indexavel')) return [{ slug: 'fisico', lastmod: '2026-10-01' }]
    return [{ slug: 'mesmo-slug', lastmod: null }, { slug: 'fisico', lastmod: '2026-10-01' }]
  })
  const result = await sitemaps.catalogo!({ id: 1 } as never, 'https://site.example')
  expect(result.map(item => item.loc)).toEqual(['https://site.example/p/legado/', 'https://site.example/p/fisico/'])
  expect(mocks.listar).toHaveBeenCalledWith('produtos_fisicos', 1, 'updatedAt', [
    { campo: 'estado', operador: 'equals', valor: 'published' },
    { campo: 'indexavel', operador: 'equals', valor: 'true' },
  ])
})
