/**
 * Os sub-sitemaps do site: `posts` e `paginas` do tema, e os que as extensões acrescentam
 * (`ExtensaoDoEditorial.sitemaps`), na ordem de `config.sitemap.ordem`. O índice
 * (`/sitemap_index.xml`) e cada sub-sitemap (`/sitemap-{tipo}.xml`) leem daqui.
 */
import config from 'virtual:editorial/config'
import extensoes from 'virtual:editorial/extensoes'

import { tiposDeSitemap, type GeradorDeSitemap } from './extensoes'
import { getCategorias, listarParaSitemap } from './lib/cms'

/** Páginas cujo corpo migrado é arquivo do builder: quem representa a URL é o hub. */
const ARQUIVOS_DO_BUILDER = new Set(config.slugsSemPagina ?? [])

const DO_TEMA: Record<string, GeradorDeSitemap> = {
  posts: async (tenant, base) => {
    const posts = await listarParaSitemap('posts', tenant.id, 'atualizado_em')
    return posts.map((p) => ({ loc: `${base}/${p.slug}/`, lastmod: p.lastmod }))
  },

  paginas: async (tenant, base) => {
    /*
     * Templates com PASTA PRÓPRIA saem daqui (`config.sitemap.templatesDeFora`): as fichas
     * têm slug curto ("n8n") e sairiam como `/n8n`, que é 404. Um sitemap que aponta pra
     * 404 gasta crawl budget e ensina o buscador a confiar menos no arquivo.
     */
    const deFora = config.sitemap?.templatesDeFora ?? []
    const pages = await listarParaSitemap(
      'pages',
      tenant.id,
      'updatedAt',
      deFora.length ? [{ campo: 'template', operador: 'not_in', valor: deFora.join(',') }] : [],
    )
    const institucionais = pages.filter((p) => !ARQUIVOS_DO_BUILDER.has(p.slug))
    const categorias = await getCategorias(tenant.id)
    return [
      { loc: `${base}/`, lastmod: null },
      { loc: `${base}/blog/`, lastmod: null },
      ...(config.sitemap?.hubs ?? []).map((hub) => ({ loc: `${base}${hub}`, lastmod: null })),
      ...categorias.map((c) => ({ loc: `${base}/categoria/${c.slug}/`, lastmod: null })),
      ...institucionais.map((p) => ({ loc: `${base}/${p.slug}/`, lastmod: p.lastmod })),
    ]
  },
}

export const SITEMAPS = tiposDeSitemap(DO_TEMA, extensoes, config.sitemap?.ordem)
