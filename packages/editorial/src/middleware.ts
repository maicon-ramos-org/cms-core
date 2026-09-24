/**
 * PRD 02 RF1 — tenant resolvido pelo Host. Host desconhecido → 404.
 * Em dev (localhost), cai no tenant padrão do site (`ConfigDoEditorial.tenantPadrao`).
 * Cache em memória 60s pra não bater no CMS a cada request.
 *
 * Entra no site pela integração `editorial()` (PRD 17 RF3b). As regras de URL moram em
 * `regras-de-url.ts`, onde dá para testar sem o Astro.
 */
/// <reference path="./virtual.d.ts" />
import { defineMiddleware } from 'astro:middleware'
import config from 'virtual:editorial/config'

import { getTenantByHost, getTenantBySlug, type TenantDTO } from './lib/cms'
import { caminhoDoMd, isLocalhost, querMarkdown, regrasDeUrl, slugPeloSufixo, tenantPadrao } from './regras-de-url'

const { precisaDeBarra, temGemeoMd } = regrasDeUrl(config)

const cache = new Map<string, { tenant: TenantDTO | null; expira: number }>()
const TTL_MS = 60_000

async function resolveTenant(hostComPorta: string): Promise<TenantDTO | null> {
  const host = hostComPorta.split(':')[0] ?? ''
  const agora = Date.now()
  const hit = cache.get(host)
  if (hit && hit.expira > agora) return hit.tenant
  let tenant: TenantDTO | null = null
  try {
    tenant = isLocalhost(host)
      ? await getTenantBySlug(tenantPadrao(config))
      : await getTenantByHost(host)
    // fora de produção o tenant vem do subdomínio: {slug}.exemplo.local, {slug}.dev.exemplo.com
    if (!tenant) {
      const slug = slugPeloSufixo(host, config)
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
/**
 * `Link: <...>; rel="alternate"; type="text/markdown"` — RFC 8288.
 *
 * O site JÁ serve markdown por duas vias: o sufixo `.md` e a negociação por `Accept`. O que
 * faltava era o agente DESCOBRIR isso sem adivinhar: hoje ele precisa saber de antemão que
 * a convenção existe, ou tentar um header e torcer. O `Link` é o mecanismo padrão de
 * anúncio, vem na resposta que ele já está lendo, e custa uma linha.
 *
 * Vai no HTML, não na resposta markdown: anunciar a alternativa a quem já está nela é ruído.
 */
const comAlternate = (r: Response, url: string): Response => {
  const tipo = r.headers.get('content-type') ?? ''
  if (!tipo.includes('text/html')) return r
  const h = new Headers(r.headers)
  const anterior = h.get('link')
  const valor = `<${url}>; rel="alternate"; type="text/markdown"`
  h.set('link', anterior ? `${anterior}, ${valor}` : valor)
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h })
}

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
  if (!negociavel) return resposta
  return comAlternate(comVary(resposta), caminhoDoMd(context.url.pathname))
})
