/**
 * llms.txt — o mapa do site para agente de IA (proposta llmstxt.org).
 *
 * Não é enfeite aqui: o site se propõe a ser lido por agente, e este arquivo é o índice que
 * diz onde estão os dados e que cada página tem gêmeo em markdown. As frases fixas vêm do
 * site (`config.llms`); contagens e listas saem do banco — as do tema (o blog) e as que as
 * extensões acrescentam (`ExtensaoDoEditorial.llms`, PRD 17 RF3d).
 */
import type { APIRoute } from 'astro'
import config from 'virtual:editorial/config'
import extensoes from 'virtual:editorial/extensoes'

import type { LlmsDaExtensao } from '../extensoes'
import { listarParaSitemap } from '../lib/cms'

const COMO_LER_PADRAO = [
  'Toda página tem gêmeo em Markdown: acrescente `.md` à URL.',
  'O HTML já vem renderizado no servidor: não é preciso executar JavaScript.',
  'JSON-LD em grafo (`@id`) em cada página.',
]

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const base = `https://${tenant.canonical_host}`

  const [posts, dasExtensoes] = await Promise.all([
    listarParaSitemap('posts', tenant.id, 'atualizado_em'),
    Promise.all(extensoes.map((e) => e.llms?.(tenant, base))),
  ])
  const contribuicoes = dasExtensoes.filter((c): c is LlmsDaExtensao => c !== undefined)

  if (context.cache.enabled) {
    context.cache.set({ maxAge: 3600, swr: 600, tags: [`tenant:${tenant.slug}`, 'llms'] })
  }

  const intro = config.llms?.intro ?? []
  const linhas = [
    `# ${tenant.nome}`,
    '',
    ...(intro.length ? [...intro.map((l) => `> ${l}`), ''] : []),
    '## Como ler este site',
    '',
    ...(config.llms?.comoLer ?? COMO_LER_PADRAO).map((l) => `- ${l}`),
    '',
    '## Índices',
    '',
    `- [Blog](${base}/blog/) — ${posts.length} artigos`,
    ...contribuicoes.flatMap((c) => c.indices ?? []),
    `- [Sitemap](${base}/sitemap_index.xml)`,
    '',
    ...contribuicoes.flatMap((c) => c.secoes ?? []).flatMap((s) => [`## ${s.titulo}`, '', ...s.linhas, '']),
  ]

  return new Response(linhas.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
