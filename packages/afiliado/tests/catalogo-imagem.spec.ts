import { describe, expect, it, vi } from 'vitest'

const fetchCms = vi.hoisted(() => vi.fn())
vi.mock('../src/web/lib/cms', () => ({ cmsFetch: fetchCms, urlMidia: (url: string) => url }))
vi.mock('@maicon-ramos-org/editorial/lib/ambiente', () => ({ variavel: () => 'exemplo-20' }))

import { getCatalogoProduto, imagemProduto } from '../src/web/lib/catalogo'

describe('leitura pública da imagem do produto', () => {
  it('resolve mídia com depth 1 e mantém isolamento do tenant', async () => {
    fetchCms.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/produtos_fisicos?')) return { docs: [{ id: 5, tenant: { id: 3 },
        nome: 'Produto', slug: 'produto', marca: 'Marca', modelo: 'M1', estado: 'published',
        imagem: { url: 'https://media.example/produto.jpg', alt: 'Produto', width: 1200, height: 800 } }] }
      return { docs: [] }
    })
    const result = await getCatalogoProduto(3, 'produto')
    expect(result).not.toBeNull()
    expect(imagemProduto(result!.produto)).toMatchObject({ url: 'https://media.example/produto.jpg' })
    const caminhoConsultado = String(fetchCms.mock.calls[0]?.[0] ?? '')
    expect(caminhoConsultado).toContain('depth=1')
    expect(caminhoConsultado).toContain('tenant')
    expect(await getCatalogoProduto(4, 'produto')).toBeNull()
  })
})
