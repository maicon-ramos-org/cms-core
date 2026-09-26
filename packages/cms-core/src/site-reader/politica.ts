import type { Access, Endpoint, SanitizedConfig } from 'payload'
import { erroSiteReader, respondeIdentidadeSiteReader } from './identidade'
import { restringirPorPrincipalSiteReader } from './principal'

const restringe = (original?: Access): Access => args =>
  restringirPorPrincipalSiteReader(args.req.user) ? false : original ? original(args) : Boolean(args.req.user)

function endpointsRestritos<T extends Endpoint[] | false>(endpoints: T): T {
  if (endpoints === false) return endpoints
  return endpoints.map(endpoint => ({
    ...endpoint,
    handler: ((req) => restringirPorPrincipalSiteReader(req.user) ? erroSiteReader(403) : endpoint.handler(req)) satisfies Endpoint['handler'],
  })) as T
}

/**
 * Recebe SOMENTE a config já sanitizada: internos do Payload e plugins já existem.
 * Não envolve find/afterRead, usados pela própria autenticação com overrideAccess.
 */
export function aplicaPoliticaSiteReader(config: SanitizedConfig): SanitizedConfig {
  if (config.collections.some(c => c.auth && c.auth.strategies.length > 0)) {
    throw new Error('siteReader não admite auth strategies custom: o transporte exige credenciais nativas conhecidas.')
  }
  if (config.admin.autoLogin && !config.admin.autoLogin.prefillOnly) {
    throw new Error('siteReader não admite autoLogin: requisição sem credencial deve permanecer anônima.')
  }
  if (config.endpoints.some(e => e.path === '/editorial/identity-v1')) throw new Error('siteReader: endpoint de identidade já ocupado.')
  config.custom = { ...config.custom, siteReader: { ativo: true } }
  for (const collection of config.collections) {
    for (const op of ['admin', 'create', 'read', 'readVersions', 'update', 'delete', 'unlock'] as const) {
      // admin/unlock aceitam subconjuntos dos argumentos de Access; repasse sem alteração.
      collection.access[op] = restringe(collection.access[op] as Access | undefined) as never
    }
    collection.endpoints = endpointsRestritos(collection.endpoints)
  }
  for (const global of config.globals) {
    for (const op of ['read', 'readVersions', 'update'] as const) global.access[op] = restringe(global.access[op])
    global.endpoints = endpointsRestritos(global.endpoints)
  }
  config.endpoints = endpointsRestritos(config.endpoints)
  config.endpoints.push({ path: '/editorial/identity-v1', method: 'get', custom: {},
    handler: req => respondeIdentidadeSiteReader({ method: req.method ?? '', headers: req.headers, url: req.url ?? 'http://invalid.invalid' }, req.user),
  } as SanitizedConfig['endpoints'][number])
  const jobs = config.jobs.access ?? {}
  config.jobs.access = { ...jobs }
  for (const op of ['run', 'queue', 'cancel'] as const) config.jobs.access[op] = restringe(jobs[op] as Access | undefined) as never
  return config
}
