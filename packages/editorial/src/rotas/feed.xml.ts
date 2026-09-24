/**
 * RSS em /feed/ — o WordPress publica nesse caminho e leitores/agregadores já o
 * conhecem. Astro serve o arquivo por `feed.xml`; o middleware trata `/feed/` (ver
 * `reescreveFeed`), pra que a URL antiga continue valendo sem 301.
 */
import type { APIRoute } from 'astro'

import config from 'virtual:editorial/config'

import { getPostsPaginados } from '../lib/cms'
import { caminhoCanonico } from '../lib/cms'
import { deNicho } from '../lib/nicho'
import { texto } from '../textos'

const escapa = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const { docs } = await getPostsPaginados(tenant.id, 1, 20)
  const base = `https://${tenant.canonical_host}`

  if (context.cache.enabled) {
    context.cache.set({ maxAge: 900, swr: 300, tags: [`tenant:${tenant.slug}`, 'posts:hub'] })
  }

  const itens = docs
    .map((p) => {
      const url = `${base}/${caminhoCanonico(p.slug)}/`
      const data = p.publicado_em ? new Date(p.publicado_em).toUTCString() : undefined
      return `    <item>
      <title>${escapa(p.titulo)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>${data ? `\n      <pubDate>${data}</pubDate>` : ''}
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapa(tenant.nome)}</title>
    <link>${base}/</link>
    <description>${escapa(texto(config.textos, 'descricaoDoFeed', { nome: tenant.nome, nicho: deNicho(tenant) }))}</description>
    <language>pt-BR</language>
    <atom:link href="${base}/feed/" rel="self" type="application/rss+xml" />
${itens}
  </channel>
</rss>
`
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } })
}
