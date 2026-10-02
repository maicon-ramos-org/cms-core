import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fichaDoCatalogo, schemaProduto } from '../src/web/lib/catalogo'
import { produtoFisicoPublicoJson } from '../src/web/lib/publico-json'
import { fichaMarkdown } from '../src/conteudo'
import { ofertaFixture, produtoFixture, tenant, variantesFixture } from './fixtures/produto/dados'

vi.mock('../src/web/lib/cms', () => ({ urlMidia: (url: string) => new URL(url, 'https://media.example.test').href, cmsFetch: vi.fn() }))
vi.mock('../src/web/lib/links-de-afiliado', () => ({ ehLinkDeAfiliado: () => false }))
const catalogo = { produto: produtoFixture, variantes: variantesFixture, ofertas: [ofertaFixture] }
const canonical = 'https://site.example.test/p/produto/'
beforeEach(() => vi.stubEnv('AMAZON_TAG', 'exemplo-20'))
afterEach(() => vi.unstubAllEnvs())

describe('produto físico → ficha compartilhada', () => {
  it('reutiliza o DTO canônico com imagem, especificações, FAQ, prós/contras e variantes separadas', () => {
    const dto = fichaDoCatalogo(catalogo, tenant.id)!
    expect(dto).toMatchObject({ schema: 'monetizable_content/v1', kind: 'product',
      identity: { tenantId: '7', id: '5', source: 'product' },
      editorial: { name: produtoFixture.nome, brand: 'Fabricante', model: 'M1', indexable: true,
        identifiers: { gtin: '7891234567895', mpn: 'M1-PT' }, specifications: [{ name: 'Peso', value: '500 g' }],
        image: { url: 'https://media.example.test/equipamento.jpg' },
        content: { summary: produtoFixture.resumo, descriptionMarkdown: produtoFixture.descricao_markdown,
          metaTitle: produtoFixture.meta_title, metaDescription: produtoFixture.meta_description,
          faq: [{ question: 'Serve em casa?', answer: 'Conforme as especificações.' }] } },
      monetization: { variants: [{ id: '4', name: 'Preto' }, { id: '6', name: 'Branco' }],
        listings: [{ id: '9', variantId: '4', price: null, availability: 'unknown',
          affiliateUrl: ofertaFixture.url_afiliado, observedAt: '2026-09-26T10:00:00.000Z' }] } })
    expect(dto.editorial.prosCons).toHaveLength(2)
  })
  it('mudar listing/variante não altera editorial e não injeta preço, cupom ou dados brutos', () => {
    const antes = fichaDoCatalogo(catalogo, 7)!
    const alterado = fichaDoCatalogo({ ...catalogo, variantes: [{ ...variantesFixture[0]!, nome: 'Outro acabamento' }],
      ofertas: [{ ...ofertaFixture, observado_em: '2026-09-27T10:00:00Z',
        url_afiliado: 'https://www.amazon.com.br/dp/B0ABCDEFGH?tag=exemplo-20' }] }, 7)!
    expect(alterado.editorial).toEqual(antes.editorial)
    expect(alterado.monetization).not.toEqual(antes.monetization)
    expect(JSON.stringify(antes.editorial)).not.toMatch(/amazon|exemplo-20|2026-09-26|seller|price|coupon/)
    expect(JSON.stringify(antes)).not.toMatch(/url_origem|external_listing_id|amazon-manual/)
  })
  it('produto sem listings continua publicado/indexável, sem Offer inventado', () => {
    const dto = fichaDoCatalogo({ ...catalogo, ofertas: [] }, 7)!
    expect(dto.editorial.indexable).toBe(true)
    expect(dto.monetization.listings).toEqual([])
    expect(schemaProduto({ ...catalogo, ofertas: [] }, canonical, dto)[0]).not.toHaveProperty('offers')
    expect(dto.editorial.content.descriptionMarkdown).toBe(produtoFixture.descricao_markdown)
  })
  it('não exige FAQ, aprovação editorial ou indexação para ler produto publicado', () => {
    const dto = fichaDoCatalogo({ produto: { id: 1, tenant: 7, nome: 'Sem texto', slug: 'sem-texto',
      marca: '', modelo: '', estado: 'published', indexavel: false }, variantes: [], ofertas: [] }, 7)!
    expect(dto.editorial).toMatchObject({ indexable: false, status: 'desconhecido',
      content: { descriptionMarkdown: null, faq: [], highlights: [] } })
    expect(fichaMarkdown(dto)).not.toMatch(/undefined|null|Marca:|Modelo:/)
  })
  it('recusa outro tenant, produto draft e versão ainda em draft', () => {
    expect(fichaDoCatalogo(catalogo, 8)).toBeNull()
    expect(fichaDoCatalogo({ ...catalogo, produto: { ...produtoFixture, estado: 'draft' } }, 7)).toBeNull()
    expect(fichaDoCatalogo({ ...catalogo, produto: { ...produtoFixture, _status: 'draft' } }, 7)).toBeNull()
  })
  it('descarta variantes de outro tenant/produto ou não confirmadas e seus listings', () => {
    for (const variante of [{ ...variantesFixture[0]!, tenant: 8 }, { ...variantesFixture[0]!, produto: 8 },
      { ...variantesFixture[0]!, estado: 'incerta' }]) {
      const dto = fichaDoCatalogo({ ...catalogo, variantes: [variante] }, 7)!
      expect(dto.monetization).toMatchObject({ variants: [], listings: [] })
    }
  })
  it('descarta listing de outro tenant, outra variante ou encerrado', () => {
    for (const oferta of [{ ...ofertaFixture, tenant: 8 }, { ...ofertaFixture, variante: 99 },
      { ...ofertaFixture, estado: 'encerrada' }]) {
      expect(fichaDoCatalogo({ ...catalogo, ofertas: [oferta] }, 7)!.monetization.listings).toEqual([])
    }
  })
  it.each([
    { url_afiliado: 'https://www.amazon.com.br/dp/B0ABCDEFGH?tag=outro-20' },
    { url_afiliado: 'https://externo.example.test/click' },
    { observado_em: 'inválido' }, { observado_em: '2099-01-01T00:00:00Z' },
  ])('preserva a política comercial existente para link inválido: %j', change => {
    expect(fichaDoCatalogo({ ...catalogo, ofertas: [{ ...ofertaFixture, ...change }] }, 7)!.monetization.listings).toEqual([])
  })
  it('JSON e Markdown usam o mesmo conteúdo; schema não fabrica Offer ou avaliação', () => {
    const dto = fichaDoCatalogo(catalogo, 7)!
    const json = produtoFisicoPublicoJson(tenant, produtoFixture, catalogo.ofertas, dto)!
    const md = fichaMarkdown(dto), graph = schemaProduto(catalogo, canonical, dto)
    expect(json).toMatchObject({ title: dto.editorial.name, summary: dto.editorial.content.summary,
      descriptionMarkdown: dto.editorial.content.descriptionMarkdown, specifications: dto.editorial.specifications,
      prosCons: dto.editorial.prosCons, indexable: true, price: null,
      offers: [{ href: ofertaFixture.url_afiliado }] })
    for (const text of ['Equipamento exemplo', 'Uso simples', 'Peso', '500 g', 'Serve em casa?', 'Vantagem editorial']) expect(md).toContain(text)
    expect(graph[0]).toMatchObject({ name: json.title, brand: { name: json.brand }, model: json.model,
      image: json.image?.url, gtin: '7891234567895', mpn: 'M1-PT' })
    for (const prop of ['offers', 'aggregateRating', 'review']) expect(graph[0]).not.toHaveProperty(prop)
    expect(md).not.toContain('exemplo-20')
  })
  it('a projeção JSON não aceita documento/ficha de outro tenant, estado ou identidade', () => {
    const dto = fichaDoCatalogo(catalogo, 7)!
    expect(produtoFisicoPublicoJson({ ...tenant, id: 8 }, produtoFixture, catalogo.ofertas, dto)).toBeNull()
    expect(produtoFisicoPublicoJson(tenant, { ...produtoFixture, estado: 'draft' }, [], dto)).toBeNull()
    expect(produtoFisicoPublicoJson(tenant, { ...produtoFixture, _status: 'draft' }, [], dto)).toBeNull()
    expect(produtoFisicoPublicoJson(tenant, produtoFixture, [], { ...dto, identity: { ...dto.identity, source: 'offer' } })).toBeNull()
    expect(produtoFisicoPublicoJson(tenant, produtoFixture, [], { ...dto, slug: 'outra' })).toBeNull()
  })
  it('não modifica os documentos comerciais/editoriais de origem', () => {
    const original = JSON.stringify(catalogo)
    const dto = fichaDoCatalogo(catalogo, 7)!
    dto.monetization.variants![0]!.name = 'Modificado'
    dto.editorial.content.highlights.push('Modificado')
    expect(JSON.stringify(catalogo)).toBe(original)
  })
})
