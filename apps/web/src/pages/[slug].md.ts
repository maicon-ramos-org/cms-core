/**
 * Gêmeo em markdown de /{slug} — o `.md` paralelo do checklist agent-readable.
 * Mesmo conteúdo do post, sem layout: é o que um agente de IA prefere ler.
 */
import type { APIRoute } from 'astro'

import { getPostBySlug } from '../lib/cms'
import { lexicalParaTexto } from '../lib/lexical'

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const slug = context.params.slug ?? ''
  const post = await getPostBySlug(tenant.id, slug)
  if (!post) return new Response('Página não encontrada.', { status: 404 })

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

  return new Response(linhas.join('\n'), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
}
