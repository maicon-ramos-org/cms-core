import type { APIRoute } from 'astro'
import { getCatalogoProduto } from '../../lib/catalogo'
import { getProdutoBySlug, PRODUTO_MONETIZAVEL, type CupomDTO, type LojaDTO } from '../../lib/cms'
import { produtoFisicoPublicoJson, produtoPublicoJson } from '../../lib/publico-json'

const validSlug = (slug: string) => slug.length <= 200 && /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(slug)

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const slug = context.params.slug ?? ''
  if (!validSlug(slug)) return new Response('Produto não encontrado.', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  // Mesma precedência do HTML: o piloto físico ocupa /p antes da coleção legada.
  const catalogo = await getCatalogoProduto(tenant.id, slug)
  if (catalogo) {
    const body = produtoFisicoPublicoJson(tenant, catalogo.produto, catalogo.ofertas)
    return Response.json(body, { headers: { 'X-Robots-Tag': 'noindex',
      'Cache-Control': 'no-store', Link: `<${body.url}>; rel="canonical"` } })
  }
  const produto = await getProdutoBySlug(tenant.id, slug)
  if (!produto) return new Response('Produto não encontrado.', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const store: LojaDTO | null = produto.loja && typeof produto.loja === 'object' ? produto.loja : null
  const coupon: CupomDTO | null = produto.cupom && typeof produto.cupom === 'object' ? produto.cupom : null
  if (context.cache?.enabled) context.cache.set({ maxAge: 300, swr: 60,
    tags: [`tenant:${tenant.slug}`, `produtos:${produto.id}`, ...(store ? [`loja:${store.slug}`] : []),
      ...(coupon ? [`cupons:${coupon.id}`] : [])] })
  const body = produtoPublicoJson(tenant, produto, PRODUTO_MONETIZAVEL.has(produto.estado ?? ''))
  return Response.json(body, { headers: { 'X-Robots-Tag': 'noindex', Link: `<${body.url}>; rel="canonical"` } })
}
