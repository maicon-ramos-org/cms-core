/** Projeção pública: a REST do Payload nunca deve ser devolvida diretamente. */
import { caminhoCanonico, type PageDTO, type PostDTO, type TenantDTO } from './cms'
import { lexicalParaTexto } from './lexical'

type Host = Pick<TenantDTO, 'canonical_host'>

const urlCanonica = (tenant: Host, slug: string): string =>
  `https://${tenant.canonical_host}/${caminhoCanonico(slug)}/`

const pessoa = (valor: PostDTO['autor']) =>
  valor && typeof valor === 'object' ? { name: valor.nome, slug: valor.slug } : null

const categoriaPublica = (valor: PostDTO['categoria']) =>
  valor && typeof valor === 'object' ? { name: valor.nome, slug: valor.slug } : null

export function artigoPublicoJson(tenant: Host, post: PostDTO) {
  const texto = lexicalParaTexto(post.corpo)
  return {
    url: urlCanonica(tenant, post.slug), slug: post.slug,
    contentType: post.tipo || 'artigo', intent: post.intencao || null,
    title: post.titulo, metaDescription: post.meta?.description || post.resumo || lexicalParaTexto(post.corpo, 155) || null,
    publishedAt: post.publicado_em ?? post.createdAt ?? null,
    updatedAt: post.atualizado_em ?? post.updatedAt ?? null,
    contentText: texto,
    category: categoriaPublica(post.categoria),
    tags: Array.isArray(post.tags) ? post.tags.filter((tag): tag is { id: string | number; nome: string; slug: string } =>
      Boolean(tag) && typeof tag === 'object' && 'nome' in tag && 'slug' in tag).map(tag => ({ name: tag.nome, slug: tag.slug })) : [],
    author: pessoa(post.autor),
    faq: Array.isArray(post.faq) ? post.faq.filter(item => typeof item?.pergunta === 'string' && typeof item?.resposta === 'string')
      .map(item => ({ question: item.pergunta, answer: item.resposta })) : [],
  }
}

export function paginaPublicaJson(tenant: Host, page: PageDTO) {
  return {
    url: urlCanonica(tenant, page.slug), slug: page.slug,
    contentType: 'page', intent: null,
    title: page.titulo, metaDescription: page.meta?.description || lexicalParaTexto(page.corpo, 155) || null,
    publishedAt: page.createdAt ?? null, updatedAt: page.updatedAt ?? null,
    contentText: lexicalParaTexto(page.corpo),
    category: null, tags: [], author: null, faq: [],
  }
}
