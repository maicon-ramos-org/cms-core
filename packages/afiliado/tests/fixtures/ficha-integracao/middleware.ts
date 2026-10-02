import type { MiddlewareHandler } from 'astro'
import type { TenantDTO } from '../../../src/web/lib/cms'

/** Apenas seleção de tenant da fixture; todos os readers continuam usando a REST real. */
export const onRequest: MiddlewareHandler = async ({ locals, request }, next) => {
  const tenants = JSON.parse(process.env.FICHA_TEST_TENANTS!) as TenantDTO[]
  const tenant = tenants.find(t => t.slug === (request.headers.get('x-tenant-fixture') ?? 'a'))
  if (!tenant) return new Response('Tenant não encontrado.', { status: 404 })
  Object.assign(locals, { tenant })
  return next()
}
