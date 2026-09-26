/* Integração mantida pela aplicação: preservar o guard antes dos handlers Payload.
 * A regeneração destas rotas deve passar por tests/site-reader-next.spec.ts. */
import config from '@payload-config'
import { protegerTransporteSiteReader } from '@maicon-ramos-org/cms-core/site-reader'
import '@payloadcms/next/css'
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@payloadcms/next/routes'

export const GET = protegerTransporteSiteReader({ config, superficie: 'rest', handler: REST_GET(config) })
export const POST = protegerTransporteSiteReader({ config, superficie: 'rest', handler: REST_POST(config) })
export const DELETE = protegerTransporteSiteReader({ config, superficie: 'rest', handler: REST_DELETE(config) })
export const PATCH = protegerTransporteSiteReader({ config, superficie: 'rest', handler: REST_PATCH(config) })
export const PUT = protegerTransporteSiteReader({ config, superficie: 'rest', handler: REST_PUT(config) })
export const OPTIONS = protegerTransporteSiteReader({ config, superficie: 'rest', handler: REST_OPTIONS(config) })
