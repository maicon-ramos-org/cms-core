import { afterEach, describe, expect, it, vi } from 'vitest'
import { redirecionarOfertaEditorial, type OpcoesRedirectOferta } from '../src/web/lib/ofertas-editoriais'
import { registrarProgramasOferta, type OfertaEditorial } from '../src/ofertas-editoriais/contratos'

const oferta: OfertaEditorial = { id: 2, tenant: 10, slug: 'espelho', nome: 'Busca documentada', programa: 'loja',
  estado: 'ativa', _status: 'published', url_afiliado: 'https://loja.example/link-curto', espelho_de: 1, correspondencia: 'busca' }
const canonica: OfertaEditorial = { ...oferta, id: 1, slug: 'canonica', programa: 'origem', espelho_de: null, correspondencia: null }
const programas = registrarProgramasOferta([{ slug: 'loja', rotulo: 'Loja', hostsPermitidos: ['loja.example'] }])
const monta = (url = 'https://site.example/ofertas/espelho/', headers: HeadersInit = {}) => {
  const carregar = vi.fn(async () => oferta), carregarPorID = vi.fn(async () => canonica), registrarClique = vi.fn(async () => undefined)
  const opcoes: OpcoesRedirectOferta = { tenant: 10, slug: 'espelho', request: new Request(url, { headers }), programas,
    carregar, carregarPorID, resolvedores: { loja: ({ oferta }) => oferta.url_afiliado ?? null }, registrarClique, ehHumano: () => true }
  return { opcoes, carregar, carregarPorID, registrarClique }
}
afterEach(() => vi.useRealTimers())

describe('redirect comercial explícito, seguro e sem prefetch', () => {
  it('mantém 302/no-store/noindex e sinal usa canônica + programa realmente clicado', async () => {
    const f = monta('https://site.example/ofertas/espelho/?from=pagina-teste')
    const r = await redirecionarOfertaEditorial(f.opcoes)
    expect(r.status).toBe(302)
    expect(r.headers.get('Location')).toBe('https://loja.example/link-curto')
    expect(r.headers.get('Cache-Control')).toBe('no-store')
    expect(r.headers.get('X-Robots-Tag')).toBe('noindex')
    expect(f.carregar).toHaveBeenCalledWith(10, 'espelho')
    expect(f.carregarPorID).toHaveBeenCalledWith(10, '1')
    expect(f.registrarClique).toHaveBeenCalledWith(expect.objectContaining({ tenant: 10, oferta: 2, canonica: 1, programa: 'loja', from: 'pagina-teste', src: 'pagina-teste' }), expect.anything())
  })
  it('lookup e alias preservam caixa do slug legado, sem casar variante normalizada', async () => {
    const f = monta()
    f.opcoes.slug = 'Oferta-ABC123'
    f.opcoes.carregar = vi.fn(async () => ({ ...oferta, slug: 'Oferta-ABC123' }))
    expect((await redirecionarOfertaEditorial(f.opcoes)).headers.get('Location')).toBe('https://loja.example/link-curto')
    expect(f.opcoes.carregar).toHaveBeenCalledWith(10, 'Oferta-ABC123')
    f.opcoes.slug = 'oferta-abc123'
    expect((await redirecionarOfertaEditorial(f.opcoes)).headers.get('Location')).toBe('/')
  })
  it.each(['Purpose', 'Sec-Purpose', 'X-Moz'])('prefetch %s retorna 204 antes de qualquer lookup/sinal', async header => {
    const f = monta(undefined, { [header]: 'prefetch' })
    expect((await redirecionarOfertaEditorial(f.opcoes)).status).toBe(204)
    expect(f.carregar).not.toHaveBeenCalled()
    expect(f.carregarPorID).not.toHaveBeenCalled()
    expect(f.registrarClique).not.toHaveBeenCalled()
  })
  it.each(['quebrada', 'pausada', 'encerrada', 'draft', 'ausente', 'outro-tenant', 'canonica-draft'])('estado %s cai em / sem sinal', async estado => {
    const f = monta()
    if (estado === 'ausente') f.opcoes.carregar = async () => null
    else if (estado === 'draft') f.opcoes.carregar = async () => ({ ...oferta, _status: 'draft' })
    else if (estado === 'outro-tenant') f.opcoes.carregar = async () => ({ ...oferta, tenant: 20 })
    else if (estado === 'canonica-draft') f.opcoes.carregarPorID = async () => ({ ...canonica, _status: 'draft' })
    else f.opcoes.carregar = async () => ({ ...oferta, estado: estado as 'quebrada' })
    const r = await redirecionarOfertaEditorial(f.opcoes)
    expect(r.status).toBe(302)
    expect(r.headers.get('Location')).toBe('/')
    expect(f.registrarClique).not.toHaveBeenCalled()
  })
  it('from vence Referer; src de query não controla o destino nem atribuição', async () => {
    const f = monta('https://site.example/ofertas/espelho/?src=https://evil.example&location=https://evil.example', { Referer: 'https://site.example/guia/' })
    const resolver = vi.fn(({ src }: { src: string }) => `https://loja.example/link?src=${src}`)
    f.opcoes.resolvedores.loja = resolver
    expect((await redirecionarOfertaEditorial(f.opcoes)).headers.get('Location')).toBe('https://loja.example/link?src=guia')
    expect(f.registrarClique).toHaveBeenCalledWith(expect.objectContaining({ src: 'guia', from: '' }), expect.anything())
    const externo = monta(undefined, { Referer: 'https://outra.example/pagina' })
    await redirecionarOfertaEditorial(externo.opcoes)
    expect(externo.registrarClique).toHaveBeenCalledWith(expect.objectContaining({ src: 'direct' }), expect.anything())
  })
  it.each(['https://loja.example.evil.test/p', 'https://user:pass@loja.example/p', 'javascript:alert(1)'])('resolvedor não pode escapar allowlist com %s', async destino => {
    const f = monta()
    f.opcoes.resolvedores.loja = () => destino
    expect((await redirecionarOfertaEditorial(f.opcoes)).headers.get('Location')).toBe('/')
    expect(f.registrarClique).not.toHaveBeenCalled()
  })
  it('sem resolvedor não usa URL crua e sem higiene explícita não inventa clique humano', async () => {
    const f = monta()
    f.opcoes.resolvedores = {}
    expect((await redirecionarOfertaEditorial(f.opcoes)).headers.get('Location')).toBe('/')
    const semHigiene = monta()
    semHigiene.opcoes.ehHumano = undefined
    expect((await redirecionarOfertaEditorial(semHigiene.opcoes)).status).toBe(302)
    expect(semHigiene.registrarClique).not.toHaveBeenCalled()
  })
  it('falha de tracking não bloqueia, waitUntil recebe tarefa e teto aborta trabalho preso', async () => {
    const falha = monta()
    falha.opcoes.registrarClique = async () => { throw new Error('falha simulada') }
    expect((await redirecionarOfertaEditorial(falha.opcoes)).headers.get('Location')).toBe('https://loja.example/link-curto')
    vi.useFakeTimers()
    const lento = monta()
    let signal: AbortSignal | undefined
    lento.opcoes.registrarClique = async (_sinal, opcoes) => { signal = opcoes.signal; await new Promise<void>(() => {}) }
    const tarefas: Promise<void>[] = []
    lento.opcoes.emSegundoPlano = p => tarefas.push(p)
    expect((await redirecionarOfertaEditorial(lento.opcoes)).status).toBe(302)
    expect(tarefas).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(10_000)
    await tarefas[0]
    expect(signal!.aborted).toBe(true)
  })
})
