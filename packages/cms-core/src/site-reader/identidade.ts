import type { SanitizedConfig } from 'payload'
import { identidadeSiteReader } from './principal'

export const caminhoIdentidadeSiteReader = (config: SanitizedConfig): string =>
  `${config.routes.api.replace(/\/$/, '')}/editorial/identity-v1`

export function respostaSiteReader(status: number, body: unknown, headers?: HeadersInit): Response {
  const h = new Headers(headers)
  h.set('Cache-Control', 'private, no-store')
  h.set('Vary', 'Authorization')
  return Response.json(body, { status, headers: h })
}

export const erroSiteReader = (status: number): Response => respostaSiteReader(status,
  { errors: [{ message: status === 401 ? 'Não autenticado.' : status === 405 ? 'Método não permitido.' : status === 400 ? 'Parâmetros não permitidos.' : 'Acesso negado.' }] },
  status === 405 ? { Allow: 'GET' } : undefined)

export function temMethodOverride(headers: Headers): boolean {
  return headers.has('X-HTTP-Method-Override') || headers.has('X-Payload-HTTP-Method-Override')
}

export function respondeIdentidadeSiteReader(request: Pick<Request, 'method' | 'headers' | 'url'>, user: unknown): Response {
  if (request.method !== 'GET' || temMethodOverride(request.headers)) return erroSiteReader(405)
  if (!user) return erroSiteReader(401)
  const identidade = identidadeSiteReader(user)
  if (!identidade) return erroSiteReader(403)
  if (new URL(request.url).search) return erroSiteReader(400)
  return respostaSiteReader(200, identidade)
}
