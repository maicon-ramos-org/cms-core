/**
 * Consulta da API local DENTRO de uma escrita vai com o `req` dela (na transação e na conexão
 * que a escrita já segura). Sem `req`, pedia outra conexão: com uma conexão só (Hyperdrive,
 * Pool max 1), a escrita travava até o timeout.
 */
import { describe, expect, it, vi } from 'vitest'

import { CategoriasOferta } from '../src/cms/collections/CategoriasOferta'
import { uniqueCupomPorLoja } from '../src/cms/hooks/cupons'

describe('hooks do afiliado passam o req da escrita', () => {
  it('uniqueCupomPorLoja', async () => {
    const find = vi.fn(async () => ({ totalDocs: 0 }))
    const req = { payload: { find } }
    await uniqueCupomPorLoja({ data: { codigo: 'X', loja: 1 }, originalDoc: undefined, req } as never)
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'cupons', req }))
  })

  it('o sinônimo de categoria busca o canônico com req', async () => {
    const findByID = vi.fn(async () => ({ navegacao: 'canonica' }))
    const req = { payload: { findByID } }
    const valida = CategoriasOferta.hooks!.beforeValidate![1]!
    await valida({ data: { navegacao: 'sinonimo', equivalente_a: 5 }, originalDoc: undefined, req, operation: 'create' } as never)
    expect(findByID).toHaveBeenCalledWith(expect.objectContaining({ collection: 'categorias_oferta', id: 5, req, disableErrors: true }))
  })
})
