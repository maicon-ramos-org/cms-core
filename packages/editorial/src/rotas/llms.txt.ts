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

const COMO_LER_PADRAO = [
  'Toda página tem gêmeo em Markdown: acrescente `.md` à URL.',
  'O HTML já vem renderizado no servidor: não é preciso executar JavaScript.',
  'JSON-LD em grafo (`@id`) em cada página.',
]

export const GET: APIRoute = (context) => {
  const tenant = context.locals.tenant
  const base = `https://${tenant.canonical_host}`
  const indices = [...(config.llms?.indices ?? []), ...(config.llms?.indicesPorTenant?.[tenant.slug] ?? [])]

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
    `- [Blog](${base}/blog/)`,
    ...indices.map((i) => `- [${i.titulo}](${base}${i.caminho})${i.descricao ? ` — ${i.descricao}` : ''}`),
    `- [Busca](${base}/busca/)`,
    `- [Sitemap](${base}/sitemap_index.xml)`,
    '',
  ]

  return new Response(linhas.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
