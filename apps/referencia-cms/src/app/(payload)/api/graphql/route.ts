/* Integração mantida pela aplicação: GraphQL tem transporte próprio e exige guard.
 * A regeneração destas rotas deve passar por tests/site-reader-next.spec.ts. */
import config from '@payload-config'
import { protegerTransporteSiteReader } from '@maicon-ramos-org/cms-core/site-reader'
import { GRAPHQL_POST, REST_OPTIONS } from '@payloadcms/next/routes'

export const POST = protegerTransporteSiteReader({ config, superficie: 'graphql', handler: GRAPHQL_POST(config) })

export const OPTIONS = protegerTransporteSiteReader({ config, superficie: 'graphql', handler: REST_OPTIONS(config) })
