import type { CollectionAfterChangeHook, CollectionBeforeValidateHook } from 'payload'
import { invalidoGrafo } from './validacao'

const internos = new WeakSet<object>()

export const eventoInterno: CollectionBeforeValidateHook = ({ req, operation, data }) => {
  if (operation !== 'create' || !internos.has(req)) invalidoGrafo('ator', 'Eventos são append-only e escritos pelo servidor.')
  return data
}

export const registraEvento: CollectionAfterChangeHook = async ({ req, doc, previousDoc, collection, operation }) => {
  const campos = Object.keys(doc).filter(c => !['id', 'createdAt', 'updatedAt'].includes(c)
    && JSON.stringify(doc[c]) !== JSON.stringify(previousDoc?.[c]))
  internos.add(req)
  try {
    await req.payload.create({ collection: 'eventos' as never, req, overrideAccess: true,
      data: { tenant: doc.tenant, colecao: collection.slug, doc: String(doc.id), acao: operation,
        ator: req.user?.id ?? null, campos } as never })
  } finally { internos.delete(req) }
  return doc
}
