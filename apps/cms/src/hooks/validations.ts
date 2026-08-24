import { APIError, ValidationError, type CollectionBeforeValidateHook, type CollectionBeforeChangeHook } from 'payload'

import { hasRole, isSuperAdmin } from '../access/roles'

/**
 * Unicidade composta (tenant, campo) — contrato colecoes.md: "slug unique POR tenant".
 * O plugin multi-tenant não cria índice composto; garantimos por validação
 * (e o erro volta como 400 com `path` — o contrato pro agente).
 */
export const uniquePorTenant =
  (campo: string): CollectionBeforeValidateHook =>
  async ({ data, originalDoc, req, collection }) => {
    const valor = (data?.[campo] ?? originalDoc?.[campo]) as string | undefined
    const tenant = (data?.tenant ?? originalDoc?.tenant) as string | number | { id?: string | number } | undefined
    if (!valor || !tenant || !collection) return data
    const tenantId = typeof tenant === 'object' ? tenant.id : tenant
    if (!tenantId) return data
    const where: Record<string, unknown> = {
      and: [{ [campo]: { equals: valor } }, { tenant: { equals: tenantId } }],
    }
    const idAtual = originalDoc?.id ?? data?.id
    if (idAtual) (where.and as unknown[]).push({ id: { not_equals: idAtual } })
    const existentes = await req.payload.find({
      collection: collection.slug as never,
      where: where as never,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existentes.totalDocs > 0) {
      throw new ValidationError({
        collection: collection.slug,
        errors: [{ message: `Já existe outro documento com ${campo}="${valor}" neste tenant.`, path: campo }],
      })
    }
    return data
  }

/** Cupons — unicidade (loja, codigo) dentro do tenant. */
export const uniqueCupomPorLoja: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  const codigo = (data?.codigo ?? originalDoc?.codigo) as string | undefined
  const loja = (data?.loja ?? originalDoc?.loja) as string | number | { id?: string | number } | undefined
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

/** PRD 01 RF3 — role `ingestao` só cria/edita DRAFT; publicar é de outro papel. */
export const draftOnlyIngestao: CollectionBeforeChangeHook = ({ data, req }) => {
  const user = req.user as { roles?: string[] } | null
  if (!user) return data
  const soIngestao =
    hasRole(user, 'ingestao') &&
    !isSuperAdmin(user) &&
    !hasRole(user, 'agente') &&
    !hasRole(user, 'editor')
  if (soIngestao && data?._status === 'published') {
    throw new APIError('Papel "ingestao" só pode salvar rascunhos (draft). Publicação é de outro papel.', 403)
  }
  return data
}
