import { executeAuthStrategies, getPayload, type SanitizedConfig } from 'payload'
import { caminhoIdentidadeSiteReader, erroSiteReader, respondeIdentidadeSiteReader, temMethodOverride } from './identidade'
import { temPapelSiteReader, usuarioUsersSemPapeisValidos, restringirPorPrincipalSiteReader } from './principal'

type ConfigReader = SanitizedConfig | Promise<SanitizedConfig>
type Superficie = 'rest' | 'graphql' | 'graphql-playground'
const ativo = (config: SanitizedConfig) => config.custom?.siteReader?.ativo === true

/** Cookie analítico não é credencial: não inicializar Payload/DB por causa dele. */
function temCredencial(headers: Headers, config: SanitizedConfig): boolean {
  if (headers.get('authorization')?.trim()) return true
  const nome = `${config.cookiePrefix ?? 'payload'}-token`
  // parseCookies nativo também faz trim no nome ANTES do '='; não basta startsWith.
  return (headers.get('cookie') ?? '').split(';').some(c => {
    const igual = c.indexOf('=')
    return igual >= 0 && c.slice(0, igual).trim() === nome && c.slice(igual + 1).length > 0
  })
}

async function autentica(config: SanitizedConfig, headers: Headers, isGraphQL: boolean) {
  const payload = await getPayload({ config })
  // Export público usado pelo próprio createPayloadRequest; não calcula permissões.
  return executeAuthStrategies({ payload, headers, canSetHeaders: false, isGraphQL })
}

async function destinoNextCompativel(args: unknown[]): Promise<boolean> {
  const contexto = args[0] as { params?: Promise<unknown> | unknown } | undefined
  if (!contexto || !('params' in contexto)) return true // Fetch puro não tem params.
  const params = await contexto.params as { slug?: unknown } | undefined
  return Array.isArray(params?.slug) && params.slug.length === 2 && params.slug[0] === 'editorial' && params.slug[1] === 'identity-v1'
}

export function protegerTransporteSiteReader<A extends unknown[]>({ config: configPromise, handler, superficie }: {
  config: ConfigReader
  handler: (request: Request, ...args: A) => Response | Promise<Response>
  superficie: Superficie
}): (request: Request, ...args: A) => Promise<Response> {
  return async (request, ...args) => {
    const config = await configPromise
    if (!ativo(config)) return handler(request, ...args)
    const identidade = superficie === 'rest' && new URL(request.url).pathname === caminhoIdentidadeSiteReader(config)
    if (identidade && (request.method !== 'GET' || temMethodOverride(request.headers))) return erroSiteReader(405)
    if (!temCredencial(request.headers, config)) return identidade ? erroSiteReader(401) : handler(request, ...args)
    const { user } = await autentica(config, request.headers, superficie === 'graphql')
    // Não delegar credencial inválida para uma segunda auth potencialmente divergente.
    if (!user) return erroSiteReader(401)
    if (usuarioUsersSemPapeisValidos(user)) return erroSiteReader(403)
    if (temPapelSiteReader(user)) {
      if (!identidade || !(await destinoNextCompativel(args))) return erroSiteReader(403)
      // Identidade é DTO direto: uma autenticação, não chama o handler de novo.
      return respondeIdentidadeSiteReader(request, user)
    }
    return identidade ? erroSiteReader(403) : handler(request, ...args)
  }
}

/** Antes de RootLayout e handleServerFunctions; o consumidor escolhe notFound/erro. */
export async function leitorNoPreflightSiteReader({ config: configPromise, headers }: {
  config: ConfigReader; headers: Headers
}): Promise<boolean> {
  const config = await configPromise
  if (!ativo(config) || !temCredencial(headers, config)) return false
  const { user } = await autentica(config, headers, false)
  return !user || restringirPorPrincipalSiteReader(user)
}
