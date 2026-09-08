/**
 * PRD 02 RF1 — tenant resolvido pelo Host. Host desconhecido → 404.
 * Em dev (localhost), cai no DEFAULT_TENANT (runzos).
 * Cache em memória 60s pra não bater no CMS a cada request.
 */
import { defineMiddleware } from 'astro:middleware'

import { getTenantByHost, getTenantBySlug, type TenantDTO } from './lib/cms'

const cache = new Map<string, { tenant: TenantDTO | null; expira: number }>()
const TTL_MS = 60_000

const isLocalhost = (host: string) =>
  host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')

/**
 * Sufixos em que o tenant vem do SUBDOMÍNIO, e não do `canonical_host`.
 *
 * Existe porque fora de produção o host NUNCA é o canônico: o mesmo tenant é
 * `3d.runzos.com` em produção, `3d.dev.runzos.com` em staging e `3d.runzos.local` na
 * máquina — e canonizar staging pra si mesmo é justamente o que o ADR-0004 proíbe. Sem
 * esta regra, staging responde 404 em todo tenant que não seja o default.
 *
 * O sufixo NU (`dev.runzos.com`, sem subdomínio) cai no DEFAULT_TENANT — mesmo contrato
 * do localhost.
 */
const SUFIXOS_DE_SLUG = (process.env.HOST_SUFIXOS_TENANT ?? '.runzos.local')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

/** `3d.dev.runzos.com` → `3d`; `dev.runzos.com` → o default; fora dos sufixos → null. */
const slugPeloSufixo = (host: string): string | null => {
  for (const sufixo of SUFIXOS_DE_SLUG) {
    if (host === sufixo.replace(/^\./, '')) return process.env.DEFAULT_TENANT ?? 'runzos'
    if (host.endsWith(sufixo)) return host.slice(0, -sufixo.length)
  }
  return null
}

async function resolveTenant(hostComPorta: string): Promise<TenantDTO | null> {
  const host = hostComPorta.split(':')[0] ?? ''
  const agora = Date.now()
  const hit = cache.get(host)
  if (hit && hit.expira > agora) return hit.tenant
  let tenant: TenantDTO | null = null
  try {
    tenant = isLocalhost(host)
      ? await getTenantBySlug(process.env.DEFAULT_TENANT ?? 'runzos')
      : await getTenantByHost(host)
    // fora de produção o tenant vem do subdomínio: {slug}.runzos.local, {slug}.dev.runzos.com
    if (!tenant) {
      const slug = slugPeloSufixo(host)
      if (slug) tenant = await getTenantBySlug(slug)
    }
  } catch (err) {
    console.error('[middleware] CMS indisponível ao resolver tenant:', (err as Error).message)
    return hit?.tenant ?? null
  }
  cache.set(host, { tenant, expira: agora + TTL_MS })
  return tenant
}

/**
 * Paridade de URL: o WordPress serve TUDO com barra final e 301 quem chega sem ela.
 * Sem reproduzir isso, cada URL do acervo vira duas (mesmo conteúdo em /x e /x/), o
 * canonical diverge do que já está indexado, e o diff da Fase D acusa 100% das páginas.
 *
 * Fora da regra: arquivos com extensão (.md, .xml, .txt, /fontes/*), a API, o healthz e
 * o redirect de afiliado — nenhum deles é URL de conteúdo indexável.
 */
const SEM_BARRA = /^\/(api|r)\//
const EH_ARQUIVO = /\.[a-z0-9]+$/i

const precisaDeBarra = (pathname: string): boolean =>
  pathname !== '/' &&
  !pathname.endsWith('/') &&
  !SEM_BARRA.test(pathname) &&
  !EH_ARQUIVO.test(pathname) &&
  pathname !== '/healthz'

/**
 * `text/markdown` só vence se vier antes de `text/html` na ordem do header. Navegador
 * sempre manda html primeiro; quem pede markdown explicitamente coloca ele na frente.
 */
const querMarkdown = (accept: string): boolean => {
  const tipos = accept
    .split(',')
    .map((t) => t.split(';')[0]!.trim().toLowerCase())
    .filter(Boolean)
  const md = tipos.indexOf('text/markdown')
  if (md === -1) return false
  const html = tipos.indexOf('text/html')
  return html === -1 || md < html
}

/** Rotas que têm gêmeo `.md`. Fora daqui, o header é ignorado e serve HTML. */
const temGemeoMd = (p: string): boolean =>
  /^\/(ofertas|apps|modelos|automacoes)\/[^/]+\/$/.test(p) || (/^\/[^/]+\/$/.test(p) && !ROTAS_SEM_MD.has(p))

// os HUBS não têm gêmeo `.md` — só as fichas. Sem `/modelos/` e `/automacoes/` aqui, o
// segundo ramo da regra acima os trataria como página de raiz e reescreveria pra
// `/modelos.md`, que não existe: agente pedindo markdown no hub receberia 404.
const ROTAS_SEM_MD = new Set([
  '/',
  '/blog/',
  '/ofertas/',
  '/apps/',
  '/modelos/',
  '/automacoes/',
  '/lifetimes/',
  '/busca/',
  '/glossario/',
])

const caminhoDoMd = (p: string): string => `${p.replace(/\/$/, '')}.md`

/**
 * `Vary: Accept` nas rotas que negociam formato — e vai nas DUAS variantes, não só na
 * markdown: um cache precisa saber que a URL varia ANTES de guardar a primeira resposta.
 *
 * Nosso cache de rota não estava em risco, porque a negociação passa por `rewrite` e a
 * variante markdown é guardada sob a chave `/post.md`. O risco é de fora: a mesma URL
 * devolve HTML ou markdown conforme o header, e sem `Vary` qualquer cache intermediário
 * pode guardar a variante que viu primeiro e servir a todo mundo. Hoje a Cloudflare
 * responde `DYNAMIC` no HTML e nada é guardado — mas "hoje" é uma configuração, não uma
 * garantia, e este site é desenhado justamente para ser cacheável na borda. O dia em que
 * alguém ligar isso, um agente pedindo markdown envenena a página para os leitores.
 *
 * Achado a partir de um scan externo de prontidão para agentes, que mostrou a página
 * respondendo `text/markdown` em checagens onde deveria vir HTML.
 */
const comVary = (r: Response): Response => {
  const anterior = r.headers.get('vary')
  if (anterior?.toLowerCase().includes('accept')) return r
  const h = new Headers(r.headers)
  h.set('vary', anterior ? `${anterior}, Accept` : 'Accept')
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h })
}

export const onRequest = defineMiddleware(async (context, next) => {
  // rota de webhook não depende de tenant (autentica por token próprio)
  if (context.url.pathname === '/api/revalidate' || context.url.pathname === '/healthz') {
    return next()
  }

  // /feed/ é a URL do WP; internamente a rota é feed.xml
  if (context.url.pathname === '/feed' || context.url.pathname === '/feed/') {
    return context.rewrite('/feed.xml')
  }

  /*
   * NEGOCIAÇÃO DE MARKDOWN — `Accept: text/markdown` devolve o gêmeo `.md` da página.
   *
   * O site já servia o markdown, mas só pelo sufixo (`/post.md`). O agente precisa
   * DESCOBRIR essa convenção; o header é o caminho que ele já tenta por padrão, e é o que
   * a Cloudflare padronizou. Mesma URL, mesmo canonical, formato conforme quem pede.
   *
   * Só quando `text/markdown` vem ANTES de `text/html` na lista: navegador manda
   * `text/html,...;q=0.9,*&#47;*;q=0.8` e não pode receber markdown por engano.
   */
  const aceita = context.request.headers.get('accept') ?? ''
  const negociavel = temGemeoMd(context.url.pathname)
  if (querMarkdown(aceita) && negociavel) {
    const r = await context.rewrite(caminhoDoMd(context.url.pathname))
    return comVary(r)
  }

  if (precisaDeBarra(context.url.pathname)) {
    const destino = new URL(context.url)
    destino.pathname = `${context.url.pathname}/`
    // 301 como o WP: é a mesma canonicalização que o acervo já tem indexada
    return context.redirect(destino.toString(), 301)
  }
  const tenant = await resolveTenant(context.request.headers.get('host') ?? '')
  if (!tenant) {
    return new Response('Tenant não encontrado para este host.', { status: 404 })
  }
  context.locals.tenant = tenant
  const resposta = await next()
  return negociavel ? comVary(resposta) : resposta
})
