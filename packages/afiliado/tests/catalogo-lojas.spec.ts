import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const fetchCms = vi.hoisted(() => vi.fn())
vi.mock('../src/web/lib/cms', () => ({ cmsFetch: fetchCms, urlMidia: (url: string) => url }))
import { fichaDoCatalogo, getCatalogoProduto } from '../src/web/lib/catalogo'
import { ofertaFixture, produtoFixture, variantesFixture } from './fixtures/produto/dados'

beforeEach(() => vi.stubEnv('AMAZON_TAG', 'exemplo-20'))
afterEach(() => { vi.unstubAllEnvs(); fetchCms.mockReset() })

describe('nome da loja na ficha pública do produto', () => {
  it('resolve loja com o listing sem criar uma consulta por cartão', async () => {
    fetchCms.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/produtos_fisicos?')) return { docs: [produtoFixture] }
      if (path.startsWith('/api/variantes_produto?')) return { docs: variantesFixture }
      return { docs: [{ ...ofertaFixture, tenant: { id: 7 }, variante: { id: 4 },
        loja: { id: 2, tenant: { id: 7 }, nome: 'Amazon Brasil', programa: 'amazon' } }] }
    })
    const catalogo = await getCatalogoProduto(7, 'produto')
    expect(fichaDoCatalogo(catalogo!, 7)!.monetization.listings[0]?.seller).toMatchObject({ id: '2', name: 'Amazon Brasil' })
    expect(fichaDoCatalogo(catalogo!, 7)!.monetization.listings[0]?.variantId).toBe('4')
    expect(fetchCms).toHaveBeenCalledTimes(3)
    expect(String(fetchCms.mock.calls[2]?.[0])).toContain('depth=1')
  })
  it('não usa loja populada de outro tenant para monetizar a ficha', () => {
    const catalogo = { produto: produtoFixture, variantes: variantesFixture,
      ofertas: [{ ...ofertaFixture, loja: { id: 2, tenant: 8, nome: 'Loja de outro tenant', programa: 'amazon' } }] }
    expect(fichaDoCatalogo(catalogo, 7)!.monetization.listings).toEqual([])
  })
})
