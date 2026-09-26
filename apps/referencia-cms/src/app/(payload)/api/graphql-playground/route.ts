/* Integração mantida pela aplicação: o playground também passa pelo guard.
 * A regeneração destas rotas deve passar por tests/site-reader-next.spec.ts. */
import config from '@payload-config'
import { protegerTransporteSiteReader } from '@maicon-ramos-org/cms-core/site-reader'
import '@payloadcms/next/css'
import { GRAPHQL_PLAYGROUND_GET } from '@payloadcms/next/routes'

export const GET = protegerTransporteSiteReader({ config, superficie: 'graphql-playground', handler: GRAPHQL_PLAYGROUND_GET(config) })
