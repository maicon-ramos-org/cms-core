import { expect, it, vi } from 'vitest'
import { eventoInterno, registraEvento, rejeitaSelecaoNaEscritaAuditada } from '../src/grafo/eventos'

async function camposAuditados(fields: unknown[], previousDoc: Record<string, unknown>, doc: Record<string, unknown>) {
  const create = vi.fn().mockResolvedValue({})
  const req = { user: { id: 123 }, payload: { create } }
  await registraEvento({ req, collection: { slug: 'claims', fields }, operation: 'update', previousDoc, doc } as never)
  return create.mock.calls[0]![0].data.campos as string[]
}

it('select é recusado antes de create/update/restore, mas segue disponível na leitura', () => {
  const args = { select: { tenant: true } }
  for (const operation of ['create', 'update', 'restoreVersion']) {
    let erro: unknown
    try { rejeitaSelecaoNaEscritaAuditada({ args, operation } as never) } catch (e) { erro = e }
    expect(erro).toMatchObject({ status: 400, data: { errors: [expect.objectContaining({ path: 'select' })] } })
  }
  expect(rejeitaSelecaoNaEscritaAuditada({ args, operation: 'read' } as never)).toBe(args)
  expect(rejeitaSelecaoNaEscritaAuditada({ args: { select: undefined }, operation: 'update' } as never))
    .toEqual({ select: undefined })
})

it('PATCH de proveniência não marca relações apenas populadas pelo afterRead', async () => {
  const fields = [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants' },
    { name: 'entidade', type: 'relationship', relationTo: 'entidades' },
    { name: 'fonte', type: 'relationship', relationTo: 'fontes' },
    { name: 'status_na_origem', type: 'select' },
    { name: 'valor', type: 'json' },
  ]
  const previousDoc = { id: 7, tenant: 1, entidade: 2, fonte: 3, status_na_origem: null, valor: { id: 9, nota: 'JSON' } }
  const doc = { ...previousDoc, tenant: { id: 1, slug: 'tenant' }, entidade: { id: 2, nome: 'Entidade' },
    fonte: { id: 3, url: 'https://fixture.invalid' }, status_na_origem: 'vigente' }
  expect(await camposAuditados(fields, previousDoc, doc)).toEqual(['status_na_origem'])
  expect(await camposAuditados(fields, previousDoc, { ...doc, entidade: { id: 4, nome: 'Outra' } }))
    .toEqual(['entidade', 'status_na_origem'])
  expect(await camposAuditados(fields, previousDoc, { ...doc, valor: { id: 9, nota: 'JSON mudou' } }))
    .toEqual(['status_na_origem', 'valor'])
})

it('upload, listas e relações polimórficas comparam identidade sem perder mudanças reais', async () => {
  const fields = [
    { name: 'capa', type: 'upload', relationTo: 'midia' },
    { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true },
    { name: 'vinculos', type: 'relationship', relationTo: ['posts', 'pages'], hasMany: true },
    { name: 'meta', type: 'json' },
  ]
  const previousDoc = { id: 8, capa: 4, tags: [1, 2], vinculos: [{ relationTo: 'posts', value: 5 }],
    meta: { imagem: { id: 4, legenda: 'antes' } } }
  const populated = { ...previousDoc, capa: { id: 4, url: '/capa.webp' }, tags: [{ id: 1, nome: 'A' }, { id: 2, nome: 'B' }],
    vinculos: [{ relationTo: 'posts', value: { id: 5, titulo: 'Post' } }] }
  expect(await camposAuditados(fields, previousDoc, populated)).toEqual([])
  expect(await camposAuditados(fields, previousDoc, { ...populated, capa: { id: 6 } })).toEqual(['capa'])
  expect(await camposAuditados(fields, previousDoc, { ...populated, tags: [...populated.tags].reverse() })).toEqual(['tags'])
  expect(await camposAuditados(fields, previousDoc, { ...populated, vinculos: [{ relationTo: 'pages', value: { id: 5 } }] }))
    .toEqual(['vinculos'])
  expect(await camposAuditados(fields, previousDoc, { ...populated, meta: { imagem: { id: 4, legenda: 'depois' } } }))
    .toEqual(['meta'])
})

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
