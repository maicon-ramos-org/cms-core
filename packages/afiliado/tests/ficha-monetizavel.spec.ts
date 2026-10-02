import { describe, expect, it } from 'vitest'
import { fichaDeOferta, fichaDeProduto, fichaMarkdown, fichaMarkdownHtml, fichaProdutoJsonLd, FICHA_SCHEMA,
  type ListingFichaFonte, type OfertaFichaFonte, type ProdutoFichaFonte } from '../src/conteudo'

const produto: ProdutoFichaFonte = {
  id: 10, tenant: { id: 7 }, slug: 'equipamento-exemplo', nome: 'Equipamento Exemplo',
  marca: 'Fabricante', modelo: 'M-1', categoria: 'equipamento', estado: 'published', indexavel: true,
  editorial_status: 'aprovado', resumo: 'Resumo editorial.', descricao_markdown: '## Análise\n\nTexto aprovado.',
  meta_title: 'Equipamento M-1', meta_description: 'Descrição editorial.', destaques: ['Uso simples'],
  faq: [{ pergunta: 'Como usar?', resposta: 'Conforme o manual.' }], gtin: '7891234567895', mpn: 'FAB-1',
  especificacoes_editoriais: [{ rotulo: 'Material', valor: 'Metal' }],
  imagem: { url: 'https://media.example.test/foto.jpg', alt: 'Equipamento' },
  pros_contras: [{ tipo: 'pro', texto: 'Uso simples' }, { tipo: 'con', texto: 'Ocupa espaço' }],
}
const oferta: OfertaFichaFonte = {
  id: 20, tenant: 7, slug: produto.slug, nome: produto.nome, estado: 'ativa', _status: 'published', programa: 'loja-exemplo',
  marca: produto.marca, modelo: produto.modelo, categoria: produto.categoria, indexavel: true,
  editorial_status: produto.editorial_status, resumo: produto.resumo, analise_md: produto.descricao_markdown,
  meta_title: produto.meta_title, meta_description: produto.meta_description, destaques: produto.destaques,
  faq: produto.faq, gtin: produto.gtin, mpn: produto.mpn,
  especificacoes: [{ rotulo: 'Material', valor: 'Metal' }],
  imagem_comercial: { url: 'https://media.example.test/foto.jpg', alt: 'Equipamento' }, pros_contras: produto.pros_contras,
}
const listing: ListingFichaFonte = {
  id: 30, tenant: { id: 7 }, seller: { id: 40, name: 'Loja Exemplo', url: 'https://loja.example.test/' },
  price: { amount: '039.90', currency: 'BRL' }, availability: 'in-stock',
  coupon: { code: 'EXEMPLO10', url: '/cupons/exemplo/', expiresAt: '2026-11-01T00:00:00Z' },
  affiliateUrl: 'https://loja.example.test/p/m-1?tag=editorial&sku=a%2Fb&utm_source=agent',
  observedAt: '2026-10-02T12:00:00Z',
}
const opcoes = { tenantId: 7, listings: [listing] }

describe('ficha monetizável compartilhada', () => {
  it('produto físico e oferta editorial equivalentes geram a mesma estrutura editorial', () => {
    const p = fichaDeProduto(produto, opcoes)!, o = fichaDeOferta(oferta, { ...opcoes, kind: 'product' })!
    expect(p.schema).toBe(FICHA_SCHEMA)
    expect(p.editorial).toEqual(o.editorial)
    expect(p.monetization).toEqual(o.monetization)
    expect(fichaMarkdown(p)).toBe(fichaMarkdown(o))
    expect(fichaMarkdownHtml(p)).toBe(fichaMarkdownHtml(o))
    expect(fichaProdutoJsonLd(p, { canonical: 'https://example.test/p/exemplo/' }))
      .toEqual(fichaProdutoJsonLd(o, { canonical: 'https://example.test/p/exemplo/' }))
  })
  it('ids de collections distintas têm namespace, mesmo quando o número coincide', () => {
    const p = fichaDeProduto(produto, opcoes)!, o = fichaDeOferta({ ...oferta, id: 10 }, opcoes)!
    expect(p.identity).toEqual({ tenantId: '7', id: '10', source: 'product' })
    expect(o.identity).toEqual({ tenantId: '7', id: '10', source: 'offer' })
    expect(o.identity).not.toEqual(p.identity)
  })
  it('alterar preço, seller, disponibilidade, cupom, link e observação não altera análise nem serializers editoriais', () => {
    const a = fichaDeProduto(produto, opcoes)!
    const b = fichaDeProduto(produto, { ...opcoes, listings: [{ ...listing,
      price: { amount: '59.00', currency: 'BRL' }, seller: { name: 'Outra Loja' }, availability: 'out-of-stock',
      coupon: { code: 'OUTRO' }, affiliateUrl: '/r/oferta-2?ref=editorial', observedAt: '2026-10-03T12:00:00Z' }] })!
    expect(b.editorial).toEqual(a.editorial)
    expect(b.monetization).not.toEqual(a.monetization)
    expect(fichaMarkdown(b)).toBe(fichaMarkdown(a))
    expect(fichaProdutoJsonLd(b, { canonical: 'https://example.test/p/exemplo/' }))
      .toEqual(fichaProdutoJsonLd(a, { canonical: 'https://example.test/p/exemplo/' }))
    expect(JSON.stringify(a.editorial)).not.toMatch(/39\.90|EXEMPLO10|Loja Exemplo|utm_source|observedAt/)
  })
  it('não publica preços, destinos privados, comissões ou evidências brutas do documento da oferta', () => {
    const fonte = { ...oferta, preco: '79.00', url_afiliado: 'https://interno.example.test/',
      comissao_taxa: '0.77', comissao_estimada: '9.99', evidencia_comercial: { vendas: 8888 },
      origem: 'referencia-interna' }
    const dto = fichaDeOferta(fonte, { tenantId: 7 })!
    expect(dto.monetization.listings).toEqual([])
    expect(JSON.stringify(dto)).not.toMatch(/79\.00|interno\.example|0\.77|9\.99|8888|referencia-interna/)
  })
  it('mantém valores comerciais somente no bloco explícito e preserva query string dos links', () => {
    const commerce = fichaDeOferta(oferta, opcoes)!.monetization.listings[0]!
    expect(commerce).toMatchObject({ id: '30', price: { amount: '39.90', currency: 'BRL' },
      seller: { id: '40', name: 'Loja Exemplo' }, availability: 'in-stock',
      coupon: { code: 'EXEMPLO10', url: '/cupons/exemplo/', expiresAt: '2026-11-01T00:00:00.000Z' },
      observedAt: '2026-10-02T12:00:00.000Z' })
    expect(commerce.affiliateUrl).toBe(listing.affiliateUrl)
  })
  it('filtra documentos, listings de outro tenant e ids ausentes', () => {
    expect(fichaDeProduto(produto, { tenantId: 8 })).toBeNull()
    expect(fichaDeOferta(oferta, { tenantId: 8 })).toBeNull()
    expect(fichaDeProduto({ ...produto, tenant: '' }, { tenantId: '' })).toBeNull()
    expect(fichaDeOferta({ ...oferta, id: '' }, opcoes)).toBeNull()
    expect(fichaDeProduto(produto, { ...opcoes, listings: [listing, { ...listing, tenant: 8 }, { ...listing, id: '' }] })!
      .monetization.listings).toHaveLength(1)
  })
  it('não adapta drafts para leitura pública, sem exigir aprovação editorial', () => {
    expect(fichaDeProduto({ ...produto, estado: 'draft' }, opcoes)).toBeNull()
    expect(fichaDeProduto({ ...produto, _status: 'draft' }, opcoes)).toBeNull()
    expect(fichaDeOferta({ ...oferta, _status: 'draft' }, opcoes)).toBeNull()
    expect(fichaDeOferta({ ...oferta, _status: undefined }, opcoes)).toBeNull()
  })
  it('FAQ, revisão e estado comercial não são portões de indexação', () => {
    const p = fichaDeProduto({ ...produto, faq: [], editorial_status: 'em_revisao' }, opcoes)!
    const o = fichaDeOferta({ ...oferta, faq: [], editorial_status: undefined, estado: 'pausada' }, opcoes)!
    expect(p.editorial).toMatchObject({ status: 'em_revisao', indexable: true, content: { faq: [] } })
    expect(o.editorial).toMatchObject({ status: 'desconhecido', indexable: true, content: { faq: [] } })
    expect(fichaDeOferta({ ...oferta, indexavel: undefined }, opcoes)!.editorial.indexable).toBe(false)
    expect(fichaDeProduto({ ...produto, indexavel: false }, opcoes)!.editorial.indexable).toBe(false)
  })
  it('não inventa marca, modelo, SEO, FAQ, identificadores, disponibilidade ou observação', () => {
    const dto = fichaDeOferta({ id: 1, tenant: 7, nome: 'Serviço', slug: 'servico', estado: 'ativa',
      _status: 'published', programa: 'loja-exemplo', atualizado_na_origem: '2026-10-02T12:00:00Z' },
    { tenantId: 7, kind: 'service', listings: [{ id: 2, tenant: 7 }] })!
    expect(dto.editorial).toMatchObject({ brand: null, model: null, status: 'desconhecido', indexable: false,
      identifiers: { gtin: null, mpn: null }, specifications: [], prosCons: [],
      content: { metaTitle: null, metaDescription: null, summary: null, descriptionMarkdown: null, faq: [], highlights: [] } })
    expect(dto.monetization.listings[0]).toMatchObject({ price: null, seller: null, coupon: null,
      availability: 'unknown', observedAt: null })
  })
  it('lê só especificações editoriais do produto, sem publicar o JSON bruto de identidade', () => {
    const dto = fichaDeProduto({ ...produto, especificacoes: { segredo_de_fabrica: 'identidade-interna' } }, opcoes)!
    expect(dto.editorial.specifications).toEqual([{ name: 'Material', value: 'Metal' }])
    expect(JSON.stringify(dto)).not.toContain('identidade-interna')
  })
  it('prefere conteúdo estruturado ao legado e não reescreve o texto aprovado pelo pipeline externo', () => {
    const dto = fichaDeOferta({ ...oferta, analise_md: 'legado', descricao_markdown: 'Análise aprovada: R$ 99 no lançamento.' }, opcoes)!
    expect(dto.editorial.content.descriptionMarkdown).toBe('Análise aprovada: R$ 99 no lançamento.')
    const legado = fichaDeProduto({ id: 1, tenant: 7, nome: 'Legado', slug: 'legado', marca: '', modelo: '',
      estado: 'published', descricao: 'Descrição anterior.' }, { tenantId: 7 })!
    expect(legado.editorial.content.descriptionMarkdown).toBe('Descrição anterior.')
  })
  it('aceita mídia resolvida e publica só URL, alt e dimensões válidas', () => {
    const dto = fichaDeProduto({ ...produto, imagem: 99 }, { ...opcoes,
      image: { url: 'https://media.example.test/resolvida.jpg', width: 1200, height: 800 } })!
    expect(dto.editorial.image).toEqual({ url: 'https://media.example.test/resolvida.jpg', alt: produto.nome, width: 1200, height: 800 })
    expect(fichaDeProduto({ ...produto, imagem: 99 }, opcoes)!.editorial.image).toBeNull()
    expect(fichaDeProduto(produto, { ...opcoes, image: null })!.editorial.image).toBeNull()
    expect(fichaDeOferta({ ...oferta, imagem_comercial: { url: 'javascript:alert(1)' } }, opcoes)!.editorial.image).toBeNull()
  })
  it('não determina template, layout ou rota canônica no contrato', () => {
    const dto = fichaDeOferta(oferta, { ...opcoes, kind: 'software' })!
    expect(dto.kind).toBe('software')
    expect(dto).not.toHaveProperty('layout')
    expect(dto).not.toHaveProperty('template')
    expect(dto).not.toHaveProperty('canonicalUrl')
    // Dois consumidores podem apresentar os mesmos dados sem modificar a ficha.
    const compact = (ficha: typeof dto) => `<aside>${ficha.editorial.name}</aside>`
    const expanded = (ficha: typeof dto) => `<article>${ficha.editorial.name}</article>`
    expect(compact(dto)).not.toBe(expanded(dto))
  })
  it('não modifica o documento nem listings recebidos', () => {
    const antes = JSON.stringify({ produto, oferta, opcoes })
    const p = fichaDeProduto(produto, opcoes)!, o = fichaDeOferta(oferta, opcoes)!
    p.monetization.listings[0]!.coupon!.code = 'MODIFICADO'
    o.editorial.specifications[0]!.name = 'Alterado'
    expect(JSON.stringify({ produto, oferta, opcoes })).toBe(antes)
  })
})

describe('serialização compartilhada e segurança estrutural', () => {
  it('reutiliza Markdown/HTML, preservando prós e contras e escapando HTML perigoso', () => {
    const dto = fichaDeOferta({ ...oferta, analise_md: '## Corpo\n\n<script>alert(1)</script>',
      pros_contras: [{ tipo: 'con', texto: 'Limitação real' }] }, { tenantId: 7 })!
    expect(fichaMarkdown(dto)).toContain('- **Contra:** Limitação real')
    expect(fichaMarkdownHtml(dto)).toContain('<h2>Corpo</h2>')
    expect(fichaMarkdownHtml(dto)).not.toContain('<script>')
    expect(dto.editorial.content.highlights).toEqual(['Uso simples'])
  })
  it('software e serviço não recebem Product JSON-LD e não ganham rótulos vazios de marca/modelo', () => {
    for (const kind of ['software', 'service', 'other'] as const) {
      const dto = fichaDeOferta({ ...oferta, marca: undefined, modelo: undefined }, { tenantId: 7, kind })!
      expect(fichaProdutoJsonLd(dto, { canonical: 'https://example.test/ficha/' })).toBeNull()
      expect(fichaMarkdown(dto)).not.toMatch(/\*\*Marca:|\*\*Modelo:/)
    }
  })
  it('produto reutiliza imagem/identificadores e só recebe Offer no JSON-LD quando fornecido explicitamente', () => {
    const dto = fichaDeProduto(produto, opcoes)!
    const ld = fichaProdutoJsonLd(dto, { canonical: 'https://example.test/p/exemplo/' })!
    expect(ld['@graph'][0]).toMatchObject({ '@type': 'Product', gtin: '7891234567895', image: 'https://media.example.test/foto.jpg' })
    expect(ld['@graph'][0]).not.toHaveProperty('offers')
    expect(ld['@graph'][0]).not.toHaveProperty('aggregateRating')
    const comOferta = fichaProdutoJsonLd(dto, { canonical: 'https://example.test/p/exemplo/',
      ofertas: [{ url: listing.affiliateUrl!, price: 39.90, priceCurrency: 'BRL' }] })!
    expect(comOferta['@graph'][0]).toHaveProperty('offers')
  })
  it('não publica campos de marca/modelo vazios no Product JSON-LD', () => {
    const dto = fichaDeProduto({ ...produto, marca: '', modelo: '' }, opcoes)!
    const ld = fichaProdutoJsonLd(dto, { canonical: 'https://example.test/p/exemplo/' })!
    expect(ld['@graph'][0]).not.toHaveProperty('brand')
    expect(ld['@graph'][0]).not.toHaveProperty('model')
  })
  it.each(['javascript:alert(1)', '//externo.example.test/', '/\\externo.example.test/', '/r/\nexterno',
    'https://user:pass@example.test/'])('rejeita destino inseguro: %s', affiliateUrl => {
    const dto = fichaDeProduto(produto, { ...opcoes, listings: [{ ...listing, affiliateUrl }] })!
    expect(dto.monetization.listings[0]!.affiliateUrl).toBeNull()
  })
  it.each(['-1.00', 'abc', '1.234', 'Infinity'])('não publica preço decimal inválido: %s', amount => {
    const dto = fichaDeProduto(produto, { ...opcoes, listings: [{ ...listing, price: { amount, currency: 'BRL' } }] })!
    expect(dto.monetization.listings[0]!.price).toBeNull()
  })
  it('datas inválidas não viram datas atuais nem preço desconhecido vira zero', () => {
    const dto = fichaDeProduto(produto, { ...opcoes, listings: [{ id: 2, tenant: 7, observedAt: 'inválido',
      coupon: { code: 'TESTE', expiresAt: 'inválido' } }] })!
    expect(dto.monetization.listings[0]).toMatchObject({ price: null, observedAt: null, coupon: { expiresAt: null } })
  })
})
