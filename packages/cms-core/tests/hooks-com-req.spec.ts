/**
 * Consulta da API local feita DENTRO de uma escrita vai com o `req` dela: roda na transação e na
 * conexão que a escrita já segura. Sem `req`, pedia outra conexão enquanto a da transação estava
 * presa — com uma conexão só (Hyperdrive, Pool max 1), a escrita travava até o timeout.
 */
import { describe, expect, it, vi } from 'vitest'

import { slugDeRelacao } from '../src/hooks/revalidate'
import { uniquePorTenant } from '../src/hooks/validations'

describe('hooks do núcleo passam o req da escrita', () => {
  it('uniquePorTenant', async () => {
    const find = vi.fn(async () => ({ totalDocs: 0 }))
    const req = { payload: { find } }
    await uniquePorTenant('slug')({ data: { slug: 'a', tenant: 1 }, originalDoc: undefined, req, collection: { slug: 'tags' } } as never)
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'tags', overrideAccess: true, req }))
  })

  it('slugDeRelacao: com req e sem lançar NotFound (que desfaria a transação da escrita)', async () => {
    const findByID = vi.fn(async () => ({ slug: 'exemplo' }))
    const req = { payload: { findByID } }
    expect(await slugDeRelacao(req as never, 'tenants', 7)).toBe('exemplo')
    expect(findByID).toHaveBeenCalledWith(expect.objectContaining({ collection: 'tenants', id: 7, req, disableErrors: true, overrideAccess: true }))
    findByID.mockResolvedValueOnce(null as never)
    expect(await slugDeRelacao(req as never, 'tenants', 8)).toBeNull()
  })
})
