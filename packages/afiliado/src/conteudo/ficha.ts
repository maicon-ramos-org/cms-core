/**
 * Ficha pública de leitura: mesma estrutura editorial para produtos e ofertas.
 * Não define collection, rota, layout, aprovação ou política comercial. Adaptadores
 * fazem allowlist; relações e destinos comerciais devem ser resolvidos pelo chamador.
 */
import { decimalExato, idOferta, urlHTTP, type IdOferta, type OfertaEditorial, type RelacaoOferta } from '../ofertas-editoriais/contratos'
import { produtoEditorialDTO, produtoJsonLd, produtoMarkdown, type OfertaJsonLd, type ProdutoEditorialDTO, type ProdutoEditorialFonte } from './dto'
import { produtoMarkdownHtml } from './html'
import { CONTEUDO_SCHEMA } from './contrato'

export const FICHA_SCHEMA = 'monetizable_content/v1'
/** Tipo do assunto, não do template: uma mesma ficha pode ter vários layouts. */
export type TipoFicha = 'product' | 'software' | 'service' | 'other'
export interface ImagemFichaDTO {
  url: string; alt: string; width?: number; height?: number; mimeType?: string
  variants?: Partial<Record<'card' | 'cover' | 'social', ImagemFichaDTO>>
}
type ImagemFonte = { url?: string | null; alt?: string | null; width?: number | null; height?: number | null; mimeType?: string | null
  variants?: Partial<Record<'card' | 'cover' | 'social', Omit<ImagemFonte, 'variants'>>> }
type ProContraFonte = { tipo: 'pro' | 'con'; texto: string }
export type ConteudoFichaDTO = ProdutoEditorialDTO['content'] & {
  /** Representação produzida pelo renderizador seguro, nunca HTML bruto do CMS. */
  renderedHtml?: string | null
  headline?: string | null
  tagline?: string | null
  subjectName?: string | null
  introTitle?: string | null
  features?: Array<{ title: string; description: string | null }>
  verdict?: string | null
  /** Subconjunto que já era visível na página; não impõe um template. */
  inlineFaq?: Array<{ question: string; answer: string }>
}
export interface DescontoFichaDTO { type: 'percentual' | 'valor' | 'frete' | 'outro'; value: number | null; verifiedAt: string | null }
export interface CupomFichaFonte {
  code?: string | null; url?: string | null; expiresAt?: string | null
  id?: string | null; maskedCode?: string | null; state?: string | null
  discount?: DescontoFichaDTO | null; conditions?: string | null; verifiedAt?: string | null
  appliesTo?: 'preco_cheio' | 'preco_ja_descontado' | 'desconhecido' | null
}
export interface CupomFichaDTO extends Omit<CupomFichaFonte, 'code' | 'url' | 'expiresAt'> {
  code: string | null; url: string | null; expiresAt: string | null
}

export interface EditorialFichaDTO extends Pick<ProdutoEditorialDTO, 'name' | 'category' | 'identifiers' | 'specifications' | 'content' | 'indexable'> {
  content: ConteudoFichaDTO
  brand: string | null
  model: string | null
  image: ImagemFichaDTO | null
  categories?: Array<{ name: string | null; slug: string }>
  prosCons: Array<{ kind: 'pro' | 'con'; text: string }>
  /** Informativo; nunca decide se a ficha pode ser publicada ou indexada. */
  status: ProdutoEditorialDTO['editorial']['status']
}

/** Só dados comerciais já resolvidos e autorizados para exposição pública. */
export interface ListingFichaFonte {
  id: IdOferta
  tenant: RelacaoOferta
  variantId?: IdOferta | null
  seller?: { id?: IdOferta | null; name: string; url?: string | null; slug?: string; logo?: ImagemFonte | null } | null
  price?: { amount: string; currency: string; billingCycle?: string | null } | null
  availability?: 'in-stock' | 'out-of-stock' | 'unknown' | null
  coupon?: CupomFichaFonte | null
  previousPrice?: { amount: string; currency: string } | null
  storeDiscount?: DescontoFichaDTO | null
  promotion?: { label: string | null; badge: string | null; badges: string[]; paymentLabel: string | null } | null
  affiliateUrl?: string | null
  observedAt?: string | null
}
export interface ListingFichaDTO {
  id: string
  variantId?: string | null
  seller: { id: string | null; name: string; url: string | null; slug?: string; logo?: ImagemFichaDTO | null } | null
  price: { amount: string; currency: string; billingCycle?: string | null } | null
  availability: 'in-stock' | 'out-of-stock' | 'unknown'
  coupon: CupomFichaDTO | null
  previousPrice?: { amount: string; currency: string } | null
  storeDiscount?: DescontoFichaDTO | null
  promotion?: { label: string | null; badge: string | null; badges: string[]; paymentLabel: string | null } | null
  affiliateUrl: string | null
  observedAt: string | null
}

export interface FichaMonetizavelDTO {
  schema: typeof FICHA_SCHEMA
  /** O namespace evita colisão entre ids de produto e de oferta. Não é URL canônica. */
  identity: { tenantId: string; id: string; source: 'product' | 'offer' }
  slug: string
  kind: TipoFicha
  editorial: EditorialFichaDTO
  monetization: { listings: ListingFichaDTO[]; variants?: Array<{ id: string; name: string }> }
}

export interface ProdutoFichaFonte extends ProdutoEditorialFonte {
  id: IdOferta
  tenant: RelacaoOferta
  _status?: 'draft' | 'published'
  imagem?: ImagemFonte | IdOferta | null
  pros_contras?: ProContraFonte[] | null
}
/** Campos opcionais só são lidos quando realmente existem na origem; nada é inferido. */
export interface OfertaFichaFonte extends Omit<OfertaEditorial, 'programa' | 'estado'>,
  Partial<Pick<OfertaEditorial, 'programa' | 'estado'>>,
  Partial<Omit<ProdutoEditorialFonte, 'nome' | 'slug' | 'estado' | 'especificacoes'>> {}
export interface OpcoesFicha {
  /** Escopo esperado pelo leitor; documento de outro tenant não vira ficha pública. */
  tenantId: IdOferta
  kind?: TipoFicha
  /** Mídia resolvida, quando o documento contém apenas um id de relacionamento. */
  image?: ImagemFonte | null
  /** Já filtrados por entidade, tenant e política de links/cupom do consumidor. */
  listings?: readonly ListingFichaFonte[]
  /** Agrupamentos comerciais já resolvidos para a entidade; não determinam layout. */
  variants?: readonly { id: IdOferta; tenant: RelacaoOferta; name: string }[]
}

const texto = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null
/** Preserva CTAs locais já autorizados, sem aceitar URL protocol-relative ou barra invertida. */
const urlDeAcao = (value: unknown): string | null => {
  const raw = texto(value)
  if (!raw || /[\u0000-\u001f\\]/.test(raw)) return null
  return /^\/(?!\/)/.test(raw) ? raw : urlHTTP(raw)
}
const data = (value: unknown): string | null => {
  const raw = texto(value), time = raw ? Date.parse(raw) : NaN
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}
function imagem(value: ImagemFonte | IdOferta | null | undefined, nome: string): ImagemFichaDTO | null {
  if (!value || typeof value !== 'object') return null
  const url = urlHTTP(value.url)
  if (!url) return null
  const variants: ImagemFichaDTO['variants'] = {}
  for (const key of ['card', 'cover', 'social'] as const) {
    const resolved = value.variants?.[key] ? imagem(value.variants[key], nome) : null
    if (resolved) variants[key] = resolved
  }
  return { url, alt: texto(value.alt) ?? nome,
    ...(texto(value.mimeType) ? { mimeType: texto(value.mimeType)! } : {}),
    ...(Object.keys(variants).length ? { variants } : {}),
    ...(typeof value.width === 'number' && Number.isFinite(value.width) && value.width > 0 ? { width: value.width } : {}),
    ...(typeof value.height === 'number' && Number.isFinite(value.height) && value.height > 0 ? { height: value.height } : {}) }
}
function preco(value: ListingFichaFonte['price']): ListingFichaDTO['price'] {
  if (!value || !/^[A-Z]{3}$/.test(value.currency)) return null
  try {
    // Reutiliza decimal exato: não converte dinheiro para ponto flutuante.
    const amount = decimalExato(value.amount)
    return amount && !amount.startsWith('-') ? { amount, currency: value.currency,
      ...(value.billingCycle !== undefined ? { billingCycle: texto(value.billingCycle) } : {}) } : null
  } catch { return null }
}
function listings(fontes: readonly ListingFichaFonte[], tenantId: string): ListingFichaDTO[] {
  return fontes.flatMap(fonte => {
    const id = idOferta(fonte.id), sellerName = texto(fonte.seller?.name), code = texto(fonte.coupon?.code)
    if (!id || idOferta(fonte.tenant) !== tenantId) return []
    const coupon = fonte.coupon
    const metadata = coupon?.id || coupon?.maskedCode || coupon?.discount || coupon?.conditions || coupon?.verifiedAt
    return [{ id,
      ...(fonte.variantId !== undefined ? { variantId: idOferta(fonte.variantId) || null } : {}),
      seller: sellerName ? { id: idOferta(fonte.seller?.id) || null, name: sellerName, url: urlHTTP(fonte.seller?.url),
        ...(fonte.seller?.slug !== undefined ? { slug: texto(fonte.seller.slug) ?? '' } : {}),
        ...(fonte.seller?.logo !== undefined ? { logo: imagem(fonte.seller.logo, sellerName) } : {}) } : null,
      price: preco(fonte.price),
      availability: fonte.availability === 'in-stock' || fonte.availability === 'out-of-stock' ? fonte.availability : 'unknown',
      coupon: coupon && (code || metadata) ? { code, url: urlDeAcao(coupon.url), expiresAt: data(coupon.expiresAt),
        ...(coupon.id !== undefined ? { id: texto(coupon.id) } : {}),
        ...(coupon.maskedCode !== undefined ? { maskedCode: texto(coupon.maskedCode) } : {}),
        ...(coupon.state !== undefined ? { state: texto(coupon.state) } : {}),
        ...(coupon.conditions !== undefined ? { conditions: texto(coupon.conditions) } : {}),
        ...(coupon.verifiedAt !== undefined ? { verifiedAt: data(coupon.verifiedAt) } : {}),
        ...(coupon.appliesTo !== undefined ? { appliesTo: coupon.appliesTo } : {}),
        ...(coupon.discount !== undefined ? { discount: desconto(coupon.discount) } : {}),
      } : null,
      ...(fonte.previousPrice !== undefined ? { previousPrice: preco(fonte.previousPrice) } : {}),
      ...(fonte.storeDiscount !== undefined ? { storeDiscount: desconto(fonte.storeDiscount) } : {}),
      ...(fonte.promotion !== undefined ? { promotion: fonte.promotion ? {
        label: texto(fonte.promotion.label), badge: texto(fonte.promotion.badge), paymentLabel: texto(fonte.promotion.paymentLabel),
        badges: fonte.promotion.badges.flatMap(value => texto(value) ? [value.trim()] : []),
      } : null } : {}),
      affiliateUrl: urlDeAcao(fonte.affiliateUrl), observedAt: data(fonte.observedAt),
    }]
  })
}
function desconto(value: DescontoFichaDTO | null | undefined): DescontoFichaDTO | null {
  if (!value || !['percentual', 'valor', 'frete', 'outro'].includes(value.type)) return null
  return { type: value.type, value: typeof value.value === 'number' && Number.isFinite(value.value) && value.value >= 0 ? value.value : null,
    verifiedAt: data(value.verifiedAt) }
}
function ficha(fonte: ProdutoEditorialFonte, identidade: FichaMonetizavelDTO['identity'], kind: TipoFicha,
  image: ImagemFonte | IdOferta | null | undefined, prosCons: readonly ProContraFonte[], opcoes: OpcoesFicha): FichaMonetizavelDTO {
  const dto = produtoEditorialDTO(fonte)
  return {
    schema: FICHA_SCHEMA, identity: identidade, slug: dto.slug, kind,
    editorial: { name: dto.name, brand: texto(dto.brand), model: texto(dto.model), category: dto.category,
      identifiers: dto.identifiers, specifications: dto.specifications, content: dto.content,
      image: imagem(image, dto.name), status: dto.editorial.status, indexable: dto.indexable,
      prosCons: prosCons.flatMap(item => {
        const text = texto(item.texto)
        return text && (item.tipo === 'pro' || item.tipo === 'con') ? [{ kind: item.tipo, text }] : []
      }),
    },
    monetization: { listings: listings(opcoes.listings ?? [], identidade.tenantId),
      ...(opcoes.variants !== undefined ? { variants: opcoes.variants.flatMap(v => {
        const id = idOferta(v.id), name = texto(v.name)
        return id && name && idOferta(v.tenant) === identidade.tenantId ? [{ id, name }] : []
      }) } : {}) },
  }
}
function identidade(id: IdOferta, tenant: RelacaoOferta, source: FichaMonetizavelDTO['identity']['source'], esperado: IdOferta) {
  const tenantId = idOferta(tenant), entityId = idOferta(id)
  return tenantId && entityId && tenantId === idOferta(esperado) ? { tenantId, id: entityId, source } : null
}

/** Catálogo canônico publicado; aprovação, FAQ e indexável não são filtros de leitura. */
export function fichaDeProduto(produto: ProdutoFichaFonte, opcoes: OpcoesFicha): FichaMonetizavelDTO | null {
  const id = identidade(produto.id, produto.tenant, 'product', opcoes.tenantId)
  if (!id || produto.estado !== 'published' || produto._status === 'draft') return null
  return ficha(produto, id, opcoes.kind ?? 'product', opcoes.image === undefined ? produto.imagem : opcoes.image,
    produto.pros_contras ?? [], opcoes)
}

/**
 * Oferta editorial publicada. O estado comercial (ativa/pausada/etc.) não vira
 * status de revisão nem flag de indexação. Preço/link privados não são copiados:
 * o leitor fornece listings depois da política comercial e da resolução de relações.
 */
export function fichaDeOferta(oferta: OfertaFichaFonte, opcoes: OpcoesFicha): FichaMonetizavelDTO | null {
  const id = identidade(oferta.id, oferta.tenant, 'offer', opcoes.tenantId)
  if (!id || oferta._status !== 'published') return null
  const fonte: ProdutoEditorialFonte = {
    nome: texto(oferta.nome_exibicao) ?? oferta.nome, slug: oferta.slug,
    marca: oferta.marca ?? '', modelo: oferta.modelo ?? '', categoria: oferta.categoria,
    descricao: oferta.descricao, descricao_markdown: oferta.descricao_markdown ?? oferta.analise_md,
    resumo: oferta.resumo, destaques: oferta.destaques, faq: oferta.faq,
    meta_title: oferta.meta_title, meta_description: oferta.meta_description,
    gtin: oferta.gtin, mpn: oferta.mpn,
    especificacoes_editoriais: oferta.especificacoes_editoriais ?? oferta.especificacoes,
    editorial_status: oferta.editorial_status, estado: 'published', indexavel: oferta.indexavel,
  }
  return ficha(fonte, id, opcoes.kind ?? 'other', opcoes.image === undefined ? oferta.imagem_comercial : opcoes.image,
    oferta.pros_contras ?? [], opcoes)
}

/** Ponte compatível para os serializadores editoriais existentes, sem dados comerciais. */
function editorialLegado(dto: FichaMonetizavelDTO): ProdutoEditorialDTO {
  const e = dto.editorial
  return { schema: CONTEUDO_SCHEMA, slug: dto.slug, name: e.name, brand: e.brand ?? '', model: e.model ?? '', category: e.category,
    identifiers: e.identifiers, specifications: e.specifications, content: e.content, indexable: e.indexable,
    origin: 'editorial', editorial: { status: e.status, refreshRequested: false },
    provenance: { factsHash: null, generator: null, contentVersion: null, promptVersion: null } }
}
export function fichaMarkdown(dto: FichaMonetizavelDTO): string {
  const markdown = produtoMarkdown(editorialLegado(dto))
  if (!dto.editorial.prosCons.length) return markdown
  const pontos = dto.editorial.prosCons.map(item => `- **${item.kind === 'pro' ? 'Pró' : 'Contra'}:** ${item.text.replace(/[\r\n]+/g, ' ')}`)
  return `${markdown}\n## Prós e contras\n\n${pontos.join('\n')}\n`
}
export const fichaMarkdownHtml = (dto: FichaMonetizavelDTO): string => produtoMarkdownHtml(fichaMarkdown(dto))

/**
 * Reutiliza Product/FAQPage só para produto. Software/serviço têm schemas próprios
 * no consumidor; não são classificados como produto físico por conveniência.
 * Ofertas do JSON-LD permanecem explícitas, depois da política comercial do site.
 */
export function fichaProdutoJsonLd(dto: FichaMonetizavelDTO, opcoes: { canonical: string; ofertas?: readonly OfertaJsonLd[] }) {
  if (dto.kind !== 'product') return null
  return produtoJsonLd(editorialLegado(dto), { ...opcoes, imagem: dto.editorial.image?.url })
}
