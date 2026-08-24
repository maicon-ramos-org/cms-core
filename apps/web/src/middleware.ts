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

export const onRequest = defineMiddleware(async (context, next) => {
  // rota de webhook não depende de tenant (autentica por token próprio)
  if (context.url.pathname === '/api/revalidate' || context.url.pathname === '/healthz') {
    return next()
  }
  const tenant = await resolveTenant(context.request.headers.get('host') ?? '')
  if (!tenant) {
    return new Response('Tenant não encontrado para este host.', { status: 404 })
  }
  context.locals.tenant = tenant
  return next()
})
