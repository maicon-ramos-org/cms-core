/** Fichas comerciais públicas derivadas do dado editorial; nunca devolvem o documento Payload. */
import type { LojaDTO, OfertaDTO, ProdutoDTO } from './cms'
import { destinoAmazon, imagemProduto, type ProdutoFisico, type Listing } from './catalogo'
import { produtoEditorialDTO } from '../../conteudo'

type Tenant = { canonical_host: string }
const id = (value: string | number) => String(value)
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() && !/https?:\/\/|javascript:/i.test(value) ? value.trim() : null
const date = (value: unknown): string | null =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
const loja = (value: LojaDTO | string | number | undefined) =>
  value && typeof value === 'object' ? { name: text(value.nome), slug: value.slug } : null
const url = (tenant: Tenant, path: string) => `https://${tenant.canonical_host}${path}`

const cupomPublico = (value: OfertaDTO['cupom'] | ProdutoDTO['cupom']) => {
  if (!value || typeof value !== 'object' || !['publicado', 'expirando'].includes(value.estado)) return null
  const checkedAt = date(value.verificado_em)
  return {
    discount: checkedAt && ['percentual', 'valor', 'frete'].includes(value.desconto_tipo)
      ? { type: value.desconto_tipo, value: typeof value.desconto_valor === 'number' && Number.isFinite(value.desconto_valor)
        ? value.desconto_valor : null, checkedAt } : null,
    conditions: text(value.condicoes), expiresAt: date(value.validade),
  }
}

export function ofertaPublicaJson(tenant: Tenant, oferta: OfertaDTO, path: string) {
  const price = oferta.preco?.valor
  const priceDate = date(oferta.preco?.preco_em)
  const discount = oferta.desconto_loja?.valor
  const discountDate = date(oferta.desconto_loja?.verificado_em)
  const seller = loja(oferta.loja)
  const coupon = cupomPublico(oferta.cupom)
  return {
    url: url(tenant, path), slug: oferta.slug, contentType: 'offer', title: oferta.titulo,
    offerType: oferta.tipo ?? null, summary: text(oferta.resumo),
    price: typeof price === 'number' && Number.isFinite(price) && price > 0 && priceDate
      ? { value: price, currency: oferta.preco?.moeda ?? 'BRL', observedAt: priceDate,
        billingCycle: oferta.preco?.ciclo ?? null } : null,
    store: seller, coupon,
    storeDiscount: typeof discount === 'number' && Number.isFinite(discount) && discount >= 0 && discountDate
      ? { value: discount, type: oferta.desconto_loja?.tipo ?? null, observedAt: discountDate } : null,
    categories: (oferta.categorias ?? []).flatMap(category => category && typeof category === 'object'
      ? [{ name: text(category.nome), slug: category.slug }] : []),
    action: oferta.url_afiliado_fonte || (oferta.cupom && typeof oferta.cupom === 'object' && oferta.cupom.url_afiliado_fonte) ||
      (oferta.loja && typeof oferta.loja === 'object' && oferta.loja.url_site)
      ? { href: `/r/o${id(oferta.id)}?ref=json`, label: 'Abrir oferta' } : null,
  }
}

export function produtoPublicoJson(tenant: Tenant, produto: ProdutoDTO, monetizavel: boolean) {
  const observedAt = date(produto.preco_em)
  return {
    url: url(tenant, `/p/${encodeURIComponent(produto.slug)}/`), slug: produto.slug,
    contentType: 'product', title: produto.titulo, state: produto.estado ?? null,
    indexable: produto.indexavel === true, store: loja(produto.loja), coupon: cupomPublico(produto.cupom),
    price: typeof produto.preco === 'number' && Number.isFinite(produto.preco) && produto.preco > 0 && observedAt
      ? { value: produto.preco, currency: 'BRL', observedAt } : null,
    action: monetizavel ? { href: `/r/p${id(produto.id)}?ref=json`, label: 'Ver na loja' } : null,
  }
}

export function produtoFisicoPublicoJson(tenant: Tenant, produto: ProdutoFisico, ofertas: Listing[]) {
  const editorial = produtoEditorialDTO(produto)
  return {
    url: url(tenant, `/p/${encodeURIComponent(produto.slug)}/`), slug: produto.slug,
    contentType: 'physical-product', title: produto.nome, summary: editorial.content.summary,
    descriptionMarkdown: editorial.content.descriptionMarkdown,
    highlights: editorial.content.highlights, faq: editorial.content.faq,
    brand: text(produto.marca), model: text(produto.modelo), indexable: editorial.indexable,
    image: imagemProduto(produto), identifiers: editorial.identifiers,
    specifications: editorial.specifications,
    price: null, offers: ofertas.flatMap(offer => {
      const href = destinoAmazon(offer)
      return href ? [{ href, observedAt: date(offer.observado_em) }] : []
    }),
  }
}
