/**
 * Sitemap por tenant (PRD 02 checklist / PRD 09 RF2 — o smoke de deploy confere que ele
 * existe e responde). Nada de host fixo: tudo sai de `tenant.canonical_host`.
 *
 * Estrutura: `/sitemap_index.xml` aponta pros sub-sitemaps por tipo. O nome do índice é
 * o MESMO do WordPress de propósito — é a URL que já está registrada no Search Console,
 * e trocá-la custaria recadastro. Os sub-sitemaps ganham nomes próprios (o modelo de
 * conteúdo daqui não é o do WP); as URLs antigas deles ficam pro plugin-redirects.
 */
import type { TenantDTO } from './cms'

export type TipoDeSitemap = 'posts' | 'ofertas' | 'apps' | 'lojas' | 'paginas'

export const TIPOS: TipoDeSitemap[] = ['posts', 'ofertas', 'apps', 'lojas', 'paginas']

export interface UrlDoSitemap {
  loc: string
  lastmod?: string | null
}

const escapaXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** Só a data: hora não muda decisão de crawl e evita lastmod artificialmente novo. */
const dia = (iso?: string | null): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

export function urlset(urls: UrlDoSitemap[]): string {
  const itens = urls
    .map((u) => {
      const lastmod = dia(u.lastmod)
      return `  <url>\n    <loc>${escapaXml(u.loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${itens}\n</urlset>\n`
}

export function sitemapindex(tenant: TenantDTO, tipos: TipoDeSitemap[]): string {
  const itens = tipos
    .map((t) => `  <sitemap>\n    <loc>https://${tenant.canonical_host}/sitemap-${t}.xml</loc>\n  </sitemap>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${itens}\n</sitemapindex>\n`
}

export const respostaXml = (xml: string): Response =>
  new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } })

/**
 * Staging é qualquer host que não seja o canônico do tenant (inclui localhost). A regra
 * dura do projeto: staging NUNCA indexável, produção NUNCA com noindex.
 */
export const ehStaging = (hostDaRequisicao: string, tenant: TenantDTO): boolean =>
  (hostDaRequisicao.split(':')[0] ?? '') !== tenant.canonical_host
