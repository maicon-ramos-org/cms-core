/**
 * robots.txt por tenant. Duas regras duras do projeto moram aqui:
 *
 * 1. STAGING nunca indexável, PRODUÇÃO nunca com noindex. O sinal é o host: qualquer
 *    host diferente do canônico do tenant (staging, preview, localhost) recebe
 *    `Disallow: /`. Assim não existe "esqueci de tirar o noindex" nem o contrário — o
 *    smoke de deploy (PRD 09 RF2) checa os dois lados.
 * 2. `/r/` fora do índice: é redirect de afiliado, não conteúdo.
 */
import type { APIRoute } from 'astro'

import { ehStaging } from '../lib/sitemap'

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const host = context.request.headers.get('host') ?? ''
  const staging = ehStaging(host, tenant)

  const linhas = staging
    ? ['# ambiente de staging/preview — fora do índice', 'User-agent: *', 'Disallow: /']
    : [
        'User-agent: *',
        'Allow: /',
        '# redirect de afiliado não é conteúdo',
        'Disallow: /r/',
        '# endpoints internos',
        'Disallow: /api/',
        '',
        ...(tenant.seo?.sitemap_enabled === false
          ? []
          : [`Sitemap: https://${tenant.canonical_host}/sitemap_index.xml`]),
      ]

  if (context.cache.enabled) {
    context.cache.set({ maxAge: 3600, swr: 600, tags: [`tenant:${tenant.slug}`, 'robots'] })
  }

  return new Response(`${linhas.join('\n')}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
