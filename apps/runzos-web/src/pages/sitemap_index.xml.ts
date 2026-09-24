/**
 * Índice de sitemaps. O nome do arquivo é o mesmo do WordPress de propósito: é a URL já
 * registrada no Search Console, e mantê-la evita recadastro na virada.
 */
import type { APIRoute } from 'astro'

import { respostaXml, sitemapindex } from '@runzos/editorial/lib/sitemap'

import { TIPOS } from '../lib/tipos-de-sitemap'

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  if (tenant.seo?.sitemap_enabled === false) return new Response('Sitemap desabilitado.', { status: 404 })

  if (context.cache.enabled) {
    context.cache.set({ maxAge: 3600, swr: 600, tags: [`tenant:${tenant.slug}`, 'sitemap:index'] })
  }
  return respostaXml(sitemapindex(tenant, TIPOS))
}
