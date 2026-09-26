import type { Payload, SanitizedConfig } from 'payload'
import { erroSiteReader, temMethodOverride } from './identidade'
import type { IdentidadeSiteReader } from './principal'

/** O projetor é código confiável da instância; recebe apenas o tenant autenticado. */
export interface ContextoRenderSiteReaderV1 {
  payload: Payload
  tenantId: string
  slug: string
}

export interface PaginaRenderSiteReaderV1 {
  /** Revisão estável do conjunto editorial, para o consumidor detectar mudanças. */
  revisao: string
  /** Projeção privada e fechada pela instância; nunca repassar documentos Payload inteiros. */
  dados: Record<string, unknown>
}

export type ProjetorRenderSiteReaderV1 = (contexto: ContextoRenderSiteReaderV1) => Promise<PaginaRenderSiteReaderV1 | null>

export const caminhoRenderSiteReaderV1 = (config: SanitizedConfig): string =>
  `${config.routes.api.replace(/\/$/, '')}/editorial/render-v1`

const LIMITE_BYTES = 2_000_000
const slugValido = (slug: string): boolean => slug.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
const revisaoValida = (revisao: unknown): revisao is string =>
  typeof revisao === 'string' && revisao.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(revisao)

type ValorJson = null | string | boolean | number | ValorJson[] | { [chave: string]: ValorJson }

/** Materializa uma cópia JSON sem executar getters/toJSON nem serializar campos ocultos. */
function materializaJson(valor: unknown, vistos = new WeakSet<object>(), profundidade = 0): ValorJson {
  if (profundidade > 32) throw new Error('render-v1 profundo demais')
  if (valor === null || typeof valor === 'string' || typeof valor === 'boolean') return valor
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor !== 'object' || vistos.has(valor)) throw new Error('render-v1 não JSON')
  const proto = Object.getPrototypeOf(valor)
  if (Array.isArray(valor) ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) {
    throw new Error('render-v1 não JSON')
  }
  vistos.add(valor)
  const descritores = Object.getOwnPropertyDescriptors(valor)
  const chaves = Reflect.ownKeys(valor)
  if (Array.isArray(valor)) {
    if (chaves.length !== valor.length + 1 || chaves.some(chave => typeof chave !== 'string')) throw new Error('render-v1 array inválido')
    const copia: ValorJson[] = []
    for (let i = 0; i < valor.length; i++) {
      const descritor = descritores[String(i)]
      if (!descritor?.enumerable || !('value' in descritor)) throw new Error('render-v1 array inválido')
      copia.push(materializaJson(descritor.value, vistos, profundidade + 1))
    }
    vistos.delete(valor)
    return copia
  }
  const copia: { [chave: string]: ValorJson } = Object.create(null)
  for (const chave of chaves) {
    if (typeof chave !== 'string') throw new Error('render-v1 chave inválida')
    const descritor = descritores[chave]
    if (!descritor?.enumerable || !('value' in descritor)) throw new Error('render-v1 propriedade inválida')
    copia[chave] = materializaJson(descritor.value, vistos, profundidade + 1)
  }
  vistos.delete(valor)
  return copia
}

const respostaPrivada = (status: number, body: string): Response => new Response(body, { status, headers: {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
  Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff',
} })

/** Já autenticado no Request original: não delega ao handler Payload nem autentica de novo. */
export async function respondeRenderSiteReaderV1(
  request: Pick<Request, 'method' | 'headers' | 'url'>,
  identidade: IdentidadeSiteReader,
  payload: Payload,
  projetor: ProjetorRenderSiteReaderV1,
): Promise<Response> {
  if (request.method !== 'GET' || temMethodOverride(request.headers)) return erroSiteReader(405)
  const params = new URL(request.url).searchParams
  if (params.size !== 1 || params.getAll('slug').length !== 1) return erroSiteReader(400)
  const slug = params.get('slug')!
  if (!slugValido(slug)) return erroSiteReader(400)
  try {
    const pagina = await projetor({ payload, tenantId: identidade.tenantId, slug })
    if (pagina === null) return respostaPrivada(404, '{"errors":[{"message":"Página não encontrada."}]}')
    if (!pagina || !revisaoValida(pagina.revisao) || !pagina.dados || Array.isArray(pagina.dados)) {
      throw new Error('render-v1 inválido')
    }
    const dados = materializaJson(pagina.dados)
    const body = JSON.stringify({ versao: 1, tenantId: identidade.tenantId, slug, revisao: pagina.revisao, dados })
    if (new TextEncoder().encode(body).byteLength > LIMITE_BYTES) throw new Error('render-v1 grande demais')
    return respostaPrivada(200, body)
  } catch {
    // Nunca emitir a exceção/SQL/documento do projetor na resposta ou em logs.
    return respostaPrivada(503, '{"errors":[{"message":"Leitura temporariamente indisponível."}]}')
  }
}
