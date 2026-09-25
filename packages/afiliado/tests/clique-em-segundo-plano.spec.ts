/**
 * O registro do clique do `/r/{id}` nos Workers (PRD 24): o redirect não espera o POST.
 *
 * Nos Workers, o POST de `/api/cliques` ao CMS (também num Worker) leva de 1,3 s a 1,5 s, e o
 * teto de 1,5 s abortava quase todo registro — a coleção `cliques` parou de receber cliques
 * no dia da virada. Com o `waitUntil` do Worker (`locals.cfContext`, do
 * `@astrojs/cloudflare`), o registro começa antes do redirect e termina depois da resposta,
 * com teto folgado. Em Node não existe `waitUntil`: o redirect espera o registro, como antes.
 *
 * O teste passa pelo `logClique` e pelo `cmsFetch` de verdade; só o `fetch` é falso, e o POST
 * fica pendurado até o teste soltá-lo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cms = vi.hoisted(() => ({ doc: null as unknown }))

vi.mock('virtual:afiliado/config', () => ({ default: {} }))
vi.mock('../src/web/lib/cms', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/web/lib/cms')>()),
  cmsFindOneNoTenant: async () => cms.doc,
}))

const { GET } = await import('../src/web/rotas/r/[id]')
const { logClique } = await import('../src/web/lib/cms')

const tenant = { id: 1, slug: 'exemplo', programas_ativos: [{ programa: 'amazon', id_afiliado_env: 'AFF_EXEMPLO_RF3' }] }

const cupom = {
  id: 1,
  estado: 'publicado',
  url_afiliado_fonte: 'https://www.amazon.com.br/dp/B0ABCDEFGH',
  loja: { id: 9, slug: 'loja-exemplo', programa: 'amazon' },
}

const clique = { tenant: 1, tipo_doc: 'cupom' as const, doc_id: 'c1', ref: 'pagina' }

function contexto(locals: Record<string, unknown> = {}) {
  const url = new URL('https://exemplo.test/r/c1')
  return {
    params: { id: 'c1' },
    url,
    locals: { tenant, ...locals },
    request: new Request(url),
    clientAddress: '203.0.113.7',
    redirect: (destino: string, status: number) => new Response(null, { status, headers: { location: destino } }),
  } as unknown as Parameters<typeof GET>[0]
}

/** Um `fetch` cujo POST só responde quando o teste manda. */
function fetchPendurado() {
  let solta!: (r: Response) => void
  let falha!: (e: Error) => void
  const resposta = new Promise<Response>((resolve, reject) => {
    solta = resolve
    falha = reject
  })
  const fetch = vi.fn((_url: string, _init?: RequestInit) => resposta)
  vi.stubGlobal('fetch', fetch)
  return {
    fetch,
    responde: () => solta(Response.json({ doc: { id: 1 } }, { status: 201 })),
    falha: (e: Error) => falha(e),
  }
}

/** Resolve com o valor da promessa, ou com 'pendente' se ela não resolveu no tempo dado. */
const aindaPendente = <T>(p: T | Promise<T>, ms = 30) =>
  Promise.race([Promise.resolve(p), new Promise<'pendente'>((r) => setTimeout(() => r('pendente'), ms))])

beforeEach(() => {
  vi.stubEnv('CMS_URL', 'https://cms.exemplo.test')
  vi.stubEnv('CMS_API_KEY', 'chave-de-teste')
  vi.stubEnv('AFF_EXEMPLO_RF3', 'exemplo-20')
  vi.stubEnv('IP_HASH_SALT', 'sal-de-teste')
  cms.doc = cupom
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  cms.doc = null
})

describe('/r/{id} nos Workers (com waitUntil)', () => {
  it('responde 302 sem esperar o registro, e o registro vai para o waitUntil', async () => {
    const cf = fetchPendurado()
    const waitUntil = vi.fn()

    const r = await aindaPendente(GET(contexto({ cfContext: { waitUntil } })))

    expect(r).toBeInstanceOf(Response)
    expect((r as Response).status).toBe(302)
    expect(new URL((r as Response).headers.get('location')!).searchParams.get('tag')).toBe('exemplo-20')
    // o POST já saiu antes da resposta (o registro começa ANTES do redirect)…
    expect(cf.fetch).toHaveBeenCalledTimes(1)
    expect(cf.fetch.mock.calls[0]![1]?.method).toBe('POST')
    // …e quem segura o Worker vivo até ele terminar é o waitUntil
    expect(waitUntil).toHaveBeenCalledTimes(1)
    const tarefa = waitUntil.mock.calls[0]![0] as Promise<unknown>
    expect(tarefa).toBeInstanceOf(Promise)
    expect(await aindaPendente(tarefa)).toBe('pendente')

    cf.responde()
    await expect(tarefa).resolves.toBeUndefined()
  })

  it('o waitUntil é chamado como método do contexto de execução (this preservado)', async () => {
    fetchPendurado().responde()
    const cfContext = {
      tarefas: [] as Array<Promise<unknown>>,
      waitUntil(this: { tarefas: Array<Promise<unknown>> }, p: Promise<unknown>) {
        this.tarefas.push(p)
      },
    }

    const r = await GET(contexto({ cfContext }))

    expect(r.status).toBe(302)
    expect(cfContext.tarefas).toHaveLength(1)
  })

  it('o teto do registro em segundo plano é de 10 s, não o 1,5 s de quem espera', async () => {
    fetchPendurado().responde()
    const teto = vi.spyOn(AbortSignal, 'timeout')

    await GET(contexto({ cfContext: { waitUntil: vi.fn() } }))

    expect(teto).toHaveBeenCalledWith(10_000)
    expect(teto).not.toHaveBeenCalledWith(1500)
  })

  it('registro que falha em segundo plano não rejeita a tarefa do waitUntil', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cf = fetchPendurado()
    const waitUntil = vi.fn()

    const r = await GET(contexto({ cfContext: { waitUntil } }))
    cf.falha(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))

    expect(r.status).toBe(302)
    await expect(waitUntil.mock.calls[0]![0]).resolves.toBeUndefined()
    expect(aviso).toHaveBeenCalledWith('[cliques] log falhou (segue o redirect):', expect.any(String))
  })
})

describe('/r/{id} em Node (sem waitUntil)', () => {
  it('o redirect espera o registro terminar, como antes', async () => {
    const cf = fetchPendurado()

    const resposta = GET(contexto())

    expect(await aindaPendente(resposta)).toBe('pendente')
    expect(cf.fetch).toHaveBeenCalledTimes(1)
    cf.responde()
    expect((await resposta).status).toBe(302)
  })

  it('com o teto de 1,5 s', async () => {
    fetchPendurado().responde()
    const teto = vi.spyOn(AbortSignal, 'timeout')

    await GET(contexto())

    expect(teto).toHaveBeenCalledWith(1500)
  })

  it('locals sem cfContext utilizável (sem waitUntil) também espera', async () => {
    const cf = fetchPendurado()

    const resposta = GET(contexto({ cfContext: {} }))

    expect(await aindaPendente(resposta)).toBe('pendente')
    cf.responde()
    expect((await resposta).status).toBe(302)
  })
})

describe('logClique', () => {
  it('pede depth=0: a resposta do POST não popula tenant nem loja', async () => {
    const cf = fetchPendurado()
    cf.responde()

    await logClique(clique)

    const [url, init] = cf.fetch.mock.calls[0]!
    const pedido = new URL(url)
    expect(pedido.origin + pedido.pathname).toBe('https://cms.exemplo.test/api/cliques')
    expect(pedido.searchParams.get('depth')).toBe('0')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual(clique)
  })

  it('o teto padrão é 1,5 s; quem chama pode dar outro', async () => {
    fetchPendurado().responde()
    const teto = vi.spyOn(AbortSignal, 'timeout')

    await logClique(clique)
    await logClique(clique, 10_000)

    expect(teto.mock.calls.map(([ms]) => ms)).toEqual([1500, 10_000])
  })

  it('falha nunca lança: avisa no log e segue', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })))

    await expect(logClique(clique)).resolves.toBeUndefined()
    expect(aviso).toHaveBeenCalledWith('[cliques] log falhou (segue o redirect):', 'CMS /api/cliques?depth=0 → HTTP 403')
  })
})
