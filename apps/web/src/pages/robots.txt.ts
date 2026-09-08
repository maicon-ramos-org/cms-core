/**
 * robots.txt por tenant. Duas regras duras do projeto moram aqui:
 *
 * 1. STAGING nunca indexável, PRODUÇÃO nunca com noindex. O sinal é o host: qualquer
 *    host diferente do canônico do tenant (staging, preview, localhost) recebe
 *    `Disallow: /`. Assim não existe "esqueci de tirar o noindex" nem o contrário — o
 *    smoke de deploy (PRD 09 RF2) checa os dois lados.
 * 2. `/r/` fora do índice: é redirect de afiliado, não conteúdo.
 */
import type { APIRoute } from 'astro'

import { ehStaging } from '../lib/sitemap'

/** Crawlers de IA que queremos explicitamente dentro (PRD 09 RF3 mede quem lê). */
const BOTS_DE_IA = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'CCBot',
  'Applebot-Extended',
]

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const host = context.request.headers.get('host') ?? ''
  const staging = ehStaging(host, tenant)

  const linhas = staging
    ? ['# ambiente de staging/preview — fora do índice', 'User-agent: *', 'Disallow: /']
    : [
        /*
         * CONTENT SIGNALS (contentsignals.org) — a política deste negócio em três palavras.
         *
         * `robots.txt` só sabe dizer "pode ler" ou "não pode ler", e a pergunta que importa
         * aqui é outra: pode ler PRA QUÊ. Ser citado numa resposta de IA é o produto —
         * `search` e `ai-input` são sim, sem hesitação. Virar corpus de treino não devolve
         * nada: nem visita, nem crédito, nem comissão, e o conteúdo é pesquisa de preço com
         * data de conferência, que custa caro pra levantar.
         *
         * O sinal é declaração de preferência, não trava técnica — quem ignora, ignora. Vale
         * porque quem respeita passa a ter uma regra explícita para respeitar, em vez de
         * inferir da nossa omissão.
         */
        'Content-Signal: search=yes, ai-input=yes, ai-train=no',
        '',
        'User-agent: *',
        'Allow: /',
        '# redirect de afiliado não é conteúdo',
        'Disallow: /r/',
        '# endpoints internos',
        'Disallow: /api/',
        '',
        // Bots de IA liberados EXPLICITAMENTE: ser lido por agente é o produto, não um
        // efeito colateral. Nomeá-los evita que uma regra futura mais restritiva no
        // `*` os pegue junto sem ninguém perceber.
        ...BOTS_DE_IA.flatMap((bot) => [`User-agent: ${bot}`, 'Allow: /', 'Disallow: /r/', '']),
        `# mapa para agentes: https://${tenant.canonical_host}/llms.txt`,
        `# RSS: https://${tenant.canonical_host}/feed/`,
        ...(tenant.seo?.sitemap_enabled === false
          ? []
          : [`Sitemap: https://${tenant.canonical_host}/sitemap_index.xml`]),
      ]

  if (context.cache.enabled) {
    context.cache.set({ maxAge: 3600, swr: 600, tags: [`tenant:${tenant.slug}`, 'robots'] })
  }

  return new Response(`${linhas.join('\n')}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
