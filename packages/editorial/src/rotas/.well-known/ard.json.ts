import type { APIRoute } from 'astro'
import config from 'virtual:editorial/config'

import { catalogoArdPublico } from '../../lib/descoberta'

export const GET: APIRoute = (context) => {
  const host = context.url.hostname.toLowerCase()
  const perfil = config.llms?.tenantsPorHost?.[host]
  const tenant = context.locals.tenant
  const canonicalHost = perfil?.canonicalHost ?? tenant?.canonical_host
  if (!canonicalHost || host !== canonicalHost) {
    return new Response(null, { status: 404 })
  }
  const site = { nome: perfil?.nome ?? tenant.nome, canonicalHost }
  const recursos = [
    ...(config.ard?.recursos ?? []),
    ...(config.ard?.recursosPorTenant?.[perfil?.slug ?? tenant.slug] ?? []),
  ]
  return new Response(JSON.stringify(catalogoArdPublico(site, recursos)), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
