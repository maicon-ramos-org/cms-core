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
    // hosts de dev por tenant: {slug}.runzos.local → resolve pelo slug
    if (!tenant && host.endsWith('.runzos.local')) {
      tenant = await getTenantBySlug(host.replace('.runzos.local', ''))
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

export const onRequest = defineMiddleware(async (context, next) => {
  // rota de webhook não depende de tenant (autentica por token próprio)
  if (context.url.pathname === '/api/revalidate' || context.url.pathname === '/healthz') {
    return next()
  }

  // /feed/ é a URL do WP; internamente a rota é feed.xml
  if (context.url.pathname === '/feed' || context.url.pathname === '/feed/') {
    return context.rewrite('/feed.xml')
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
  return next()
})
