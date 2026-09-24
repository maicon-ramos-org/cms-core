import { validaSiteStripe, validaAmazonLink } from '@maicon-ramos-org/afflinks'
import { cmsFetch, type MidiaDTO } from './cms'
type Id = string | number
export interface ProdutoFisico { id: Id; tenant: Id; nome: string; slug: string; marca: string; modelo: string; descricao?: string; estado: string; imagem?: MidiaDTO }
export interface Variante { id: Id; tenant: Id; produto: Id; nome: string; estado: string }
export interface Listing { id: Id; tenant: Id; variante: Id; loja: Id; estado: string; fonte: string; external_listing_id: string; url_origem: string; url_afiliado?: string; observado_em: string }
const same = (a: Id, b: Id) => String(a) === String(b)
async function find<T>(collection: string, tenant: Id, filters: Record<string, string>): Promise<T[]> {
  const q = new URLSearchParams({ 'where[and][0][tenant][equals]': String(tenant), depth: '0', limit: '100', ...filters })
  return (await cmsFetch<{ docs: T[] }>(`/api/${collection}?${q}`)).docs
}
export function destinoAmazon(o: Listing): string | null {
  if (!['amazon-manual-sitestripe', 'amazon-manual-revisado'].includes(o.fonte) || o.url_origem !== `https://www.amazon.com.br/dp/${o.external_listing_id}` ||
    !Number.isFinite(Date.parse(o.observado_em)) || Date.parse(o.observado_em) > Date.now()) return null
  try { return (o.fonte === 'amazon-manual-revisado' ? validaAmazonLink : validaSiteStripe)(o.external_listing_id, o.url_afiliado ?? '', process.env.AMAZON_TAG) } catch { return null }
}
export async function getCatalogoProduto(tenant: Id, slug: string) {
  const [produto] = await find<ProdutoFisico>('produtos_fisicos', tenant, {
    'where[and][1][slug][equals]': slug, 'where[and][2][estado][equals]': 'published',
  })
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
  return { '@type': 'Product', '@id': `${canonical}#produto`, url: canonical,
    name: catalogo.produto.nome, description: catalogo.produto.descricao,
    brand: { '@type': 'Brand', name: catalogo.produto.marca }, model: catalogo.produto.modelo,
    offers: catalogo.ofertas.map(o => ({ '@type': 'Offer', '@id': `${canonical}#oferta-${o.id}`,
      url: new URL(`/r/f${o.id}`, canonical).href })),
  }
}
