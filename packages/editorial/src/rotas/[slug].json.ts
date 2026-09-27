/** Gêmeo público tipado de /{slug}/. Nunca serializa o documento REST inteiro. */
import type { APIRoute } from 'astro'
import config from 'virtual:editorial/config'
import { getPageBySlug, getPostBySlug } from '../lib/cms'
import { artigoPublicoJson, paginaPublicaJson } from '../lib/publico-json'

const ARQUIVOS_DO_BUILDER = new Set(config.slugsSemPagina ?? [])
const FORA_DA_RAIZ = new Set(Object.keys(config.fichas ?? {}))

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const slug = context.params.slug ?? ''
  const post = await getPostBySlug(tenant.id, slug)
  const page = post || ARQUIVOS_DO_BUILDER.has(slug) ? null : await getPageBySlug(tenant.id, slug)
  if (!post && (!page || FORA_DA_RAIZ.has(page.template))) {
    return new Response('Página não encontrada.', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  if (context.cache?.enabled) {
    context.cache.set({ maxAge: post ? 3600 : 600, swr: post ? 300 : 120,
      tags: [`tenant:${tenant.slug}`, post ? `posts:${post.id}` : `pages:${page!.id}`] })
  }
  const body = post ? artigoPublicoJson(tenant, post) : paginaPublicaJson(tenant, page!)
  return Response.json(body, { headers: {
    'X-Robots-Tag': 'noindex',
    Link: `<${body.url}>; rel="canonical"`,
  } })
}
