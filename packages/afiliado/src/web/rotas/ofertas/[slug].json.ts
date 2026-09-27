import type { APIRoute } from 'astro'
import { caminhoDaOferta, getOfertaBySlug, type CupomDTO, type LojaDTO } from '../../lib/cms'
import { ofertaPublicaJson } from '../../lib/publico-json'

const validSlug = (slug: string) => slug.length <= 200 && /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(slug)

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const slug = context.params.slug ?? ''
  if (!validSlug(slug)) return new Response('Oferta não encontrada.', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const oferta = await getOfertaBySlug(tenant.id, slug)
  if (!oferta) return new Response('Oferta não encontrada.', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const store: LojaDTO | null = oferta.loja && typeof oferta.loja === 'object' ? oferta.loja : null
  const coupon: CupomDTO | null = oferta.cupom && typeof oferta.cupom === 'object' ? oferta.cupom : null
  if (context.cache?.enabled) context.cache.set({ maxAge: 300, swr: 60,
    tags: [`tenant:${tenant.slug}`, `ofertas:${oferta.id}`, ...(store ? [`loja:${store.slug}`] : []),
      ...(coupon ? [`cupons:${coupon.id}`] : [])] })
  const body = ofertaPublicaJson(tenant, oferta, caminhoDaOferta(oferta))
  return Response.json(body, { headers: { 'X-Robots-Tag': 'noindex', Link: `<${body.url}>; rel="canonical"` } })
}
