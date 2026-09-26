import { describe, expect, it } from 'vitest'
import { authenticated, hasRole, isSuperAdmin, podeEscreverConteudo, sistemaOnly } from '../src/access/roles'
import { identidadeSiteReader, temPapelSiteReader, tenantUnicoSiteReader } from '../src/site-reader/principal'
import { validaPrincipalSiteReader } from '../src/site-reader/provisionamento'

const reader = { collection: 'users', roles: ['site-reader'], _strategy: 'api-key', enableAPIKey: true, tenants: [{ tenant: 23 }], apiKey: 'fixture', email: 'fixture@example.test' }

describe('principal reader exclusivo', () => {
  it.each(['super-admin', 'editor', 'agente', 'ingestao', 'sistema'] as const)('presença de reader precede privilégio %s', async papel => {
    const user = { ...reader, roles: [papel, 'site-reader'] }
    expect(temPapelSiteReader(user)).toBe(true)
    expect(identidadeSiteReader(user)).toBeNull()
    expect(hasRole(user, papel)).toBe(false)
    expect(isSuperAdmin(user)).toBe(false)
    for (const access of [authenticated, podeEscreverConteudo, sistemaOnly]) expect(await access({ req: { user } } as never)).toBe(false)
  })
  it('projeção não espalha usuário, tenant populado ou credencial', () => {
    expect(identidadeSiteReader({ ...reader, tenants: [{ tenant: { id: 23, nome: 'não expor', segredo: 'fixture' } }] }))
      .toEqual({ versao: 1, papel: 'site-reader', tenantId: '23' })
  })
  it.each([undefined, null, [], [{ tenant: 23 }, { tenant: 23 }], [{ tenant: null }], [{ tenant: '' }], [{ tenant: 0 }], [{ tenant: {} }]].map(tenants => [tenants]))('nega tenant inválido: %j', tenants => {
    expect(tenantUnicoSiteReader(tenants)).toBeNull()
    expect(identidadeSiteReader({ ...reader, tenants })).toBeNull()
  })
  it.each([{ roles: ['site-reader', 'site-reader'] }, { roles: 'site-reader' }, { _strategy: 'local-jwt' }, { collection: 'outro' }, { enableAPIKey: false }])('nega identidade incompatível: %j', dados => {
    expect(identidadeSiteReader({ ...reader, ...dados })).toBeNull()
  })
  it('valida PATCH pelo documento efetivo e não ignora null explícito', () => {
    expect(validaPrincipalSiteReader({ data: { nome: 'Novo nome' }, originalDoc: reader } as never)).toEqual({ nome: 'Novo nome' })
    expect(() => validaPrincipalSiteReader({ data: { tenants: null }, originalDoc: reader } as never)).toThrow()
    expect(() => validaPrincipalSiteReader({ data: { roles: ['editor', 'site-reader'] }, originalDoc: reader } as never)).toThrow()
  })
})
