/**
 * Gêmeo em markdown de /{slug} — o `.md` paralelo do checklist agent-readable.
 * Mesmo conteúdo do post, sem layout: é o que um agente de IA prefere ler.
 */
import type { APIRoute } from 'astro'

import config from 'virtual:editorial/config'

import { getPageBySlug, getPostBySlug, getPostsRelacionados } from '../lib/cms'
import { lexicalParaTexto } from '../lib/lexical'

/** Mesma regra da página HTML: arquivo do builder tem rota própria, não sai daqui. */
const ARQUIVOS_DO_BUILDER = new Set(config.slugsSemPagina ?? [])
const FORA_DA_RAIZ = new Set(Object.keys(config.fichas ?? {}))

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const slug = context.params.slug ?? ''
  const post = await getPostBySlug(tenant.id, slug)

  if (!post) {
    // páginas institucionais/de conteúdo dividem a URL com os posts
    const page = ARQUIVOS_DO_BUILDER.has(slug) ? null : await getPageBySlug(tenant.id, slug)
    if (!page || FORA_DA_RAIZ.has(page.template)) return new Response('Página não encontrada.', { status: 404 })
    const texto = lexicalParaTexto(page.corpo)
    const corpoMd = [
      `# ${page.titulo}`,
      '',
      `**Canonical:** https://${tenant.canonical_host}/${page.slug}`,
      '',
      texto,
    ].join('\n')
    return new Response(corpoMd, { headers: { 'content-type': 'text/markdown; charset=utf-8' } })
  }

  const categoria = post.categoria && typeof post.categoria === 'object' ? post.categoria : null
  const autor = post.autor && typeof post.autor === 'object' ? post.autor : null

  if (context.cache.enabled) {
    context.cache.set({ maxAge: 3600, swr: 300, tags: [`tenant:${tenant.slug}`, `posts:${post.id}`] })
  }

  const linhas = [`# ${post.titulo}`, '']
  if (autor) linhas.push(`**Autor:** ${autor.nome}`)
  if (categoria) linhas.push(`**Categoria:** ${categoria.nome}`)
  if (post.publicado_em) linhas.push(`**Publicado:** ${post.publicado_em.slice(0, 10)}`)
  if (post.atualizado_em) linhas.push(`**Atualizado:** ${post.atualizado_em.slice(0, 10)}`)
  linhas.push(`**Canonical:** https://${tenant.canonical_host}/${post.slug}`, '')
  const corpo = lexicalParaTexto(post.corpo)
  if (corpo) linhas.push(corpo)

  // O bloco entra no .md porque senão o leitor-agente não enxerga o que o leitor humano vê
  // — e o bloco é justamente a camada que carrega a linkagem da cauda longa.
  const relacionados = await getPostsRelacionados(tenant.id, post, 4)
  if (relacionados.length) {
    linhas.push('', '## Leia também', '')
    for (const r of relacionados) {
      linhas.push(`- [${r.titulo}](https://${tenant.canonical_host}/${r.slug}/)`)
    }
  }

  return new Response(linhas.join('\n'), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
}
