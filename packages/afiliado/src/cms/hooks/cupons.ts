import { ValidationError, type CollectionBeforeValidateHook } from 'payload'

import { efetivo } from '@maicon-ramos-org/cms-core'

/** Cupons — unicidade (loja, codigo); backstop no banco via indexes da coleção. */
export const uniqueCupomPorLoja: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  const codigo = efetivo<string>(data, originalDoc, 'codigo')
  const loja = efetivo<string | number | { id?: string | number }>(data, originalDoc, 'loja')
  if (!codigo || !loja) return data
  const lojaId = typeof loja === 'object' ? loja.id : loja
  if (!lojaId) return data
  const where: Record<string, unknown> = {
    and: [{ codigo: { equals: codigo } }, { loja: { equals: lojaId } }],
  }
  const idAtual = originalDoc?.id ?? data?.id
  if (idAtual) (where.and as unknown[]).push({ id: { not_equals: idAtual } })
  const existentes = await req.payload.find({
    collection: 'cupons',
    where: where as never,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existentes.totalDocs > 0) {
    throw new ValidationError({
      collection: 'cupons',
      errors: [{ message: `O código "${codigo}" já existe para esta loja.`, path: 'codigo' }],
    })
  }
  return data
}
