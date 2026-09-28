/**
 * llms.txt — o mapa do site para agente de IA (proposta llmstxt.org).
 *
 * Não é enfeite aqui: o site se propõe a ser lido por agente, e este arquivo é o índice que
 * diz onde estão os dados e que cada página tem gêmeo em markdown. O documento é um
 * índice estável: a rota não consulta listas/contagens do CMS nem executa extensões que
 * consultam o catálogo. Isso mantém o primeiro acesso rápido, mesmo sem cache na borda.
 */
import type { APIRoute } from 'astro'
import config from 'virtual:editorial/config'
import { textoLlmsPublico } from '../lib/descoberta'

const COMO_LER_PADRAO = [
  'Toda página tem gêmeo em Markdown: acrescente `.md` à URL.',
  'O HTML já vem renderizado no servidor: não é preciso executar JavaScript.',
  'JSON-LD em grafo (`@id`) em cada página.',
]

export const GET: APIRoute = (context) => {
  const perfis = config.llms?.tenantsPorHost
  const host = context.url.hostname.toLowerCase()
  const perfil = perfis && Object.hasOwn(perfis, host) ? perfis[host] : undefined
  const slug = perfil?.slug ?? context.locals.tenant.slug
  const nome = perfil?.nome ?? context.locals.tenant.nome
  const canonicalHost = perfil?.canonicalHost ?? context.locals.tenant.canonical_host
  const indices = [...(config.llms?.indices ?? []), ...(config.llms?.indicesPorTenant?.[slug] ?? [])]

  if (context.cache.enabled) {
    context.cache.set({ maxAge: 3600, swr: 600, tags: [`tenant:${slug}`, 'llms'] })
  }

  const corpo = textoLlmsPublico({ nome, canonicalHost }, {
    intro: config.llms?.intro,
    comoLer: config.llms?.comoLer ?? COMO_LER_PADRAO,
    indices: [
      { titulo: 'Blog', caminho: '/blog/' },
      ...indices,
      { titulo: 'Busca', caminho: '/busca/' },
      { titulo: 'Sitemap', caminho: '/sitemap_index.xml' },
    ],
  })

  return new Response(corpo, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
