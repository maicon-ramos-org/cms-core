import { expect, it, vi } from 'vitest'
import { eventoInterno, registraEvento } from '../src/grafo/eventos'

it('auditoria concorrente no mesmo req mantém a autorização até o último evento e a remove depois', async () => {
  let liberar!: () => void
  const espera = new Promise<void>(resolve => { liberar = resolve })
  const create = vi.fn()
    .mockImplementationOnce(async ({ req, data }) => eventoInterno({ req, data, operation: 'create' } as never))
    .mockImplementationOnce(async ({ req, data }) => { await espera; return eventoInterno({ req, data, operation: 'create' } as never) })
  const req = { user: { id: 123 }, payload: { create } }
  const args = { req, collection: { slug: 'entidades' }, operation: 'update', previousDoc: { nome: 'Antes' }, doc: { id: 1, tenant: 1, nome: 'Depois' } }
  const primeiro = registraEvento(args as never)
  const segundo = registraEvento({ ...args, doc: { ...args.doc, id: 2 } } as never)
  await primeiro
  liberar()
  await segundo
  expect(create).toHaveBeenCalledTimes(2)
  expect(() => eventoInterno({ req, operation: 'create', data: {} } as never)).toThrow('ator')
})
