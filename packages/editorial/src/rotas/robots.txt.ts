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

import config from 'virtual:editorial/config'

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
  // o que o site fecha além da API — no afiliado, o redirect `/r/`, que não é conteúdo
  const bloqueios = config.robotsBloqueia ?? []

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
        ...bloqueios.flatMap((b) => [`# ${b.motivo}`, `Disallow: ${b.caminho}`]),
        '# endpoints internos',
        'Disallow: /api/',
        '',
        // Bots de IA liberados EXPLICITAMENTE: ser lido por agente é o produto, não um
        // efeito colateral. Nomeá-los evita que uma regra futura mais restritiva no
        // `*` os pegue junto sem ninguém perceber.
        ...BOTS_DE_IA.flatMap((bot) => [`User-agent: ${bot}`, 'Allow: /', ...bloqueios.map((b) => `Disallow: ${b.caminho}`), '']),
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
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      /*
       * TTL CURTO DE PROPÓSITO, e curto na BORDA (`s-maxage`), que é onde doeu.
       *
       * Sem header próprio este arquivo herdava 4 horas do CDN, e isso é errado para um
       * arquivo de CONTROLE: o custo de servir robots.txt velho não é uma página
       * desatualizada, é uma política que ninguém obedece pelo tempo do cache. Aconteceu
       * duas vezes em 2026-09-07/08 — uma com o robots do WordPress sobrevivendo à virada,
       * outra com o `Content-Signal` recém-publicado invisível por horas.
       *
       * A invalidação por tag do `cache.set` acima resolve o NOSSO cache e não toca no da
       * borda; só o header alcança os dois. São ~1KB: 5 minutos de TTL não pesa em nada.
       */
      'cache-control': 'public, max-age=300, s-maxage=300, must-revalidate',
    },
  })
}
