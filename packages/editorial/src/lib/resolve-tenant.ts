/**
 * PRD 24 RF10.10 — resolução de tenant que DIFERENCIA "o CMS respondeu que não existe" de
 * "o CMS não respondeu".
 *
 * Antes, qualquer falha da busca (rede, DNS, tempo esgotado, HTTP 5xx — `cmsFetch` lança
 * para qualquer `!res.ok`) caía num `catch` que devolvia `null`, o mesmo valor de "tenant
 * inexistente". O middleware não tinha como distinguir os dois casos e respondia sempre o
 * mesmo 404 "Tenant não encontrado para este host." — inclusive para páginas que JÁ estavam
 * em cache: um 404 não é elegível para `stale-if-error` (a Cloudflare só serve a cópia
 * antiga quando o Worker lança, esgota o tempo ou devolve 5xx), e o visitante ficava sem a
 * página que a borda já tinha guardada.
 *
 * A função pura devolve os três resultados possíveis (`ok`, `inexistente`, `cms-fora`); quem
 * chama decide o HTTP (404 continua sendo o de tenant inexistente; `cms-fora` vira 503, que
 * a Cloudflare aceita como gatilho de `stale-if-error`). As buscas de rede entram por
 * injeção (`buscaPorHost`/`buscaPorSlug`) para o teste não depender do `fetch` real.
 */
import type { TenantDTO } from './cms'

export type ResolucaoTenant =
  | { tipo: 'ok'; tenant: TenantDTO }
  | { tipo: 'inexistente' }
  | { tipo: 'cms-fora' }

export interface DependenciasResolveTenant {
  buscaPorHost: (host: string) => Promise<TenantDTO | null>
  buscaPorSlug: (slug: string) => Promise<TenantDTO | null>
  isLocalhost: (host: string) => boolean
  slugPeloSufixo: (host: string) => string | null
  tenantPadrao: () => string
  /** O relógio — injetável só pelo teste; em produção é `Date.now`. */
  agora?: () => number
}

interface EntradaCache {
  /** O último tenant ENCONTRADO para este host, guardado sem prazo — só um novo acerto o troca. */
  bom?: { tenant: TenantDTO; expira: number }
  /** Até quando uma falha recente ainda vale, pra não bater no CMS a cada request na queda. */
  falhaAte?: number
}

/** Tenant bom, revalidado a cada 60s — o comportamento de sempre. */
const TTL_MS = 60_000

/** Uma falha do CMS vale por esse tanto antes de tentar de novo (não é o TTL do tenant bom). */
const TTL_FALHA_MS = 8_000

/**
 * Fábrica: cada chamador (o middleware, ou um teste) monta o próprio cache — um `Map` por
 * processo/isolate, como já era antes desta correção.
 */
export function criaResolveTenant(deps: DependenciasResolveTenant): (hostComPorta: string) => Promise<ResolucaoTenant> {
  const cache = new Map<string, EntradaCache>()
  const agora = deps.agora ?? Date.now

  return async function resolveTenant(hostComPorta: string): Promise<ResolucaoTenant> {
    const host = hostComPorta.split(':')[0] ?? ''
    const t = agora()
    const entrada = cache.get(host)

    if (entrada?.bom && entrada.bom.expira > t) return { tipo: 'ok', tenant: entrada.bom.tenant }

    // Falha recente ainda dentro da janela: nem tenta de novo. Serve o bom que sobreviveu
    // (mesmo vencido), ou `cms-fora` se nunca houve um bom para este host.
    if (entrada?.falhaAte && entrada.falhaAte > t) {
      return entrada.bom ? { tipo: 'ok', tenant: entrada.bom.tenant } : { tipo: 'cms-fora' }
    }

    let tenant: TenantDTO | null = null
    try {
      tenant = deps.isLocalhost(host) ? await deps.buscaPorSlug(deps.tenantPadrao()) : await deps.buscaPorHost(host)
      // fora de produção o tenant vem do subdomínio: {slug}.exemplo.local, {slug}.dev.exemplo.com
      if (!tenant) {
        const slug = deps.slugPeloSufixo(host)
        if (slug) tenant = await deps.buscaPorSlug(slug)
      }
    } catch (err) {
      console.error('[middleware] CMS indisponível ao resolver tenant:', (err as Error).message)
      cache.set(host, { bom: entrada?.bom, falhaAte: t + TTL_FALHA_MS })
      // a cópia boa que já tínhamos (de qualquer idade) continua valendo enquanto o CMS
      // estiver fora — é o que impede a revalidação de trocar a cópia boa por um erro.
      return entrada?.bom ? { tipo: 'ok', tenant: entrada.bom.tenant } : { tipo: 'cms-fora' }
    }

    if (tenant) {
      cache.set(host, { bom: { tenant, expira: t + TTL_MS } })
      return { tipo: 'ok', tenant }
    }
    // o CMS respondeu e não achou — isso é diferente de não ter respondido; limpa qualquer
    // resquício de falha/tenant velho para este host.
    cache.set(host, {})
    return { tipo: 'inexistente' }
  }
}
