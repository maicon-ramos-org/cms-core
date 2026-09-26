type Registro = Record<string, unknown>
const registro = (valor: unknown): Registro | undefined =>
  valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? valor as Registro : undefined

/** Presença restritiva, mesmo se um registro inválido misturar privilégios. */
export function temPapelSiteReader(user: unknown): boolean {
  const roles = registro(user)?.roles
  return roles === 'site-reader' || (Array.isArray(roles) && roles.includes('site-reader'))
}

/** A ausência do discriminador não prova que seja um usuário não-reader. */
export function usuarioUsersSemPapeisValidos(user: unknown): boolean {
  const u = registro(user)
  return u?.collection === 'users' && (!Array.isArray(u.roles) || u.roles.length === 0 ||
    u.roles.some(role => typeof role !== 'string' || role.length === 0 || role.trim() !== role))
}

export const restringirPorPrincipalSiteReader = (user: unknown): boolean =>
  temPapelSiteReader(user) || usuarioUsersSemPapeisValidos(user)

export interface IdentidadeSiteReader { versao: 1; papel: 'site-reader'; tenantId: string }

export function tenantUnicoSiteReader(tenants: unknown): string | null {
  if (!Array.isArray(tenants) || tenants.length !== 1) return null
  const tenant = registro(tenants[0])?.tenant
  const id = registro(tenant)?.id ?? tenant
  return ((typeof id === 'number' && Number.isSafeInteger(id) && id > 0) || (typeof id === 'string' && id.trim() === id && id.length > 0)) ? String(id) : null
}

/** Não retorna o usuário/tenant populado nem qualquer campo da credencial. */
export function identidadeSiteReader(user: unknown): IdentidadeSiteReader | null {
  const u = registro(user)
  if (!u || u.collection !== 'users' || u._strategy !== 'api-key' || u.enableAPIKey !== true ||
    !Array.isArray(u.roles) || u.roles.length !== 1 || u.roles[0] !== 'site-reader') return null
  const tenantId = tenantUnicoSiteReader(u.tenants)
  return tenantId === null ? null : { versao: 1, papel: 'site-reader', tenantId }
}
