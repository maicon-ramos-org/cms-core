/**
 * PRD 24 RF1 — a revalidação agrupa as tags de uma operação e as envia uma vez, sem timer.
 *
 * Por que muda: o purge por tag da Cloudflare aceita 5 requisições por minuto (rajada de 25),
 * com até 100 tags cada. Um POST por documento, num `update` em massa de 250 documentos,
 * eram 250 purges — o site recusaria a maior parte. E num Worker uma promessa solta (ou um
 * `setTimeout` fora de `ctx.waitUntil`) morre com a resposta; o hook não tem `ctx`.
 *
 * Então: `afterChange`/`afterDelete` só ACUMULAM em `req.context.tagsPendentes`, e o
 * `afterOperation` (que a fábrica põe em toda coleção) envia, em lotes de no máximo 100 tags
 * por POST, e só volta quando o envio terminou.
 *
 * As tags de cada documento são as mesmas de antes (o teste de contrato do site as confere).
 */
import type { CollectionConfig, PayloadRequest } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { revalidateAfterChange, revalidateAfterDelete, revalidateAfterOperation } from '../src/hooks/revalidate'

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
const novaReq = () => {
  const warn = vi.fn()
  const req = {
    context: {},
    payload: {
      findByID: async ({ collection, id }: { collection: string; id: string | number }) => ({ slug: slugs[collection]?.[String(id)] }),
      logger: { warn },
    },
  } as unknown as PayloadRequest
  return { req, warn }
}

/** a coleção como a fábrica a entrega: com o envio no `afterOperation` */
const colecao = { slug: 'posts', hooks: { afterOperation: [revalidateAfterOperation] } } as unknown as CollectionConfig

const mudou = (req: PayloadRequest, doc: Record<string, unknown>, collection: unknown = colecao) =>
  revalidateAfterChange('posts')({ doc, req, collection } as never)
const apagou = (req: PayloadRequest, doc: Record<string, unknown>) => revalidateAfterDelete('posts')({ doc, req, collection: colecao } as never)
const terminou = (req: PayloadRequest, operation: string) =>
  revalidateAfterOperation({ operation, req, result: { ok: true }, collection: colecao } as never)

describe('revalidação agrupada por operação', () => {
  it('um save: um POST, com as tags de sempre, na ordem de sempre', async () => {
    const { req } = novaReq()
    await mudou(req, { id: 9, tenant: 1 })
    expect(enviadas).toEqual([])
    await terminou(req, 'create')
    expect(enviadas).toEqual([['posts:9', 'tenant:exemplo']])
  })

  it('250 documentos num update em massa geram 3 POSTs (100 + 100 + 51 tags)', async () => {
    const { req } = novaReq()
    await Promise.all(Array.from({ length: 250 }, (_, i) => mudou(req, { id: i + 1, tenant: 1 })))
    expect(enviadas).toEqual([])

    await terminou(req, 'update')

    expect(enviadas.map((lote) => lote.length)).toEqual([100, 100, 51])
    const todas = enviadas.flat()
    // cada tag uma vez: a do tenant, que os 250 repetem, também
    expect(new Set(todas).size).toBe(todas.length)
    expect(todas).toContain('tenant:exemplo')
    expect(todas).toContain('posts:1')
    expect(todas).toContain('posts:250')
  })

  it('apagar também acumula e sai no afterOperation', async () => {
    const { req } = novaReq()
    await apagou(req, { id: 3, tenant: 1 })
    await apagou(req, { id: 4, tenant: 1 })
    expect(enviadas).toEqual([])
    await terminou(req, 'delete')
    expect(enviadas).toEqual([['posts:3', 'tenant:exemplo', 'posts:4']])
  })

  it.each(['create', 'update', 'updateByID', 'delete', 'deleteByID', 'restoreVersion'])('a escrita %s envia', async (operacao) => {
    const { req } = novaReq()
    await mudou(req, { id: 1 })
    await terminou(req, operacao)
    expect(enviadas).toEqual([['posts:1']])
  })

  it.each(['find', 'findByID', 'count', 'findVersions'])(
    'a leitura %s não envia: uma busca no meio do lote não parte o lote',
    async (operacao) => {
      const { req } = novaReq()
      await mudou(req, { id: 1 })
      await terminou(req, operacao)
      expect(enviadas).toEqual([])
      await terminou(req, 'update')
      expect(enviadas).toEqual([['posts:1']])
    },
  )

  it('a fila esvazia a cada envio: a operação seguinte não reenvia as tags da anterior', async () => {
    const { req } = novaReq()
    await mudou(req, { id: 1 })
    await terminou(req, 'updateByID')
    await mudou(req, { id: 2 })
    await terminou(req, 'updateByID')
    expect(enviadas).toEqual([['posts:1'], ['posts:2']])
  })

  it('operação sem tag pendente não faz POST', async () => {
    const { req } = novaReq()
    await terminou(req, 'update')
    expect(enviadas).toEqual([])
  })

  it('sem REVALIDATE_URL (scripts de import) nada sai, e a fila esvazia do mesmo jeito', async () => {
    vi.stubEnv('REVALIDATE_URL', '')
    const { req } = novaReq()
    await mudou(req, { id: 1 })
    await terminou(req, 'update')
    expect(enviadas).toEqual([])
    expect((req.context as { tagsPendentes?: string[] }).tagsPendentes ?? []).toEqual([])
  })

  it('o hook só volta depois de o POST terminar (num Worker, promessa solta morre com a resposta)', async () => {
    let terminouOPost = false
    resposta = () =>
      new Promise((pronto) =>
        setTimeout(() => {
          terminouOPost = true
          pronto(new Response('{}'))
        }, 20),
      )
    const { req } = novaReq()
    await mudou(req, { id: 1 })
    await terminou(req, 'create')
    expect(terminouOPost).toBe(true)
  })

  it('o POST leva o Bearer do REVALIDATE_TOKEN', async () => {
    const { req } = novaReq()
    await mudou(req, { id: 1 })
    await terminou(req, 'create')
    const [url, init] = vi.mocked(fetch).mock.calls[0]! as unknown as [string, { headers: Record<string, string>; method: string }]
    expect(url).toBe('http://exemplo.test/api/revalidate')
    expect(init.method).toBe('POST')
    expect(init.headers.authorization).toBe('Bearer token-de-teste')
  })

  it('site fora do ar não derruba o save: vira warning', async () => {
    resposta = async () => {
      throw new Error('ECONNREFUSED')
    }
    const { req, warn } = novaReq()
    await mudou(req, { id: 1 })
    await expect(terminou(req, 'create')).resolves.toEqual({ ok: true })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('o site recusando (429 do purge) também vira warning, sem derrubar o save', async () => {
    resposta = async () => new Response('{}', { status: 429 })
    const { req, warn } = novaReq()
    await mudou(req, { id: 1 })
    await expect(terminou(req, 'create')).resolves.toEqual({ ok: true })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('o afterOperation devolve o resultado da operação intacto', async () => {
    const { req } = novaReq()
    await mudou(req, { id: 1 })
    expect(await terminou(req, 'create')).toEqual({ ok: true })
  })
})

describe('hook fora da fábrica (coleção sem o afterOperation)', () => {
  it('envia na hora, um POST por documento, como antes — nada fica preso na fila', async () => {
    const { req } = novaReq()
    await mudou(req, { id: 9, tenant: 1 }, { slug: 'posts', hooks: {} })
    expect(enviadas).toEqual([['posts:9', 'tenant:exemplo']])
  })

  it('chamado sem a coleção (o teste de contrato do site chama assim): envia na hora', async () => {
    const { req } = novaReq()
    await revalidateAfterChange('posts')({ doc: { id: 9, tenant: 1 }, req } as never)
    expect(enviadas).toEqual([['posts:9', 'tenant:exemplo']])
  })
})
