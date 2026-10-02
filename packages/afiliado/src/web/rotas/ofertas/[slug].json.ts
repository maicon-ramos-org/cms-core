import type { APIRoute } from 'astro'
import { caminhoDaOferta, getOfertaBySlug, urlMidia } from '../../lib/cms'
import { ofertaPublicaJson } from '../../lib/publico-json'
import { fichaDaOfertaPublica } from '../../lib/oferta-ficha'
import { ehLinkDeAfiliado } from '../../lib/links-de-afiliado'

const validSlug = (slug: string) => slug.length <= 200 && /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(slug)

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const slug = context.params.slug ?? ''
  if (!validSlug(slug)) return new Response('Oferta não encontrada.', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const oferta = await getOfertaBySlug(tenant.id, slug)
  if (!oferta) return new Response('Oferta não encontrada.', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const ficha = fichaDaOfertaPublica(oferta, tenant, { resolveMidia: urlMidia, ehLinkDeAfiliado })
  const body = ofertaPublicaJson(tenant, oferta, caminhoDaOferta(oferta), ficha)
  if (!ficha || !body) return new Response('Oferta não encontrada.', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const store = ficha.monetization.listings[0]?.seller
  const coupon = ficha.monetization.listings[0]?.coupon
  if (context.cache?.enabled) context.cache.set({ maxAge: 300, swr: 60,
    tags: [`tenant:${tenant.slug}`, `ofertas:${oferta.id}`, ...(store ? [`loja:${store.slug}`] : []),
      ...(coupon ? [`cupons:${coupon.id}`] : [])] })
  return Response.json(body, { headers: { 'X-Robots-Tag': 'noindex', Link: `<${body.url}>; rel="canonical"` } })
}
