import { authenticated } from '@maicon-ramos-org/cms-core'
import type { Endpoint } from 'payload'
import { descritorCapacidades } from '../../conteudo/capacidades'
import type { RegistroCategorias } from './categorias'

/**
 * `GET /api/afiliado/capabilities`: o que esta instância oferece, para o consumidor falhar
 * fechado antes de escrever. Só descreve a instância (categorias, limites, versões), nunca
 * dado de tenant; exige usuário autenticado (a identidade pública `site-reader` não passa).
 */
export const endpointCapacidades = (registro: RegistroCategorias): Endpoint => ({
  path: '/afiliado/capabilities',
  method: 'get',
  handler: (req) => {
    if (!req.user || !(authenticated as (args: { req: typeof req }) => unknown)({ req })) {
      return Response.json({ error: 'Não autenticado.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
    }
    return Response.json(descritorCapacidades(registro), { headers: { 'Cache-Control': 'no-store' } })
  },
})
