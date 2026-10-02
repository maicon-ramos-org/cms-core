/** Fichas comerciais públicas derivadas do dado editorial; nunca devolvem o documento Payload. */
import type { LojaDTO, OfertaDTO, ProdutoDTO } from './cms'
import { fichaDoCatalogo, type ProdutoFisico, type Listing } from './catalogo'
import type { FichaMonetizavelDTO } from '../../conteudo'
import { fichaDaOfertaPublica, type TenantDaOferta } from './oferta-ficha'
import { urlMidia } from './cms'
import { ehLinkDeAfiliado } from './links-de-afiliado'
import { idOferta } from '../../ofertas-editoriais/contratos'

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

export function ofertaPublicaJson(tenant: TenantDaOferta, oferta: OfertaDTO, path: string, ficha?: FichaMonetizavelDTO | null) {
  if (idOferta(oferta.tenant) !== String(tenant.id) || oferta._status !== 'published') return null
  const dto = ficha ?? fichaDaOfertaPublica(oferta, tenant, { resolveMidia: urlMidia, ehLinkDeAfiliado })
  if (!dto || dto.identity.source !== 'offer' || dto.slug !== oferta.slug ||
    dto.identity.tenantId !== String(tenant.id) || dto.identity.id !== String(oferta.id)) return null
  const editorial = dto.editorial, listing = dto.monetization.listings[0]
  if (!listing) return null
  const price = listing.price ? Number(listing.price.amount) : null
  const priceDate = listing.observedAt
  const discount = listing.storeDiscount?.value
  const discountDate = listing.storeDiscount?.verifiedAt
  const seller = listing.seller ? { name: text(listing.seller.name), slug: listing.seller.slug } : null
  const c = listing.coupon
  const coupon = c && ['publicado', 'expirando'].includes(c.state ?? '') ? {
    discount: c.discount?.verifiedAt && ['percentual', 'valor', 'frete'].includes(c.discount.type)
      ? { type: c.discount.type, value: c.discount.value, checkedAt: c.discount.verifiedAt } : null,
    conditions: text(c.conditions), expiresAt: c.expiresAt,
  } : null
  return {
    url: url(tenant, path), slug: dto.slug, contentType: 'offer', title: editorial.name,
    // Mantém a política pública anterior: resumo com URL não é exposto no JSON.
    offerType: oferta.tipo ?? null, summary: text(oferta.resumo) ? text(editorial.content.summary) : null,
    price: typeof price === 'number' && Number.isFinite(price) && price > 0 && priceDate
      ? { value: price, currency: listing.price!.currency, observedAt: priceDate,
        billingCycle: listing.price?.billingCycle ?? null } : null,
    store: seller, coupon,
    storeDiscount: typeof discount === 'number' && Number.isFinite(discount) && discount >= 0 && discountDate
      ? { value: discount, type: listing.storeDiscount?.type ?? null, observedAt: discountDate } : null,
    categories: (editorial.categories ?? []).map(category => ({ name: text(category.name), slug: category.slug })),
    action: listing.affiliateUrl ? { href: listing.affiliateUrl, label: 'Abrir oferta' } : null,
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

export function produtoFisicoPublicoJson(tenant: TenantDaOferta, produto: ProdutoFisico, ofertas: Listing[], ficha?: FichaMonetizavelDTO | null) {
  if (idOferta(produto.tenant) !== String(tenant.id) || produto.estado !== 'published' || produto._status === 'draft') return null
  const dto = ficha ?? fichaDoCatalogo({ produto, ofertas }, tenant.id)
  if (!dto || dto.identity.source !== 'product' || dto.identity.tenantId !== String(tenant.id) ||
    dto.identity.id !== String(produto.id) || dto.slug !== produto.slug) return null
  const editorial = dto.editorial
  return {
    url: url(tenant, `/p/${encodeURIComponent(dto.slug)}/`), slug: dto.slug,
    contentType: 'physical-product', title: editorial.name, summary: editorial.content.summary,
    descriptionMarkdown: editorial.content.descriptionMarkdown,
    highlights: editorial.content.highlights, faq: editorial.content.faq,
    brand: text(editorial.brand), model: text(editorial.model), indexable: editorial.indexable,
    image: editorial.image, identifiers: editorial.identifiers,
    specifications: editorial.specifications,
    ...(editorial.prosCons.length ? { prosCons: editorial.prosCons } : {}),
    price: null, offers: dto.monetization.listings.flatMap(offer => {
      return offer.affiliateUrl ? [{ href: offer.affiliateUrl, observedAt: offer.observedAt }] : []
    }),
  }
}
