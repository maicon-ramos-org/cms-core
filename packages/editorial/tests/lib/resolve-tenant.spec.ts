/**
 * PRD 24 RF10.10 — TDD da resolução de tenant que diferencia "CMS respondeu que não existe"
 * de "CMS não respondeu" (rede, timeout ou 5xx — tudo que `cmsFetch` lança).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { criaResolveTenant, type DependenciasResolveTenant } from '../../src/lib/resolve-tenant'
import type { TenantDTO } from '../../src/lib/cms'

const tenantPrincipal: TenantDTO = { id: 1, slug: 'principal', nome: 'Principal', canonical_host: 'exemplo.test' }
const tenant3d: TenantDTO = { id: 2, slug: '3d', nome: '3D', canonical_host: '3d.exemplo.test' }

/**
 * `buscaPorHost`/`buscaPorSlug` como parâmetro ficam FORA de `DependenciasResolveTenant`
 * de propósito: passando pela interface (função pura, sem métodos de mock) o teste perderia
 * `mockImplementationOnce`/`mockResolvedValueOnce`. Aqui o `vi.fn()` mantém o tipo completo,
 * e só é atribuído a `deps.buscaPorHost` — atribuir um mock a um campo tipado como função
 * simples é permitido (o mock TEM a assinatura, só tem mais coisa); ler de volta é que perde.
 */
function montaDeps(opts: {
  buscaPorHost?: ReturnType<typeof vi.fn<(host: string) => Promise<TenantDTO | null>>>
  slugPeloSufixo?: (host: string) => string | null
} = {}) {
  let relogio = 0
  const buscaPorHost =
    opts.buscaPorHost ?? vi.fn(async (host: string): Promise<TenantDTO | null> => (host === 'exemplo.test' ? tenantPrincipal : null))
  const buscaPorSlug = vi.fn(async (slug: string): Promise<TenantDTO | null> =>
    slug === 'principal' ? tenantPrincipal : slug === '3d' ? tenant3d : null,
  )
  const deps: DependenciasResolveTenant = {
    buscaPorHost,
    buscaPorSlug,
    isLocalhost: (host) => host === 'localhost',
    slugPeloSufixo: opts.slugPeloSufixo ?? (() => null),
    tenantPadrao: () => 'principal',
    agora: () => relogio,
  }
  return { deps, buscaPorHost, buscaPorSlug, avanca: (ms: number) => (relogio += ms) }
}

describe('criaResolveTenant', () => {
  let deps: ReturnType<typeof montaDeps>

  beforeEach(() => {
    deps = montaDeps()
  })

  it('tenant encontrado: tipo ok', async () => {
    const resolveTenant = criaResolveTenant(deps.deps)
    const r = await resolveTenant('exemplo.test')
    expect(r).toEqual({ tipo: 'ok', tenant: tenantPrincipal })
  })

  it('CMS respondeu e não achou (busca devolve null): tipo inexistente, NUNCA cms-fora', async () => {
    const resolveTenant = criaResolveTenant(deps.deps)
    const r = await resolveTenant('desconhecido.test')
    expect(r).toEqual({ tipo: 'inexistente' })
  })

  it('busca que LANÇA (rede, timeout ou 5xx — o que `cmsFetch` lança) dá cms-fora, nunca inexistente', async () => {
    const { deps: d } = montaDeps({
      buscaPorHost: vi.fn(async () => {
        throw new Error('fetch failed')
      }),
    })
    const resolveTenant = criaResolveTenant(d)
    const r = await resolveTenant('exemplo.test')
    expect(r).toEqual({ tipo: 'cms-fora' })
  })

  it('HTTP 5xx (o mesmo `throw` de `cmsFetch` para qualquer !res.ok) também dá cms-fora', async () => {
    const { deps: d } = montaDeps({
      buscaPorHost: vi.fn(async () => {
        throw new Error('CMS /api/tenants → HTTP 502')
      }),
    })
    const resolveTenant = criaResolveTenant(d)
    const r = await resolveTenant('exemplo.test')
    expect(r).toEqual({ tipo: 'cms-fora' })
  })

  it('revalidação com o CMS fora NÃO troca a cópia boa: depois do TTL, uma falha devolve o último tenant bom', async () => {
    const { deps: d, buscaPorHost, avanca } = deps
    const resolveTenant = criaResolveTenant(d)

    const primeiro = await resolveTenant('exemplo.test')
    expect(primeiro).toEqual({ tipo: 'ok', tenant: tenantPrincipal })

    avanca(61_000) // além do TTL de 60s do tenant bom — força nova consulta
    buscaPorHost.mockImplementationOnce(async () => {
      throw new Error('fetch failed')
    })

    const segundo = await resolveTenant('exemplo.test')
    expect(segundo).toEqual({ tipo: 'ok', tenant: tenantPrincipal })
  })

  it('sem nenhum tenant bom anterior, a falha dá cms-fora mesmo depois de tentar de novo', async () => {
    const { deps: d, buscaPorHost, avanca } = montaDeps({
      buscaPorHost: vi.fn(async () => {
        throw new Error('fetch failed')
      }),
    })
    const resolveTenant = criaResolveTenant(d)

    const primeiro = await resolveTenant('exemplo.test')
    expect(primeiro).toEqual({ tipo: 'cms-fora' })

    avanca(9_000) // além da janela de falha (8s) — tentaria de novo
    const segundo = await resolveTenant('exemplo.test')
    expect(segundo).toEqual({ tipo: 'cms-fora' })
    expect(buscaPorHost).toHaveBeenCalledTimes(2)
  })

  it('durante a janela de falha (8s), não bate no CMS de novo a cada request', async () => {
    const { deps: d, buscaPorHost, avanca } = montaDeps({
      buscaPorHost: vi.fn(async () => {
        throw new Error('fetch failed')
      }),
    })
    const resolveTenant = criaResolveTenant(d)

    await resolveTenant('exemplo.test')
    avanca(1_000)
    await resolveTenant('exemplo.test')
    avanca(1_000)
    await resolveTenant('exemplo.test')

    expect(buscaPorHost).toHaveBeenCalledTimes(1)
  })

  it('tenant realmente inexistente continua 404 mesmo repetindo a consulta (sem cache de sucesso)', async () => {
    const resolveTenant = criaResolveTenant(deps.deps)
    await resolveTenant('desconhecido.test')
    const r = await resolveTenant('desconhecido.test')
    expect(r).toEqual({ tipo: 'inexistente' })
    expect(deps.buscaPorHost).toHaveBeenCalledTimes(2)
  })

  it('um tenant novo substitui o anterior depois do TTL (comportamento de sempre, sem falha no meio)', async () => {
    const { deps: d, buscaPorHost, avanca } = deps
    const resolveTenant = criaResolveTenant(d)
    await resolveTenant('exemplo.test')

    avanca(61_000)
    const outroTenant: TenantDTO = { ...tenantPrincipal, nome: 'Principal (editado)' }
    buscaPorHost.mockResolvedValueOnce(outroTenant)

    const r = await resolveTenant('exemplo.test')
    expect(r).toEqual({ tipo: 'ok', tenant: outroTenant })
  })

  it('localhost usa o tenant padrão pelo slug, não a busca por host', async () => {
    const resolveTenant = criaResolveTenant(deps.deps)
    const r = await resolveTenant('localhost:4321')
    expect(r).toEqual({ tipo: 'ok', tenant: tenantPrincipal })
    expect(deps.buscaPorHost).not.toHaveBeenCalled()
  })

  it('host sem tenant direto cai no slug pelo sufixo de dev', async () => {
    const { deps: d } = montaDeps({ slugPeloSufixo: (host) => (host === '3d.exemplo.local' ? '3d' : null) })
    const resolveTenant = criaResolveTenant(d)
    const r = await resolveTenant('3d.exemplo.local')
    expect(r).toEqual({ tipo: 'ok', tenant: tenant3d })
  })
})
