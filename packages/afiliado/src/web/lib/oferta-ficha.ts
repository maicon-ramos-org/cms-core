/** Ponte de leitura da coleção de ofertas existente; não muda escrita, collections ou rotas. */
import { lexicalParaHtml, lexicalParaTexto } from '@maicon-ramos-org/editorial/lib/lexical'
import { noFaq } from '@maicon-ramos-org/schema'
import { fichaDeOferta, type FichaMonetizavelDTO, type ListingFichaFonte, type OpcoesFicha } from '../../conteudo'
import { idOferta, urlHTTP } from '../../ofertas-editoriais/contratos'
import type { CupomDTO, MidiaDTO, OfertaDTO } from './cms'

export interface TenantDaOferta { id: string | number; canonical_host: string }
export interface LeituraDaOferta {
  resolveMidia: (url: string | undefined | null) => string | undefined
  ehLinkDeAfiliado: (url: string) => boolean
  renderHtml?: boolean
}
export type CupomCardPublico = Omit<CupomDTO, 'codigo' | 'url_afiliado_fonte'> & { mascara: string }
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null
const date = (value: unknown): string | null => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
const noTenant = (value: { tenant?: string | number | { id: string | number } }, tenant: string) =>
  value.tenant == null || idOferta(value.tenant) === tenant
const decimal = (value: unknown): string | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? String(value) : null
// BRL é o default da coleção existente, não uma moeda inferida do assunto/loja.
const currency = (value: string | null | undefined) => /^[A-Z]{3}$/.test(value ?? 'BRL') ? value ?? 'BRL' : null

function media(value: MidiaDTO | null, leitura: LeituraDaOferta): NonNullable<OpcoesFicha['image']> | null {
  if (!value) return null
  const url = leitura.resolveMidia(value.url)
  if (!url) return null
  const variants: NonNullable<OpcoesFicha['image']>['variants'] = {}
  for (const [source, target] of [['cartao', 'card'], ['capa', 'cover'], ['og', 'social']] as const) {
    const item = value.sizes?.[source], resolved = item && leitura.resolveMidia(item.url)
    if (item && resolved) variants[target] = { url: resolved, width: item.width, height: item.height }
  }
  return { url, alt: value.alt, width: value.width, height: value.height, variants }
}

/** Mantém o mesmo tratamento de destinos comerciais do Markdown legado. */
function textoEditorial(texto: string, destinos: readonly string[], leitura: LeituraDaOferta): string {
  return texto.replace(/https?:\/\/[^\s<>"'`()[\]]+/gi, raw => {
    const candidato = raw.replace(/[.,;!?]+$/, ''), final = raw.slice(candidato.length)
    return destinos.some(url => url.replace(/\/$/, '') === candidato.replace(/\/$/, '')) || leitura.ehLinkDeAfiliado(candidato)
      ? `[link comercial na página]${final}` : raw
  })
}

export function fichaDaOfertaPublica(oferta: OfertaDTO, tenant: TenantDaOferta, leitura: LeituraDaOferta): FichaMonetizavelDTO | null {
  if (idOferta(oferta.tenant) !== String(tenant.id) || oferta._status !== 'published') return null
  const loja = oferta.loja && typeof oferta.loja === 'object' && noTenant(oferta.loja, String(tenant.id)) ? oferta.loja : null
  const cupom = oferta.cupom && typeof oferta.cupom === 'object' && noTenant(oferta.cupom, String(tenant.id)) ? oferta.cupom : null
  const lt = oferta.tipo === 'lifetime' ? oferta.dados : null
  const destinos = [oferta.url_afiliado_fonte, cupom?.url_afiliado_fonte].filter((url): url is string => Boolean(url))
  const corpo = lexicalParaTexto(oferta.corpo)
  const excerpt = lexicalParaTexto(oferta.corpo, 155)
  const moeda = currency(oferta.preco?.moeda), valor = decimal(oferta.preco?.valor)
  const listing: ListingFichaFonte = {
    id: oferta.id, tenant: oferta.tenant,
    seller: loja ? { id: loja.id, name: loja.nome, slug: loja.slug, logo: media(loja.logo && typeof loja.logo === 'object' ? loja.logo : null, leitura) } : null,
    price: valor && moeda && Number(valor) > 0 ? { amount: valor, currency: moeda, billingCycle: oferta.preco?.ciclo ?? null } : null,
    previousPrice: decimal(lt?.preco_antigo) && moeda ? { amount: decimal(lt?.preco_antigo)!, currency: moeda } : null,
    availability: oferta.disponibilidade === 'disponivel' ? 'in-stock' : oferta.disponibilidade === 'indisponivel' ? 'out-of-stock' : 'unknown',
    observedAt: date(oferta.preco?.preco_em),
    affiliateUrl: oferta.url_afiliado_fonte || cupom?.url_afiliado_fonte || loja?.url_site ? `/r/o${oferta.id}?ref=json` : null,
    coupon: cupom ? { id: String(cupom.id), code: null, maskedCode: cupom.codigo.length > 4 ? cupom.codigo.slice(-4) : '••••',
      state: cupom.estado, url: `/r/c${cupom.id}?ref=cupom`, expiresAt: cupom.validade,
      conditions: cupom.condicoes, verifiedAt: cupom.verificado_em, appliesTo: cupom.aplica_sobre,
      discount: { type: cupom.desconto_tipo, value: cupom.desconto_valor ?? null, verifiedAt: cupom.verificado_em ?? null } } : null,
    storeDiscount: oferta.desconto_loja ? { type: oferta.desconto_loja.tipo ?? 'outro', value: oferta.desconto_loja.valor ?? null,
      verifiedAt: oferta.desconto_loja.verificado_em ?? null } : null,
    promotion: { label: oferta.rotulo_oferta ?? null, badge: lt?.sumo ?? null, badges: lt?.selos ?? [], paymentLabel: lt?.once ?? null },
  }
  const dto = fichaDeOferta({ id: oferta.id, tenant: oferta.tenant, _status: oferta._status, slug: oferta.slug,
    nome: oferta.titulo, marca: oferta.marca ?? undefined, modelo: oferta.modelo ?? undefined,
    resumo: oferta.resumo ? textoEditorial(oferta.resumo, destinos, leitura) : null,
    descricao_markdown: text(corpo) ? textoEditorial(corpo, destinos, leitura) : null,
    meta_title: oferta.meta?.title ? textoEditorial(oferta.meta.title, destinos, leitura) : null,
    meta_description: oferta.meta?.description ? textoEditorial(oferta.meta.description, destinos, leitura) : text(excerpt) ? textoEditorial(excerpt, destinos, leitura) : null,
    indexavel: oferta.indexavel, destaques: (oferta.beneficios ?? []).flatMap(b => b.texto ? [b.texto] : []),
    faq: [...(lt?.faq ?? []).flatMap(f => f.q && f.a ? [{ pergunta: f.q, resposta: f.a }] : []), ...(oferta.faq ?? [])],
    pros_contras: oferta.pros_contras,
  }, { tenantId: tenant.id, kind: oferta.tipo === 'lifetime' ? 'software' : 'other',
    image: media(oferta.imagem && typeof oferta.imagem === 'object' ? oferta.imagem : null, leitura), listings: [listing] })
  if (!dto) return null
  dto.editorial.categories = (oferta.categorias ?? []).flatMap(category => category && typeof category === 'object'
    ? [{ name: text(category.nome), slug: category.slug }] : [])
  Object.assign(dto.editorial.content, {
    headline: oferta.headline ?? null, tagline: lt?.tagline ?? null,
    subjectName: lt?.nome || oferta.titulo, introTitle: lt?.intro_titulo ?? null,
    features: (lt?.features ?? []).flatMap(f => f.t ? [{ title: f.t, description: f.d ?? null }] : []),
    verdict: lt?.veredito ?? null,
    inlineFaq: (lt?.faq ?? []).flatMap(f => f.q && f.a ? [{ question: f.q, answer: f.a }] : []),
  })
  if (leitura.renderHtml) {
    const mapa = new Map<string, string>()
    if (oferta.url_afiliado_fonte) mapa.set(oferta.url_afiliado_fonte, `/r/o${oferta.id}?ref=corpo`)
    if (cupom?.url_afiliado_fonte) mapa.set(cupom.url_afiliado_fonte, `/r/c${cupom.id}?ref=corpo`)
    dto.editorial.content.renderedHtml = lexicalParaHtml(oferta.corpo, {
      reescreveAfiliado: url => mapa.get(url) ?? mapa.get(url.replace(/\/$/, '')) ?? null,
      ehLinkDeAfiliado: leitura.ehLinkDeAfiliado, resolveMidia: leitura.resolveMidia, hostDoTenant: tenant.canonical_host,
    })
  }
  return dto
}

/** Compatibilidade visual sem levar o literal do cupom ao DTO ou ao HTML inicial. */
export function cupomDaFicha(dto: FichaMonetizavelDTO): CupomCardPublico | null {
  const cupom = dto.monetization.listings[0]?.coupon
  if (!cupom?.id || !['publicado', 'expirando'].includes(cupom.state ?? '')) return null
  return { id: cupom.id, mascara: cupom.maskedCode ?? '••••', estado: cupom.state!,
    desconto_tipo: cupom.discount?.type ?? 'outro', desconto_valor: cupom.discount?.value,
    condicoes: cupom.conditions, validade: cupom.expiresAt, verificado_em: cupom.verifiedAt, aplica_sobre: cupom.appliesTo }
}

/** Preserva os derivados usados pelo template/Base sem expor o documento de mídia. */
export function imagemDaFicha(image: FichaMonetizavelDTO['editorial']['image']): MidiaDTO | null {
  return image ? { url: image.url, alt: image.alt, width: image.width, height: image.height,
    sizes: { cartao: image.variants?.card, capa: image.variants?.cover, og: image.variants?.social } } : null
}

/** Grafo legado da oferta preservado; só preço/moeda/URL válidos criam Offer. */
export function schemaDaOferta(dto: FichaMonetizavelDTO, canonical: string) {
  const e = dto.editorial, listing = dto.monetization.listings[0], price = listing?.price
  const valid = price && Number.isFinite(Number(price.amount)) && Number(price.amount) > 0 && /^[A-Z]{3}$/.test(price.currency) && urlHTTP(canonical)
  return [
    { '@type': 'Product', '@id': `${canonical}#produto`, name: e.name, url: canonical,
      ...(e.content.summary ? { description: e.content.summary } : {}), ...(e.image ? { image: e.image.url } : {}),
      ...(e.brand ? { brand: { '@type': 'Brand', name: e.brand } } : {}),
      ...(valid ? { offers: { '@type': 'Offer', '@id': `${canonical}#offer`, url: canonical,
        price: Number(price.amount), priceCurrency: price.currency,
        ...(listing.availability !== 'unknown' ? { availability: `https://schema.org/${listing.availability === 'in-stock' ? 'InStock' : 'OutOfStock'}` } : {}),
        ...(listing.seller ? { seller: { '@type': 'Organization', name: listing.seller.name } } : {}),
      } } : {}),
    },
    noFaq(canonical, e.content.faq.map(f => ({ pergunta: f.question, resposta: f.answer }))),
  ]
}
