import { APIError, ValidationError, type CollectionBeforeValidateHook, type PayloadRequest, type Where } from 'payload'
import { hasRole, isSuperAdmin } from '../access/roles'
import { efetivo } from '../hooks/validations'
import { exigeTenantAutorizado, idGrafo } from './acesso'

export const invalidoGrafo = (path: string, message: string): never => {
  throw new ValidationError({ errors: [{ path, message }] })
}

export async function encontraNoTenant(req: PayloadRequest, collection: string, id: unknown, tenant: string | number) {
  const resposta = await req.payload.find({ collection: collection as never, req, depth: 0, limit: 1,
    overrideAccess: true, where: { and: [{ id: { equals: idGrafo(id) } }, { tenant: { equals: tenant } }] } })
  return resposta.docs[0] as Record<string, any> | undefined
}

export const validaGrafo = (refs: Record<string, string> = {}, obrigatorias: string[] = []): CollectionBeforeValidateHook =>
  async ({ data, originalDoc, req, collection }) => {
    const tenant = idGrafo(efetivo(data, originalDoc, 'tenant'))
    if (tenant === undefined) invalidoGrafo('tenant', 'Tenant obrigatório.')
    if (originalDoc?.id && String(idGrafo(originalDoc.tenant)) !== String(tenant)) invalidoGrafo('tenant', 'Tenant é imutável.')
    exigeTenantAutorizado(req, tenant!)
    if (originalDoc?.origem && efetivo(data, originalDoc, 'origem') !== originalDoc.origem) invalidoGrafo('origem', 'Chave de origem é imutável.')
    for (const campo of obrigatorias) if (efetivo(data, originalDoc, campo) == null) invalidoGrafo(campo, 'Campo obrigatório.')
    for (const [campo, col] of Object.entries(refs)) {
      const valor = efetivo(data, originalDoc, campo)
      const lista = Array.isArray(valor) ? valor : valor == null ? [] : [valor]
      if (lista.length > 100) invalidoGrafo(campo, 'Máximo de 100 vínculos por campo nesta entrega.')
      for (const rel of lista) {
        if (idGrafo(rel) === undefined || !await encontraNoTenant(req, col, rel, tenant!)) invalidoGrafo(campo, 'Referência deve existir no mesmo tenant.')
      }
    }
    if (collection.slug === 'relacoes' && String(idGrafo(efetivo(data, originalDoc, 'de'))) === String(idGrafo(efetivo(data, originalDoc, 'para')))) {
      invalidoGrafo('para', 'Uma entidade não pode se relacionar consigo mesma.')
    }
    if (collection.slug === 'entidades' || collection.slug === 'relacoes') {
      const config = await req.payload.findByID({ collection: 'tenants', id: tenant!, req, depth: 0, overrideAccess: true })
      const vocab = config.grafo?.[collection.slug === 'entidades' ? 'tipos_de_entidade' : 'tipos_de_relacao'] as string[] | undefined
      const tipo = efetivo<string>(data, originalDoc, 'tipo')
      if (vocab?.length && !vocab.includes(tipo ?? '')) invalidoGrafo('tipo', 'Tipo fora do vocabulário do tenant.')
    }
    return data
  }

export const unicoGrafo = (campos: string[]): CollectionBeforeValidateHook => async ({ data, originalDoc, collection, req }) => {
  const valores = campos.map(c => efetivo(data, originalDoc, c))
  if (valores.some(v => v == null || v === '')) return data
  const tenant = idGrafo(efetivo(data, originalDoc, 'tenant'))
  const condicoes: Where[] = [{ tenant: { equals: tenant } },
    ...campos.map((c, i) => ({ [c]: { equals: idGrafo(valores[i]) ?? valores[i] } }))]
  if (originalDoc?.id) condicoes.push({ id: { not_equals: originalDoc.id } })
  const existentes = await req.payload.find({ collection: collection.slug as never, req, depth: 0, limit: 1,
    overrideAccess: true, where: { and: condicoes } })
  if (existentes.totalDocs) invalidoGrafo(campos[campos.length - 1]!, 'Já existe um registro com esta identidade no tenant.')
  return data
}

export const draftPrimeiro: CollectionBeforeValidateHook = ({ data, operation, req }) => {
  if (operation === 'create' && (hasRole(req.user, 'agente') || hasRole(req.user, 'ingestao')) && !isSuperAdmin(req.user)) {
    if (data?._status === 'published') throw new APIError('Conteúdo novo de agente entra em draft. Publicação exige atualização explícita posterior.', 403)
    if (data) data._status = 'draft'
  }
  return data
}

export const urlFonte = (valor: string | null | undefined): true | string => {
  if (!valor) return true
  try { const u = new URL(valor); if (['http:', 'https:'].includes(u.protocol) && !u.username && !u.password) return true } catch { /* erro de campo abaixo */ }
  return 'URL deve ser HTTP(S), sem credenciais.'
}

/** Uploads e links internos dentro do Lexical também atravessam a fronteira de tenant. */
export const validaCorpoGrafo: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  const tenant = idGrafo(efetivo(data, originalDoc, 'tenant'))
  const corpo = efetivo<{ root?: unknown }>(data, originalDoc, 'corpo')
  if (tenant === undefined || !corpo?.root) return data
  const visitar = async (node: any): Promise<void> => {
    if (!node || typeof node !== 'object') return
    const vinculo = node.type === 'upload' || node.type === 'relationship' ? node
      : node.type === 'link' && node.fields?.linkType === 'internal' ? node.fields.doc : undefined
    if (vinculo) {
      const col = vinculo.relationTo
      if (typeof col !== 'string' || ['tenants', 'users', 'eventos'].includes(col) || !req.payload.collections[col]
        || idGrafo(vinculo.value) === undefined || !await encontraNoTenant(req, col, vinculo.value, tenant)) {
        invalidoGrafo('corpo', 'Referência do corpo deve existir em coleção de conteúdo do mesmo tenant.')
      }
    }
    if (Array.isArray(node.children)) for (const child of node.children) await visitar(child)
  }
  await visitar(corpo.root)
  return data
}
