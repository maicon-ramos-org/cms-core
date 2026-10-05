import { describe, expect, it } from 'vitest'
import { compor } from '@maicon-ramos-org/desconto'
import { cupomDaFicha, fichaDaOfertaPublica, imagemDaFicha, schemaDaOferta } from '../src/web/lib/oferta-ficha'
import { ofertaFixture, tenant } from './fixtures/oferta/dados'
const leitura = { resolveMidia: (url: string | null | undefined) => url ? new URL(url, 'https://media.example.test').href : undefined,
  ehLinkDeAfiliado: (url: string) => url.includes('tracking.example.test'), renderHtml: true }

describe('oferta existente → ficha compartilhada', () => {
  it('adapta a oferta completa e mantém rich text/lifetime sem alterar o texto aprovado', () => {
    const dto = fichaDaOfertaPublica(ofertaFixture, tenant, leitura)!
    expect(dto).toMatchObject({ identity: { tenantId: '7', id: '4', source: 'offer' }, kind: 'software',
      editorial: { name: ofertaFixture.titulo, brand: null, model: null, content: {
        metaTitle: 'Título SEO original', metaDescription: 'Descrição original aprovada.',
        highlights: ['Benefício editorial'], verdict: 'Veredito editorial.',
        features: [{ title: 'Recurso', description: 'Descrição do recurso' }],
        inlineFaq: [{ question: 'Como funciona?', answer: 'Conforme a descrição.' }],
      } } })
    expect(dto.editorial.content.renderedHtml).toContain('<strong>Conteúdo com formatação.</strong>')
    expect(dto.editorial.content.renderedHtml).toContain('<h3 id="caracteristicas">Características</h3>')
    expect(dto.editorial.prosCons).toHaveLength(2)
    expect(cupomDaFicha(dto)).toMatchObject({ id: '3', mascara: 'LO10', desconto_valor: 10 })
    expect(JSON.stringify(dto)).not.toContain('EXEMPLO10')
  })
  it('preço, cupom e promoções ficam separados e alterações comerciais não modificam o editorial', () => {
    const a = fichaDaOfertaPublica(ofertaFixture, tenant, leitura)!
    const b = fichaDaOfertaPublica({ ...ofertaFixture, preco: { valor: 59, moeda: 'EUR' },
      cupom: { ...(ofertaFixture.cupom as object), id: 3, codigo: 'OUTRO20', estado: 'publicado', desconto_tipo: 'percentual', desconto_valor: 20 },
      dados: { ...ofertaFixture.dados, preco_antigo: 200, once: 'Outro pagamento', selos: ['Outro selo'] } }, tenant, leitura)!
    expect(a.editorial).toEqual(b.editorial)
    expect(a.monetization).not.toEqual(b.monetization)
    expect(JSON.stringify(a.editorial)).not.toMatch(/EXEMPLO10|29\.00|144\.00|Pagamento único|Condições comerciais/)
    const listing = a.monetization.listings[0]!
    expect(listing).toMatchObject({ price: { amount: '29.00', currency: 'USD', billingCycle: 'unico' },
      previousPrice: { amount: '144.00', currency: 'USD' }, coupon: { code: null, verifiedAt: '2026-10-01T12:00:00.000Z' },
      affiliateUrl: '/r/o4?ref=json', availability: 'unknown' })
    expect(compor({ valor: listing.storeDiscount?.value, tipo: 'percentual', verificado_em: listing.storeDiscount?.verifiedAt }, cupomDaFicha(a)))
      .toMatchObject({ total_pct: 27 })
  })
  it('não patrulha palavras nem remove preços de um texto editorial já aprovado', () => {
    const dto = fichaDaOfertaPublica({ ...ofertaFixture,
      corpo: { root: { children: [{ type: 'paragraph', children: [{ type: 'text', text: 'O custo histórico era R$ 100 em 2024.' }] }] } },
      meta: { description: 'Análise da condição histórica de R$ 100.' },
      faq: [{ pergunta: 'Como era o cupom antigo?', resposta: 'A condição analisada era de 5%.' }],
    }, tenant, leitura)!
    expect(dto.editorial.content.descriptionMarkdown).toContain('R$ 100 em 2024')
    expect(dto.editorial.content.metaDescription).toContain('R$ 100')
    expect(dto.editorial.content.faq).toContainEqual({ question: 'Como era o cupom antigo?', answer: 'A condição analisada era de 5%.' })
    expect(JSON.stringify(dto.editorial)).not.toContain('EXEMPLO10')
  })
  it('oferta sem preço continua editorial e não emite Offer', () => {
    const dto = fichaDaOfertaPublica({ ...ofertaFixture, preco: null }, tenant, leitura)!
    expect(dto.editorial.content.renderedHtml).toContain('Análise editorial aprovada.')
    expect(schemaDaOferta(dto, 'https://site.example.test/apps/software-exemplo/')[0]).not.toHaveProperty('offers')
  })
  it('não inventa marca do produto a partir da loja, estoque, início ou validade de disponibilidade', () => {
    const dto = fichaDaOfertaPublica(ofertaFixture, tenant, leitura)!
    const product = schemaDaOferta(dto, 'https://site.example.test/apps/software-exemplo/')[0]!
    expect(product).not.toHaveProperty('brand')
    expect(product).toHaveProperty('offers')
    expect(product.offers).not.toHaveProperty('availability')
    expect(product.offers).not.toHaveProperty('availabilityStarts')
    expect(product.offers).not.toHaveProperty('priceValidUntil')
  })
  it('disponibilidade e marca explícitas são preservadas', () => {
    const dto = fichaDaOfertaPublica({ ...ofertaFixture, marca: 'Fabricante', disponibilidade: 'indisponivel' }, tenant, leitura)!
    expect(schemaDaOferta(dto, 'https://site.example.test/ofertas/software-exemplo/')[0])
      .toMatchObject({ brand: { name: 'Fabricante' }, offers: { availability: 'https://schema.org/OutOfStock' } })
  })
  it.each([Infinity, NaN, -1])('preço inválido não cria Offer: %s', valor => {
    const dto = fichaDaOfertaPublica({ ...ofertaFixture, preco: { valor, moeda: 'BRL' } }, tenant, leitura)!
    expect(schemaDaOferta(dto, 'https://site.example.test/ofertas/software-exemplo/')[0]).not.toHaveProperty('offers')
  })
  it('moeda/URL inválidas não criam Offer nem geram datas fictícias', () => {
    const dto = fichaDaOfertaPublica({ ...ofertaFixture, preco: { valor: 29, moeda: 'inválida', preco_em: 'inválido' } }, tenant, leitura)!
    expect(dto.monetization.listings[0]?.observedAt).toBeNull()
    expect(schemaDaOferta(dto, 'https://site.example.test/ofertas/software-exemplo/')[0]).not.toHaveProperty('offers')
    expect(schemaDaOferta(fichaDaOfertaPublica(ofertaFixture, tenant, leitura)!, 'javascript:alert(1)')[0]).not.toHaveProperty('offers')
  })
  it('recusa outro tenant/draft e não usa loja ou cupom explicitamente de outro tenant', () => {
    expect(fichaDaOfertaPublica(ofertaFixture, { ...tenant, id: 8 }, leitura)).toBeNull()
    expect(fichaDaOfertaPublica({ ...ofertaFixture, _status: 'draft' }, tenant, leitura)).toBeNull()
    const dto = fichaDaOfertaPublica({ ...ofertaFixture,
      loja: { ...(ofertaFixture.loja as object), id: 2, tenant: 8, nome: 'Outra loja', slug: 'outra', programa: 'outro', url_site: '' },
      cupom: { id: 3, tenant: 8, codigo: 'OUTRO20', estado: 'publicado', desconto_tipo: 'percentual' } }, tenant, leitura)!
    expect(dto.monetization.listings[0]).toMatchObject({ seller: null, coupon: null })
  })
  it('mídia e derivados de imagem são mantidos sem o documento bruto', () => {
    const dto = fichaDaOfertaPublica({ ...ofertaFixture, imagem: { url: '/foto.jpg', alt: 'Foto', width: 1280, height: 720,
      sizes: { cartao: { url: '/foto-640.avif', width: 640, height: 360 }, og: { url: '/foto-og.jpg', width: 1200, height: 630 } } } }, tenant, leitura)!
    expect(imagemDaFicha(dto.editorial.image)).toMatchObject({ url: 'https://media.example.test/foto.jpg',
      sizes: { cartao: { url: 'https://media.example.test/foto-640.avif', width: 640 }, og: { width: 1200, height: 630 } } })
  })
  it.each(['image/jpeg', 'image/avif', undefined])('preserva MIME dos derivados sem presumir JPEG: %s', mimeType => {
    const dto = fichaDaOfertaPublica({ ...ofertaFixture, imagem: { url: '/foto.avif', alt: 'Foto',
      sizes: {
        cartao: { url: '/foto-640.avif', mimeType: 'image/avif' },
        capa: { url: '/foto-1600.avif', mimeType: 'image/avif' },
        og: { url: '/foto-og.jpg', width: 1200, height: 630, mimeType },
      } } }, tenant, leitura)!
    expect(dto.editorial.image?.variants?.social?.mimeType).toBe(mimeType)
    const imagem = imagemDaFicha(dto.editorial.image)
    expect(imagem?.sizes?.cartao?.mimeType).toBe('image/avif')
    expect(imagem?.sizes?.capa?.mimeType).toBe('image/avif')
    expect(imagem?.sizes?.og).toMatchObject({ url: 'https://media.example.test/foto-og.jpg', width: 1200, height: 630 })
    // Base.astro exige este valor exato para emitir og:image; AVIF/ausente continuam recusados.
    expect(imagem?.sizes?.og?.mimeType).toBe(mimeType)
  })
  it('não gera texto ou bloqueia oferta vazia e não exige FAQ/revisão', () => {
    const dto = fichaDaOfertaPublica({ id: 1, tenant: 7, _status: 'published', titulo: 'Vazia', slug: 'vazia' }, tenant, leitura)!
    expect(dto.editorial.content).toMatchObject({ summary: null, descriptionMarkdown: null, renderedHtml: '', faq: [], features: [] })
    expect(dto.editorial.status).toBe('desconhecido')
  })
  it('links do corpo mantêm CTA interno e fonte editorial externa sem vazar destino afiliado', () => {
    const dto = fichaDaOfertaPublica({ ...ofertaFixture, corpo: { root: { children: [
      { type: 'paragraph', children: [{ type: 'link', fields: { url: ofertaFixture.url_afiliado_fonte }, children: [{ type: 'text', text: 'Comprar' }] },
        { type: 'link', fields: { url: 'https://pesquisa.example.test/doc' }, children: [{ type: 'text', text: 'Fonte' }] }] },
    ] } } }, tenant, leitura)!
    expect(dto.editorial.content.renderedHtml).toContain('href="/r/o4?ref=corpo" rel="sponsored nofollow"')
    expect(dto.editorial.content.renderedHtml).toContain('href="https://pesquisa.example.test/doc"')
    expect(JSON.stringify(dto)).not.toContain('tracking.example.test')
  })
})
