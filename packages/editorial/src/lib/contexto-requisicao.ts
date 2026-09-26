import { AsyncLocalStorage } from 'node:async_hooks'

interface Leitura<T> { valor: T; headers: Headers }
interface Entrada { promessa: Promise<Leitura<unknown>>; reutilizavel: boolean }
interface Contexto { ativo: boolean; entradas: Map<string, Entrada>; bytes: number }
const contexto = new AsyncLocalStorage<Contexto | undefined>()
const MAX_ENTRADAS = 64
const MAX_RESULTADO = 256 * 1024
const MAX_TOTAL = 1024 * 1024

const privado = (headers: Headers) => /(?:^|,)\s*(?:no-store|private|no-cache)(?:\s|,|=|$)/i.test(headers.get('cache-control') ?? '')
const preview = (url: URL) => url.searchParams.has('draft') || url.searchParams.has('preview')

/** Rewrites não podem carregar o memo de uma rota pública para uma rota excluída. */
export const semContextoLeituraCms = <T>(operacao: () => T): T =>
  contexto.getStore() ? contexto.run(undefined, operacao) : operacao()

/** Somente rotas declaradas pelo site. Não usa cookie/autenticação de um visitante. */
export function permiteMemoLeituras(request: Request, caminhos?: readonly string[]): boolean {
  if (!caminhos?.length || request.method !== 'GET' || request.headers.has('cookie') ||
    request.headers.has('authorization') || privado(request.headers)) return false
  const url = new URL(request.url)
  if (preview(url) || /^\/(?:r|api|admin|login|logout|preview)(?:\/|$)/i.test(url.pathname)) return false
  return caminhos.some(caminho => caminho.startsWith('/') && caminho !== '/*' &&
    (caminho.endsWith('/*') ? url.pathname.startsWith(caminho.slice(0, -1)) : url.pathname === caminho))
}

/**
 * O contexto continua vivo durante o corpo streamed, não só até `next()` retornar.
 * EOF/cancelamento/erro/abort desativam também tarefas assíncronas tardias.
 */
export async function comContextoLeituraCms(proxima: () => Promise<Response>, sinal?: AbortSignal): Promise<Response> {
  const estado: Contexto = { ativo: true, entradas: new Map(), bytes: 0 }
  const fecha = () => {
    estado.ativo = false
    estado.entradas.clear()
    estado.bytes = 0
    sinal?.removeEventListener('abort', fecha)
  }
  sinal?.addEventListener('abort', fecha, { once: true })
  if (sinal?.aborted) fecha()
  try {
    const resposta = await contexto.run(estado, proxima)
    if (!resposta.body || privado(resposta.headers) || resposta.headers.has('set-cookie')) {
      fecha()
      return resposta
    }
    const leitor = resposta.body.getReader()
    const corpo = new ReadableStream<Uint8Array>({
      pull: controller => contexto.run(estado, async () => {
        try {
          const parte = await leitor.read()
          if (parte.done) { fecha(); controller.close() }
          else controller.enqueue(parte.value)
        } catch (erro) { fecha(); controller.error(erro) }
      }),
      cancel: motivo => {
        fecha()
        return leitor.cancel(motivo)
      },
    }, { highWaterMark: 0 })
    return new Response(corpo, { status: resposta.status, statusText: resposta.statusText, headers: resposta.headers })
  } catch (erro) { fecha(); throw erro }
}

/**
 * GET idêntico na mesma requisição. Não é HTTP/route cache: nenhum resultado
 * sobrevive ao request e não existe TTL/invalidação nova. Sem contexto é passthrough.
 */
export async function leituraCmsNaRequisicao<T>(url: string, init: RequestInit, ler: () => Promise<Leitura<T>>): Promise<T> {
  const estado = contexto.getStore()
  const direto = async () => (await ler()).valor
  if (!estado?.ativo || (init.method !== undefined && init.method !== 'GET') ||
    Object.keys(init).some(k => k !== 'method' && k !== 'headers')) return direto()
  const headers = new Headers(init.headers)
  if (privado(headers) || headers.has('cookie') || preview(new URL(url))) return direto()
  // Origem, query e identidade efetiva ficam apenas na memória do request; nunca logar.
  const chave = JSON.stringify([url, [...headers.entries()].sort(([a], [b]) => a.localeCompare(b))])
  if (chave.length > 8192) return direto()
  const existente = estado.entradas.get(chave)
  if (existente) {
    const resultado = await existente.promessa
    return existente.reutilizavel && estado.ativo ? structuredClone(resultado.valor) as T : direto()
  }
  if (estado.entradas.size >= MAX_ENTRADAS) return direto()
  const entrada: Entrada = { reutilizavel: false, promessa: Promise.resolve().then(ler) }
  estado.entradas.set(chave, entrada)
  entrada.promessa = entrada.promessa.then(resultado => {
    if (estado.ativo && !privado(resultado.headers) && !resultado.headers.has('set-cookie')) {
      const bytes = new TextEncoder().encode(JSON.stringify(resultado.valor)).byteLength
      if (bytes <= MAX_RESULTADO && estado.bytes + bytes <= MAX_TOTAL) {
        estado.bytes += bytes
        entrada.reutilizavel = true
      }
    }
    if (!entrada.reutilizavel) estado.entradas.delete(chave)
    return resultado
  }, erro => { estado.entradas.delete(chave); throw erro })
  const resultado = await entrada.promessa
  return entrada.reutilizavel ? structuredClone(resultado.valor) as T : resultado.valor as T
}
