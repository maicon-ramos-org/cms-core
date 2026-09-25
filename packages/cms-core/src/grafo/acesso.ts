import { APIError, type PayloadRequest } from 'payload'
import { isSuperAdmin } from '../access/roles'

export function idGrafo(valor: unknown): string | number | undefined {
  if (typeof valor === 'number' || (typeof valor === 'string' && valor.length > 0)) return valor
  if (valor && typeof valor === 'object' && 'id' in valor) return idGrafo(valor.id)
  return undefined
}

export function tenantsDaCredencial(user: unknown): Array<string | number> {
  const tenants = (user as { tenants?: Array<{ tenant?: unknown }> } | null)?.tenants ?? []
  return tenants.flatMap(t => { const id = idGrafo(t.tenant); return id === undefined ? [] : [id] })
}

export function exigeTenantAutorizado(req: PayloadRequest, tenant: string | number): void {
  if (!req.user || isSuperAdmin(req.user)) return // Local API interna/bootstrap; REST exige access autenticado.
  if (!tenantsDaCredencial(req.user).some(t => String(t) === String(tenant))) throw new APIError('Tenant fora da credencial.', 403)
}

export function tenantDaConsulta(req: PayloadRequest): string | number {
  if (!req.user) throw new APIError('Autenticação obrigatória.', 401)
  const escolhido = new URL(req.url ?? 'http://localhost').searchParams.get('tenant')
  const tenants = tenantsDaCredencial(req.user)
  const tenant = escolhido ?? (!isSuperAdmin(req.user) && tenants.length === 1 ? tenants[0] : undefined)
  if (tenant === undefined || tenant === null || tenant === '') throw new APIError('Escolha explicitamente o tenant da consulta.', 400)
  exigeTenantAutorizado(req, tenant)
  return tenant
}
