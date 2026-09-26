import { idOferta, projetarOfertaEditorial, urlPermitida, type IdOferta, type OfertaEditorial, type RegistroProgramasOferta } from '../../ofertas-editoriais/contratos'
export { decimalExato, registrarProgramasOferta, projetarOfertaEditorial, resolverEscolhasEditoriais, urlPermitida } from '../../ofertas-editoriais/contratos'
export type { EscolhaEditorial, EvidenciaComercial, OfertaEditorial, OfertaEditorialPublica, ProgramaOferta, RegistroProgramasOferta } from '../../ofertas-editoriais/contratos'

export interface SinalCliqueOfertaEditorial {
  tenant: IdOferta
  oferta: IdOferta
  canonica: IdOferta
  programa: string
  from: string
  src: string
  classificacao: 'humano'
}
export interface OpcoesRedirectOferta {
  request: Request
  tenant: IdOferta
  slug: string
  programas: RegistroProgramasOferta
  carregar: (tenant: IdOferta, slug: string) => Promise<OfertaEditorial | null>
  carregarPorID: (tenant: IdOferta, id: string) => Promise<OfertaEditorial | null>
  resolvedores: Record<string, (entrada: { oferta: OfertaEditorial; src: string; from: string }) => string | null>
  ehHumano?: (request: Request, atribuicao: { src: string; from: string }) => boolean
  registrarClique?: (sinal: SinalCliqueOfertaEditorial, opcoes: { signal: AbortSignal }) => Promise<void>
  emSegundoPlano?: (tarefa: Promise<void>) => void
}
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
const fallback = () => new Response(null, { status: 302, headers: { ...headers, Location: '/' } })
const limpa = (value: string) => value.replace(/[^a-z0-9/_-]/gi, '').slice(0, 80)

export function atribuicaoOfertaEditorial(request: Request): { src: string; from: string } {
  const url = new URL(request.url)
  const from = limpa(url.searchParams.get('from') ?? '')
  if (url.searchParams.get('from')) return { from, src: from || 'direct' }
  const referer = request.headers.get('referer')
  if (referer) try {
    const origem = new URL(referer)
    if (origem.origin === url.origin) return { from, src: limpa(origem.pathname.replace(/^\/+|\/+$/g, '')) || 'home' }
  } catch { /* Referer inválido não é identidade. */ }
  return { from, src: 'direct' }
}

async function registraComLimite(opcoes: OpcoesRedirectOferta, sinal: SinalCliqueOfertaEditorial, limite: number) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const prazo = new Promise<void>(resolve => { timer = setTimeout(() => { controller.abort(); resolve() }, limite) })
  try {
    // Inicia antes do 302; erro síncrono/assíncrono de tracking não muda o redirect.
    await Promise.race([opcoes.registrarClique!(sinal, { signal: controller.signal }), prazo])
  } catch { /* O consumidor registra erro sanitizado no recorder, nunca URL/token aqui. */ }
  finally { if (timer) clearTimeout(timer) }
}

/** Helper explícito: NÃO injeta rota e nunca consulta loja/segue redirect. */
export async function redirecionarOfertaEditorial(opcoes: OpcoesRedirectOferta): Promise<Response> {
  const { request, tenant, slug } = opcoes
  if (['purpose', 'sec-purpose', 'x-moz'].some(h => /prefetch|prerender/i.test(request.headers.get(h) ?? ''))) {
    return new Response(null, { status: 204, headers })
  }
  const oferta = await opcoes.carregar(tenant, slug)
  if (!oferta || oferta.slug !== slug || idOferta(oferta.tenant) !== idOferta(tenant) || oferta._status !== 'published' || oferta.estado !== 'ativa') return fallback()
  const canonica = oferta.espelho_de ? await opcoes.carregarPorID(tenant, idOferta(oferta.espelho_de)) : undefined
  const dto = projetarOfertaEditorial(oferta, tenant, opcoes.programas, canonica ?? undefined)
  if (!dto?.elegivel) return fallback()
  const atribuicao = atribuicaoOfertaEditorial(request)
  let location: string | null
  try {
    const resultado = opcoes.resolvedores[oferta.programa]?.({ oferta: structuredClone(oferta), ...atribuicao })
    location = urlPermitida(resultado, oferta.programa, opcoes.programas)
  } catch { return fallback() }
  if (!location) return fallback()
  let humano = false
  try { humano = opcoes.ehHumano?.(request, atribuicao) === true } catch { /* falha de higiene não fabrica sinal */ }
  if (humano && opcoes.registrarClique) {
    const tarefa = registraComLimite(opcoes, { tenant, oferta: oferta.id, canonica: dto.canonicalId,
      programa: oferta.programa, ...atribuicao, classificacao: 'humano' }, opcoes.emSegundoPlano ? 10_000 : 1500)
    if (opcoes.emSegundoPlano) { try { opcoes.emSegundoPlano(tarefa) } catch { /* contexto Worker pode já ter encerrado */ } }
    else await tarefa
  }
  return new Response(null, { status: 302, headers: { ...headers, Location: location } })
}
