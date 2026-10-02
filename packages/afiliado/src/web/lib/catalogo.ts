import { validaSiteStripe, validaAmazonLink } from '@maicon-ramos-org/afflinks'
import { variavel } from '@maicon-ramos-org/editorial/lib/ambiente'
import { cmsFetch, urlMidia, type MidiaDTO } from './cms'
import { produtoEditorialDTO, produtoJsonLd, type ProdutoEditorialFonte } from '../../conteudo'
type Id = string | number
export interface ProdutoFisico extends ProdutoEditorialFonte {
  id: Id; tenant: Id | { id: Id }; estado: string; imagem?: MidiaDTO | Id | null
}
export interface Variante { id: Id; tenant: Id; produto: Id; nome: string; estado: string }
export interface Listing { id: Id; tenant: Id; variante: Id; loja: Id; estado: string; fonte: string; external_listing_id: string; url_origem: string; url_afiliado?: string; observado_em: string }
const same = (a: Id | { id: Id }, b: Id) => String(typeof a === 'object' ? a.id : a) === String(b)
async function find<T>(collection: string, tenant: Id, filters: Record<string, string>, depth = 0): Promise<T[]> {
  const q = new URLSearchParams({ 'where[and][0][tenant][equals]': String(tenant), depth: String(depth), limit: '100', ...filters })
  return (await cmsFetch<{ docs: T[] }>(`/api/${collection}?${q}`)).docs
}
/** A mídia é um relacionamento público; depth 1 resolve só o documento da imagem. */
export function imagemProduto(produto: ProdutoFisico): { url: string; alt: string; width?: number; height?: number } | null {
  const imagem = produto.imagem
  if (!imagem || typeof imagem !== 'object' || !imagem.url) return null
  const url = urlMidia(imagem.url)
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return null
  } catch { return null }
  return { url, alt: imagem.alt?.trim() || produto.nome,
    ...(imagem.width && imagem.width > 0 ? { width: imagem.width } : {}),
    ...(imagem.height && imagem.height > 0 ? { height: imagem.height } : {}) }
}
export function destinoAmazon(o: Listing): string | null {
  if (!['amazon-manual-sitestripe', 'amazon-manual-revisado'].includes(o.fonte) || o.url_origem !== `https://www.amazon.com.br/dp/${o.external_listing_id}` ||
    !Number.isFinite(Date.parse(o.observado_em)) || Date.parse(o.observado_em) > Date.now()) return null
  try { return (o.fonte === 'amazon-manual-revisado' ? validaAmazonLink : validaSiteStripe)(o.external_listing_id, o.url_afiliado ?? '', variavel('AMAZON_TAG')) } catch { return null }
}
export async function getCatalogoProduto(tenant: Id, slug: string) {
  const [produto] = await find<ProdutoFisico>('produtos_fisicos', tenant, {
    'where[and][1][slug][equals]': slug, 'where[and][2][estado][equals]': 'published',
  }, 1)
  if (!produto || !same(produto.tenant, tenant) || produto.estado !== 'published') return null
  const variantes = (await find<Variante>('variantes_produto', tenant, {
    'where[and][1][produto][equals]': String(produto.id), 'where[and][2][estado][equals]': 'confirmada',
  })).filter(v => same(v.tenant, tenant) && same(v.produto, produto.id) && v.estado === 'confirmada')
  const ofertas = variantes.length ? (await find<Listing>('ofertas_produto', tenant, {
    'where[and][1][variante][in]': variantes.map(v => v.id).join(','), 'where[and][2][estado][equals]': 'ativa',
  })).filter(o => same(o.tenant, tenant) && o.estado === 'ativa' && variantes.some(v => same(v.id, o.variante)) && destinoAmazon(o)) : []
  return { produto, variantes, ofertas }
}
export async function getDestinoFisico(tenant: Id, id: string): Promise<string | null> {
  const [o] = await find<Listing>('ofertas_produto', tenant, { 'where[and][1][id][equals]': id, 'where[and][2][estado][equals]': 'ativa' })
  if (!o || !same(o.tenant, tenant) || o.estado !== 'ativa') return null
  const [v] = await find<Variante>('variantes_produto', tenant, { 'where[and][1][id][equals]': String(o.variante), 'where[and][2][estado][equals]': 'confirmada' })
  if (!v || !same(v.tenant, tenant) || !same(v.id, o.variante) || v.estado !== 'confirmada') return null
  const [p] = await find<ProdutoFisico>('produtos_fisicos', tenant, { 'where[and][1][id][equals]': String(v.produto), 'where[and][2][estado][equals]': 'published' })
  if (!p || !same(p.tenant, tenant) || !same(p.id, v.produto) || p.estado !== 'published') return null
  const [loja] = await find<{ id: Id; tenant: Id; programa: string }>('lojas', tenant, { 'where[and][1][id][equals]': String(o.loja) })
  if (!loja || !same(loja.tenant, tenant) || !same(loja.id, o.loja) || loja.programa !== 'amazon') return null
  return destinoAmazon(o)
}
export function schemaProduto(catalogo: NonNullable<Awaited<ReturnType<typeof getCatalogoProduto>>>, canonical: string) {
  // O conteúdo é do produto. Sem preço observado e datado, não inventar Offer no schema.
  return produtoJsonLd(produtoEditorialDTO(catalogo.produto), {
    canonical, imagem: imagemProduto(catalogo.produto)?.url,
  })['@graph']
}
