/**
 * PRD 24 RF1 — a revalidação agrupa as tags de uma operação e as envia uma vez, sem timer.
 *
 * Por que muda: o purge por tag da Cloudflare aceita 5 requisições por minuto (rajada de 25),
 * com até 100 tags cada. Um POST por documento, num `update` em massa de 250 documentos,
 * eram 250 purges — o site recusaria a maior parte.
 *
 * Então: o `beforeOperation` (que a fábrica põe em toda coleção) abre o quadro da operação de
 * escrita, `afterChange`/`afterDelete` só ACUMULAM no quadro aberto, e o `afterOperation`
 * fecha o quadro. A escrita aninhada (hook que grava em outra coleção com o mesmo `req`)
 * entrega as tags à de fora; só a de fora envia, em lotes de no máximo 100 tags por POST.
 *
 * O envio NÃO é esperado: o Payload roda o `afterOperation` antes do commit. A promessa vai
 * para o `emSegundoPlano` da config (num Worker, `ctx.waitUntil`); sem ele, fica solta.
 *
 * As tags de cada documento são as mesmas de antes (o teste de contrato do site as confere).
 */
import type { PayloadRequest } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  revalidateAfterChange,
  revalidateAfterDelete,
  revalidateAfterOperation,
  revalidateBeforeOperation,
} from '../src/hooks/revalidate'

let enviadas: string[][]
let resposta: () => Promise<Response>

beforeEach(() => {
  enviadas = []
  resposta = async () => new Response('{}')
  vi.stubEnv('REVALIDATE_URL', 'http://exemplo.test/api/revalidate')
  vi.stubEnv('REVALIDATE_TOKEN', 'token-de-teste')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      enviadas.push(JSON.parse(init.body).tags)
      return resposta()
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const slugs: Record<string, Record<string, string>> = { tenants: { '1': 'exemplo' } }

/** Um `req` como o do Payload, com o agendador da fábrica acumulando as promessas do envio. */
const novaReq = ({ agendador = true, transacao = 'tx-1' as unknown } = {}) => {
  const warn = vi.fn()
  const agendadas: Promise<unknown>[] = []
  const req = {
    context: {},
    transactionID: transacao,
    payload: {
      config: agendador ? { custom: { revalidacao: { emSegundoPlano: (p: Promise<unknown>) => agendadas.push(p) } } } : {},
      findByID: async ({ collection, id }: { collection: string; id: string | number }) => ({ slug: slugs[collection]?.[String(id)] }),
      logger: { warn },
    },
  } as unknown as PayloadRequest
  /** espera o que o agendador recebeu — o que o `ctx.waitUntil` faria no Worker */
  const entregue = () => Promise.all(agendadas)
  return { req, warn, agendadas, entregue }
}

const mudou = (req: PayloadRequest, doc: Record<string, unknown>, colecao = 'posts') =>
  revalidateAfterChange(colecao)({ doc, req } as never)
const apagou = (req: PayloadRequest, doc: Record<string, unknown>) => revalidateAfterDelete('posts')({ doc, req } as never)

/** o `beforeOperation` recebe o nome do Payload para hooks: `updateByID` é `update`, `deleteByID` é `delete` */
const NOME_NO_BEFORE: Record<string, string> = { updateByID: 'update', deleteByID: 'delete', find: 'read', findByID: 'read' }

/** abre a operação como o Payload: `beforeOperation`, e os `args` que ele devolve vão ao `afterOperation` */
const comecou = async (req: PayloadRequest, operation: string) =>
  (await revalidateBeforeOperation({ args: { req }, operation: NOME_NO_BEFORE[operation] ?? operation, req, context: req.context } as never)) as object
const terminou = (req: PayloadRequest, operation: string, args: object) =>
  revalidateAfterOperation({ args, operation, req, result: { ok: true } } as never)

describe('revalidação agrupada por operação', () => {
  it('um save: um POST, com as tags de sempre, na ordem de sempre', async () => {
    const { req, entregue } = novaReq()
    const op = await comecou(req, 'create')
    await mudou(req, { id: 9, tenant: 1 })
    expect(enviadas).toEqual([])
    await terminou(req, 'create', op)
    await entregue()
    expect(enviadas).toEqual([['posts:9', 'tenant:exemplo']])
  })

  it('250 documentos num update em massa geram 3 POSTs (100 + 100 + 51 tags)', async () => {
    const { req, entregue } = novaReq()
    const op = await comecou(req, 'update')
    await Promise.all(Array.from({ length: 250 }, (_, i) => mudou(req, { id: i + 1, tenant: 1 })))
    expect(enviadas).toEqual([])

    await terminou(req, 'update', op)
    await entregue()

    expect(enviadas.map((lote) => lote.length)).toEqual([100, 100, 51])
    const todas = enviadas.flat()
    // cada tag uma vez: a do tenant, que os 250 repetem, também
    expect(new Set(todas).size).toBe(todas.length)
    expect(todas).toContain('tenant:exemplo')
    expect(todas).toContain('posts:1')
    expect(todas).toContain('posts:250')
  })

  it('apagar também acumula e sai no afterOperation', async () => {
    const { req, entregue } = novaReq()
    const op = await comecou(req, 'delete')
    await apagou(req, { id: 3, tenant: 1 })
    await apagou(req, { id: 4, tenant: 1 })
    expect(enviadas).toEqual([])
    await terminou(req, 'delete', op)
    await entregue()
    expect(enviadas).toEqual([['posts:3', 'tenant:exemplo', 'posts:4']])
  })

  it.each(['create', 'update', 'updateByID', 'delete', 'deleteByID', 'restoreVersion'])('a escrita %s envia', async (operacao) => {
    const { req, entregue } = novaReq()
    const op = await comecou(req, operacao)
    await mudou(req, { id: 1 })
    await terminou(req, operacao, op)
    await entregue()
    expect(enviadas).toEqual([['posts:1']])
  })

  it.each(['find', 'findByID', 'count', 'findVersions'])(
    'a leitura %s não abre quadro nem envia: uma busca no meio do lote não parte o lote',
    async (operacao) => {
      const { req, entregue } = novaReq()
      const op = await comecou(req, 'update')
      await mudou(req, { id: 1 })
      const leitura = await comecou(req, operacao)
      await terminou(req, operacao, leitura)
      await entregue()
      expect(enviadas).toEqual([])
      await terminou(req, 'update', op)
      await entregue()
      expect(enviadas).toEqual([['posts:1']])
    },
  )

  it('a fila esvazia a cada envio: a operação seguinte não reenvia as tags da anterior', async () => {
    const { req, entregue } = novaReq()
    const um = await comecou(req, 'updateByID')
    await mudou(req, { id: 1 })
    await terminou(req, 'updateByID', um)
    const dois = await comecou(req, 'updateByID')
    await mudou(req, { id: 2 })
    await terminou(req, 'updateByID', dois)
    await entregue()
    expect(enviadas).toEqual([['posts:1'], ['posts:2']])
  })

  it('operação sem tag pendente não faz POST nem agenda nada', async () => {
    const { req, agendadas } = novaReq()
    await terminou(req, 'update', await comecou(req, 'update'))
    expect(agendadas).toEqual([])
    expect(enviadas).toEqual([])
  })

  it('sem REVALIDATE_URL (scripts de import) nada sai, e o quadro fecha do mesmo jeito', async () => {
    vi.stubEnv('REVALIDATE_URL', '')
    const { req, entregue } = novaReq()
    const op = await comecou(req, 'update')
    await mudou(req, { id: 1 })
    await terminou(req, 'update', op)
    await entregue()
    expect(enviadas).toEqual([])
    expect((req.context as { pilhaDeRevalidacao?: unknown[] }).pilhaDeRevalidacao).toEqual([])
  })

  it('o POST leva o Bearer do REVALIDATE_TOKEN', async () => {
    const { req, entregue } = novaReq()
    const op = await comecou(req, 'create')
    await mudou(req, { id: 1 })
    await terminou(req, 'create', op)
    await entregue()
    const [url, init] = vi.mocked(fetch).mock.calls[0]! as unknown as [string, { headers: Record<string, string>; method: string }]
    expect(url).toBe('http://exemplo.test/api/revalidate')
    expect(init.method).toBe('POST')
    expect(init.headers.authorization).toBe('Bearer token-de-teste')
  })

  it('site fora do ar não derruba o save: vira warning, e a promessa agendada não rejeita', async () => {
    resposta = async () => {
      throw new Error('ECONNREFUSED')
    }
    const { req, warn, entregue } = novaReq()
    const op = await comecou(req, 'create')
    await mudou(req, { id: 1 })
    await expect(terminou(req, 'create', op)).resolves.toEqual({ ok: true })
    await expect(entregue()).resolves.toBeDefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('o site recusando (429 do purge) também vira warning, sem derrubar o save', async () => {
    resposta = async () => new Response('{}', { status: 429 })
    const { req, warn, entregue } = novaReq()
    const op = await comecou(req, 'create')
    await mudou(req, { id: 1 })
    await expect(terminou(req, 'create', op)).resolves.toEqual({ ok: true })
    await entregue()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('o afterOperation devolve o resultado da operação intacto', async () => {
    const { req } = novaReq()
    const op = await comecou(req, 'create')
    await mudou(req, { id: 1 })
    expect(await terminou(req, 'create', op)).toEqual({ ok: true })
  })
})

describe('o save não espera o site (o afterOperation roda antes do commit)', () => {
  /** um site que só responde quando o teste manda */
  const siteParado = () => {
    let libera!: () => void
    const liberado = new Promise<void>((pronto) => (libera = pronto))
    resposta = async () => {
      await liberado
      return new Response('{}')
    }
    return libera
  }

  it('o afterOperation volta com o POST ainda em curso, e a promessa dele vai ao agendador', async () => {
    const libera = siteParado()
    const { req, agendadas } = novaReq()
    const op = await comecou(req, 'updateByID')
    await mudou(req, { id: 1 })
    await expect(terminou(req, 'updateByID', op)).resolves.toEqual({ ok: true })
    expect(enviadas).toEqual([['posts:1']]) // o POST já saiu…
    expect(agendadas).toHaveLength(1) // …e quem o segura é o agendador (no Worker, ctx.waitUntil)
    let terminouOPost = false
    void agendadas[0]!.then(() => (terminouOPost = true))
    await Promise.resolve()
    expect(terminouOPost).toBe(false)
    libera()
    await Promise.all(agendadas)
    expect(terminouOPost).toBe(true)
  })

  it('agendador que lança (fora de uma requisição do Worker) não derruba o save: vira warning, e o POST sai', async () => {
    const { req, warn } = novaReq()
    ;(req.payload.config as { custom: unknown }).custom = {
      revalidacao: {
        emSegundoPlano: () => {
          throw new Error('fora do contexto')
        },
      },
    }
    const op = await comecou(req, 'create')
    await mudou(req, { id: 1 })
    await expect(terminou(req, 'create', op)).resolves.toEqual({ ok: true })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(enviadas).toEqual([['posts:1']])
  })

  it('sem agendador na config (Node, o padrão): o POST sai solto, como sempre foi', async () => {
    const libera = siteParado()
    const { req } = novaReq({ agendador: false })
    const op = await comecou(req, 'create')
    await mudou(req, { id: 1 })
    await expect(terminou(req, 'create', op)).resolves.toEqual({ ok: true })
    expect(enviadas).toEqual([['posts:1']])
    libera()
  })
})

describe('escrita aninhada com o mesmo req (o histórico de preço do catálogo)', () => {
  it('as tags da aninhada vão para a operação de fora: um envio só, no fim da de fora', async () => {
    const { req, entregue } = novaReq()
    // update em massa de ofertas; o hook de cada oferta grava o histórico com o mesmo req
    const fora = await comecou(req, 'update')
    for (const id of [1, 2, 3]) {
      const dentro = await comecou(req, 'create')
      await mudou(req, { id: 100 + id, tenant: 1 }, 'historico')
      await terminou(req, 'create', dentro)
      await entregue()
      expect(enviadas, 'a escrita aninhada não envia').toEqual([])
      await mudou(req, { id, tenant: 1 }, 'ofertas')
    }
    await terminou(req, 'update', fora)
    await entregue()
    expect(enviadas).toEqual([
      ['historico:101', 'tenant:exemplo', 'ofertas:1', 'historico:102', 'ofertas:2', 'historico:103', 'ofertas:3'],
    ])
  })

  it('a aninhada que falha e é engolida por um hook não prende as tags da de fora', async () => {
    const { req, entregue } = novaReq()
    const fora = await comecou(req, 'update')
    await mudou(req, { id: 1 }, 'ofertas')
    await comecou(req, 'create') // lança antes do afterOperation; o hook segue
    await mudou(req, { id: 2 }, 'ofertas')
    await terminou(req, 'update', fora)
    await entregue()
    expect(enviadas).toEqual([['ofertas:1', 'ofertas:2']])
    expect((req.context as { pilhaDeRevalidacao?: unknown[] }).pilhaDeRevalidacao).toEqual([])
  })

  it('operação que falhou num req que segue em uso: a seguinte (outra transação) envia, com as tags da que falhou', async () => {
    const { req, entregue } = novaReq({ transacao: 'tx-1' })
    await comecou(req, 'update') // falha: o Payload desfaz a transação e apaga o transactionID
    await mudou(req, { id: 1 })
    ;(req as { transactionID?: unknown }).transactionID = 'tx-2'
    const seguinte = await comecou(req, 'update')
    await mudou(req, { id: 2 })
    await terminou(req, 'update', seguinte)
    await entregue()
    expect(enviadas).toEqual([['posts:1', 'posts:2']])
  })
})

describe('hook fora da fábrica (sem operação aberta)', () => {
  it('envia na hora, um POST por documento, como antes — nada fica preso na fila', async () => {
    const { req, entregue } = novaReq()
    await mudou(req, { id: 9, tenant: 1 })
    await entregue()
    expect(enviadas).toEqual([['posts:9', 'tenant:exemplo']])
  })

  it('chamado sem context nem config (o teste de contrato do site chama assim): envia na hora', async () => {
    const req = {
      payload: { findByID: async () => ({ slug: 'exemplo' }), logger: { warn: vi.fn() } },
    } as unknown as PayloadRequest
    await revalidateAfterChange('posts')({ doc: { id: 9, tenant: 1 }, req } as never)
    await new Promise((pronto) => setTimeout(pronto, 0))
    expect(enviadas).toEqual([['posts:9', 'tenant:exemplo']])
  })
})
