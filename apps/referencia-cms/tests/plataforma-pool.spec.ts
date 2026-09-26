import { afterEach, describe, expect, it, vi } from 'vitest'
import { opcoesPoolFixture, plataformaPoolFixture } from '../src/plataforma-pool'

afterEach(() => vi.unstubAllGlobals())
describe('plataforma da fixture PostgreSQL', () => {
  it('Node permanece sem plugin, conexão ou callback novo', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Node.js' })
    expect(await plataformaPoolFixture()).toEqual({})
  })
  it('waitUntil pertence ao contexto atual e não cai no bootstrap', () => {
    const env = { HYPERDRIVE: { connectionString: 'postgres://fixture' } }
    const inicial = { env, ctx: { waitUntil: vi.fn() } }, seguinte = { env, ctx: { waitUntil: vi.fn() } }
    let contexto = inicial
    const config = opcoesPoolFixture(() => contexto)
    expect(config.plugins).toHaveLength(1)
    expect(config.sharp).toBeNull()
    const promessa = Promise.resolve()
    contexto = seguinte
    config.revalidacao!.emSegundoPlano!(promessa)
    expect(seguinte.ctx.waitUntil).toHaveBeenCalledWith(promessa)
    expect(inicial.ctx.waitUntil).not.toHaveBeenCalled()
    contexto = { env, ctx: undefined as never }
    expect(() => config.revalidacao!.emSegundoPlano!(promessa)).toThrow()
    expect(inicial.ctx.waitUntil).not.toHaveBeenCalled()
  })
  it('binding ausente não usa DATABASE_URL ou uma conexão anterior', () => {
    expect(() => opcoesPoolFixture(() => ({ env: {}, ctx: { waitUntil() {} } }))).toThrow(/contexto e binding/)
  })
  it('reader só ativa com flag explícita da fixture, não por instalar o wrapper', () => {
    const env = { HYPERDRIVE: { connectionString: 'postgres://fixture' } }
    const ctx = { waitUntil() {} }
    expect(opcoesPoolFixture(() => ({ env, ctx })).siteReader).toBeUndefined()
    expect(opcoesPoolFixture(() => ({ env: { ...env, TESTAR_SITE_READER: '1' }, ctx })).siteReader).toBe(true)
  })
})
