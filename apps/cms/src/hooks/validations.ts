import { APIError, ValidationError, type CollectionBeforeValidateHook, type CollectionBeforeChangeHook } from 'payload'

import { hasRole, isSuperAdmin } from '../access/roles'

/**
 * Valor EFETIVO de um campo num update parcial: se o PATCH menciona o campo
 * (mesmo com null), vale o que veio; senão vale o que está no banco.
 * NUNCA usar `data?.x ?? originalDoc?.x` em validação de invariante — um PATCH
 * {campo: null} passaria na validação e persistiria o null (bypass).
 */
export const efetivo = <T = unknown>(
  data: Record<string, unknown> | undefined,
  originalDoc: Record<string, unknown> | undefined,
  campo: string,
): T | undefined => {
  if (data && campo in data) return data[campo] as T
  return originalDoc?.[campo] as T | undefined
}

const vazio = (v: unknown): boolean => v === null || v === undefined

/** Convenção global do contrato: slug kebab-case em toda coleção de conteúdo. */
export const validaSlugKebab = (value: string | null | undefined): true | string =>
  !value || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) || 'slug deve ser kebab-case ([a-z0-9-], sem espaços/maiúsculas)'

/**
 * Unicidade composta (tenant, campo) — contrato colecoes.md: "slug unique POR tenant".
 * Primeira linha de defesa (erro 400 com `path` — o contrato pro agente); o índice
 * único composto `indexes` de cada coleção é o backstop contra corrida no banco.
 */
export const uniquePorTenant =
  (campo: string): CollectionBeforeValidateHook =>
  async ({ data, originalDoc, req, collection }) => {
    const valor = efetivo<string>(data, originalDoc, campo)
    const tenant = efetivo<string | number | { id?: string | number }>(data, originalDoc, 'tenant')
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

/**
 * PRD 01 RF3 — role `ingestao` só trabalha em DRAFT e nunca marca cupom como
 * publicado: nem _status published, nem estado da máquina em "publicado".
 */
export const draftOnlyIngestao: CollectionBeforeChangeHook = ({ data, req }) => {
  const user = req.user as { roles?: string[] } | null
  if (!user) return data
  const soIngestao =
    hasRole(user, 'ingestao') &&
    !isSuperAdmin(user) &&
    !hasRole(user, 'agente') &&
    !hasRole(user, 'editor')
  if (!soIngestao) return data
  if (data?._status === 'published') {
    throw new APIError('Papel "ingestao" só pode salvar rascunhos (draft). Publicação é de outro papel.', 403)
  }
  if (data?.estado === 'publicado' || data?.estado === 'indexavel') {
    throw new APIError(`Papel "ingestao" não pode definir estado "${data.estado}" — verificação/publicação é de outro papel.`, 403)
  }
  return data
}
