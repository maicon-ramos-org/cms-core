/**
 * Sub-sitemap por tipo. Cada URL aqui é uma rota que este site realmente serve — o que
 * não tem rota ou é render velho do builder (`config.slugsSemPagina`) fica de fora, porque
 * sitemap com 404 e conteúdo duplicado custa crawl budget.
 *
 * O tema gera `posts` e `paginas`; os outros tipos (ofertas, lojas, fichas…) vêm das
 * extensões do site (`ExtensaoDoEditorial.sitemaps`, PRD 17 RF3d).
 */
import type { APIRoute } from 'astro'

import { respostaXml, urlset } from '../lib/sitemap'
import { SITEMAPS } from '../sitemaps'

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const gerador = SITEMAPS.get(context.params.tipo ?? '')
  if (!gerador) return new Response('Sitemap não encontrado.', { status: 404 })
  if (tenant.seo?.sitemap_enabled === false) return new Response('Sitemap desabilitado.', { status: 404 })

  const urls = await gerador(tenant, `https://${tenant.canonical_host}`)

  if (context.cache.enabled) {
    context.cache.set({ maxAge: 3600, swr: 600, tags: [`tenant:${tenant.slug}`, `sitemap:${context.params.tipo}`] })
  }
  return respostaXml(urlset(urls))
}
