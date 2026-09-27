import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ofertaPublicaJson, produtoFisicoPublicoJson, produtoPublicoJson } from '../src/web/lib/publico-json'
import type { OfertaDTO, ProdutoDTO } from '../src/web/lib/cms'

const tenant = { canonical_host: 'site.example' }
const offer = { id: 4, slug: 'oferta', titulo: 'Oferta', tipo: 'desconto_api',
  resumo: 'Resumo útil', preco: { valor: 120, moeda: 'BRL', preco_em: '2026-09-26T10:00:00Z' },
  desconto_loja: { valor: 20, tipo: 'percentual', verificado_em: '2026-09-26T10:00:00Z' },
  loja: { id: 2, nome: 'Loja', slug: 'loja', url_site: 'https://afiliado.example/?token=privado', programa: 'outro' },
  cupom: { id: 3, codigo: 'SEGREDO10', estado: 'publicado', desconto_tipo: 'percentual', desconto_valor: 10,
    verificado_em: '2026-09-26T10:00:00Z', url_afiliado_fonte: 'https://afiliado.example/cupom?token=privado' },
  url_afiliado_fonte: 'https://afiliado.example/oferta?token=privado',
  comissao: '100', raw: { token: 'privado' },
} as unknown as OfertaDTO

describe('JSON comercial público: allowlist, data e CTA interno', () => {
  it('oferta nunca expõe destino, comissão ou literal do cupom', () => {
    const result = ofertaPublicaJson(tenant, offer, '/ofertas/oferta/')
    expect(result).toMatchObject({ url: 'https://site.example/ofertas/oferta/', contentType: 'offer',
      price: { value: 120, observedAt: '2026-09-26T10:00:00.000Z' },
      coupon: { discount: { value: 10 } }, action: { href: '/r/o4?ref=json' } })
    const serialized = JSON.stringify(result)
    for (const forbidden of ['SEGREDO10', 'afiliado.example', 'privado', 'comissao', 'raw']) expect(serialized).not.toContain(forbidden)
  })

  it('preço e desconto sem data não viram afirmação pública; resumo com URL não vaza', () => {
    const result = ofertaPublicaJson(tenant, { ...offer, resumo: 'Veja https://afiliado.example/p',
      preco: { valor: 120, moeda: 'BRL' }, desconto_loja: { valor: 40, tipo: 'percentual' } }, '/apps/oferta/')
    expect(result.price).toBeNull()
    expect(result.storeDiscount).toBeNull()
    expect(result.summary).toBeNull()
    expect(result.url).toBe('https://site.example/apps/oferta/')
  })

  it('produto legado e físico preservam indexação e preço honesto', () => {
    const product = { id: 9, slug: 'produto', titulo: 'Produto', estado: 'landing', indexavel: false,
      preco: 200, preco_em: null, url_afiliado_fonte: 'https://afiliado.example/p?token=privado' } as ProdutoDTO
    const legacy = produtoPublicoJson(tenant, product, true)
    expect(legacy).toMatchObject({ indexable: false, price: null, action: { href: '/r/p9?ref=json' } })
    const physical = produtoFisicoPublicoJson(tenant, { id: 3, tenant: 1, slug: 'fisico', nome: 'Físico',
      marca: 'Marca', modelo: 'Modelo', descricao: 'Descrição', estado: 'published' },
      [{ id: 7, tenant: 1, variante: 4, loja: 2, estado: 'ativa', fonte: 'amazon-manual-revisado',
        external_listing_id: 'ASIN', url_origem: 'https://amazon.example/p',
        url_afiliado: 'https://amazon.example/p?token=privado', observado_em: '2026-09-26T10:00:00Z' }])
    expect(physical).toMatchObject({ indexable: false, price: null, offers: [{ href: '/r/f7?ref=json' }] })
    expect(JSON.stringify(physical)).not.toContain('amazon.example')
  })
})

const mocks = vi.hoisted(() => ({ offer: vi.fn(), product: vi.fn(), physical: vi.fn() }))
vi.mock('../src/web/lib/cms', () => ({ getOfertaBySlug: mocks.offer, getProdutoBySlug: mocks.product,
  caminhoDaOferta: (value: { wordpress_id?: string }) => value.wordpress_id?.startsWith('app:')
    ? '/apps/oferta/' : '/ofertas/oferta/', PRODUTO_MONETIZAVEL: new Set(['landing', 'indexavel']) }))
vi.mock('../src/web/lib/catalogo', () => ({ getCatalogoProduto: mocks.physical }))
vi.mock('../src/web/lib/links-de-afiliado', () => ({ ehLinkDeAfiliado: (url: string) => url.includes('afiliado.example') }))
vi.mock('@maicon-ramos-org/editorial/lib/lexical', () => ({ lexicalParaTexto: () =>
  'Leia a fonte https://pesquisa.example/doc e abra https://afiliado.example/oferta?token=privado.' }))
const { GET: getOffer } = await import('../src/web/rotas/ofertas/[slug].json')
const { GET: getProduct } = await import('../src/web/rotas/p/[slug].json')
const { GET: getOfferMd } = await import('../src/web/rotas/ofertas/[slug].md')
const { GET: getProductMd } = await import('../src/web/rotas/p/[slug].md')
const setCache = vi.fn()
const context = (slug = 'oferta') => ({ params: { slug }, locals: { tenant: { id: 1, slug: 'site', canonical_host: 'site.example' } },
  cache: { enabled: true, set: setCache } }) as unknown as Parameters<typeof getOffer>[0]

beforeEach(() => { vi.clearAllMocks(); mocks.physical.mockResolvedValue(null) })

describe('rotas comerciais JSON', () => {
  it('oferta responde com canonical HTML, noindex e mesmas tags do HTML', async () => {
    mocks.offer.mockResolvedValue(offer)
    const response = await getOffer(context())
    expect(response.status).toBe(200)
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    expect(response.headers.get('link')).toBe('<https://site.example/ofertas/oferta/>; rel="canonical"')
    expect(setCache).toHaveBeenCalledWith(expect.objectContaining({ tags: ['tenant:site', 'ofertas:4', 'loja:loja', 'cupons:3'] }))
    expect(JSON.stringify(await response.json())).not.toContain('SEGREDO10')
  })

  it('/p mantém precedência física e no-store; legado só se não houver físico', async () => {
    mocks.physical.mockResolvedValueOnce({ produto: { id: 5, tenant: 1, nome: 'Físico', slug: 'oferta',
      marca: 'Marca', modelo: 'Modelo', estado: 'published' }, variantes: [], ofertas: [] })
    const physical = await getProduct(context())
    expect(physical.status).toBe(200)
    expect(physical.headers.get('cache-control')).toBe('no-store')
    expect(mocks.product).not.toHaveBeenCalled()
    expect(setCache).not.toHaveBeenCalled()
    mocks.product.mockResolvedValue({ id: 9, slug: 'oferta', titulo: 'Produto', estado: 'landing', indexavel: false,
      loja: { id: 2, nome: 'Loja', slug: 'loja' } })
    const legacy = await getProduct(context())
    expect(legacy.status).toBe(200)
    expect(setCache).toHaveBeenCalledWith(expect.objectContaining({ tags: ['tenant:site', 'produtos:9', 'loja:loja'] }))
  })

  it('produto físico tem Markdown sem preço ou destino bruto, e nunca cai no produto legado', async () => {
    mocks.physical.mockResolvedValue({ produto: { id: 5, tenant: 1, nome: 'Físico', slug: 'oferta',
      marca: 'Marca', modelo: 'Modelo', estado: 'published' }, variantes: [],
      ofertas: [{ id: 7, observado_em: '2026-09-26T10:00:00Z', url_afiliado: 'https://amazon.example/segredo' }] })
    const response = await getProductMd(context())
    const body = await response.text()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    expect(response.headers.get('link')).toBe('<https://site.example/p/oferta/>; rel="canonical"')
    expect(body).toContain('https://site.example/r/f7?ref=md')
    expect(body).not.toContain('amazon.example')
    expect(body).not.toContain('2026-09-26')
    expect(mocks.product).not.toHaveBeenCalled()
  })

  it('Markdown de AppSumo canoniza em /apps e redige destino comercial sem perder fonte externa', async () => {
    mocks.offer.mockResolvedValue({ ...offer, wordpress_id: 'app:123' })
    const response = await getOfferMd(context())
    const body = await response.text()
    expect(response.status).toBe(200)
    expect(response.headers.get('link')).toBe('<https://site.example/apps/oferta/>; rel="canonical"')
    expect(body).toContain('https://pesquisa.example/doc')
    expect(body).not.toContain('afiliado.example')
    expect(body).not.toContain('SEGREDO10')
    expect(setCache).toHaveBeenCalledWith(expect.objectContaining({ tags: ['tenant:site', 'ofertas:4', 'loja:loja', 'cupons:3'] }))
  })
})
