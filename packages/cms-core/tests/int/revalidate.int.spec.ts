/**
 * PRD 24 RF1 — a revalidação agrupada contra o Payload de verdade.
 *
 * O teste unitário (`tests/revalidate.spec.ts`) chama os hooks à mão; este prova o que ele
 * não prova: que o Payload roda o `beforeOperation`/`afterOperation` em volta dos 250
 * `afterChange` de um `update` em massa, com o mesmo `req.context`; que a escrita aninhada
 * (hook que grava em outra coleção com o mesmo `req`) não parte o lote; e que, quando o site
 * é avisado, o banco já tem o valor novo — o `afterOperation` roda antes do commit, e por isso
 * o envio não é esperado ali. O "site" é um servidor HTTP local que conta o que recebe e lê o
 * documento por outra conexão, como leria ao re-renderizar a página.
 *
 * O agendador (`revalidacao.emSegundoPlano`) acumula as promessas do envio, e cada teste as
 * espera — o que o `ctx.waitUntil` faz num Worker.
 *
 * O banco é um database PRÓPRIO do teste, derivado do `DATABASE_URL` (mesmo servidor, nome
 * `cms_core_teste_revalidacao`), criado pelo adapter se faltar e zerado a cada rodada: o
 * teste usa `push`, e push no banco de desenvolvimento de alguém apagaria o que não é do
 * núcleo. No CI o Postgres está no job, e sem ele o teste REPROVA; fora do CI, pula.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { getPayload, type CollectionConfig, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { cmsCore } from '../../src/fabrica'
import { revalidateAfterChange, revalidateAfterDelete } from '../../src/hooks/revalidate'

const semBanco = !process.env.DATABASE_URL

it.runIf(semBanco && process.env.CI)('no CI o Postgres é obrigatório — sem ele este teste não pode pular calado', () => {
  expect(process.env.DATABASE_URL, 'DATABASE_URL ausente no CI').toBeTruthy()
})

/** uma coleção de site qualquer, com a revalidação de sempre e sem tenant (para não precisar de um) */
const notas: CollectionConfig = {
  slug: 'notas',
  custom: { tenantCampoProprio: true },
  fields: [{ name: 'titulo', type: 'text' }],
  hooks: { afterChange: [revalidateAfterChange('notas')], afterDelete: [revalidateAfterDelete('notas')] },
}

/** o histórico que cada mudança de `precos` grava com o mesmo `req` (como o do catálogo do afiliado) */
const historico: CollectionConfig = {
  slug: 'historico',
  custom: { tenantCampoProprio: true },
  fields: [{ name: 'valor', type: 'number' }],
  hooks: { afterChange: [revalidateAfterChange('historico')] },
}
const precos: CollectionConfig = {
  slug: 'precos',
  custom: { tenantCampoProprio: true },
  fields: [{ name: 'valor', type: 'number' }],
  hooks: {
    afterChange: [
      async ({ doc, req }) => {
        await req.payload.create({ collection: 'historico' as never, data: { valor: doc.valor } as never, req })
        return doc
      },
      revalidateAfterChange('precos'),
    ],
  },
}

describe.skipIf(semBanco)('revalidação agrupada no Payload', () => {
  let payload: Payload
  let site: Server
  let recebidos: string[][] = []
  /** o que o site leu do banco ao receber cada POST, quando há um documento a olhar */
  let vistos: (string | null)[] = []
  let olhar: number | string | null = null
  let agendados: Promise<unknown>[] = []
  const entregues = async () => {
    await Promise.all(agendados)
    agendados = []
  }

  beforeAll(async () => {
    site = createServer((req, res) => {
      let corpo = ''
      req.on('data', (parte) => (corpo += parte))
      req.on('end', async () => {
        recebidos.push(JSON.parse(corpo).tags)
        if (olhar !== null) {
          // o que o site veria ao re-renderizar: outra conexão do pool, fora da transação
          const r = await (payload.db as unknown as { pool: { query: (sql: string, v: unknown[]) => Promise<{ rows: { titulo: string }[] }> } }).pool.query(
            'select titulo from notas where id = $1',
            [olhar],
          )
          vistos.push(r.rows[0]?.titulo ?? null)
        }
        res.end('{}')
      })
    })
    await new Promise<void>((pronto) => site.listen(0, '127.0.0.1', pronto))

    const banco = new URL(process.env.DATABASE_URL!)
    banco.pathname = '/cms_core_teste_revalidacao'
    vi.stubEnv('PAYLOAD_DB_PUSH', '1')
    vi.stubEnv('PAYLOAD_DROP_DATABASE', 'true')
    vi.stubEnv('PAYLOAD_SECRET', process.env.PAYLOAD_SECRET || 'segredo-de-teste')
    vi.stubEnv('REVALIDATE_URL', '')

    const pasta = mkdtempSync(join(tmpdir(), 'revalidacao-'))
    const config = await cmsCore({
      raiz: pasta,
      pastaDeMigracoes: pasta,
      colecoes: [notas, historico, precos],
      db: { connectionString: banco.toString() },
      // nenhum teste daqui envia arquivo: o bucket não é alcançado
      midia: {
        r2: {
          bucket: 'nenhum',
          endpoint: 'https://bucket.invalid',
          credentials: { accessKeyId: 'x', secretAccessKey: 'y' },
          publicBase: 'https://media.invalid',
        },
      },
      revalidacao: { emSegundoPlano: (envio) => void agendados.push(envio) },
    })
    payload = await getPayload({ config, key: 'revalidacao', disableOnInit: true })

    // o acervo entra como num import: sem REVALIDATE_URL, nenhum POST
    for (let i = 1; i <= 250; i++) await payload.create({ collection: 'notas' as never, data: { titulo: `nota ${i}` } as never })
    for (let i = 1; i <= 5; i++) await payload.create({ collection: 'precos' as never, data: { valor: i } as never })
    await entregues()
    expect(recebidos).toEqual([])
  }, 180_000)

  beforeEach(() => {
    recebidos = []
    vistos = []
    olhar = null
    agendados = []
    vi.stubEnv('REVALIDATE_URL', `http://127.0.0.1:${(site.address() as AddressInfo).port}/api/revalidate`)
  })

  afterAll(async () => {
    if (payload) {
      await payload.db.dropDatabase({ adapter: payload.db as never })
      await payload.destroy()
    }
    site?.close()
    vi.unstubAllEnvs()
  })

  it('um save: um POST', async () => {
    const doc = await payload.create({ collection: 'notas' as never, data: { titulo: 'avulsa' } as never })
    await entregues()
    expect(recebidos).toEqual([[`notas:${doc.id}`]])
    await payload.delete({ collection: 'notas' as never, id: doc.id })
    await entregues()
  })

  it('quando o site é avisado, o banco já tem o valor novo (o envio não segura a transação)', async () => {
    const doc = await payload.create({ collection: 'notas' as never, data: { titulo: 'antes' } as never })
    await entregues()
    olhar = doc.id
    vistos = []
    await payload.update({ collection: 'notas' as never, id: doc.id, data: { titulo: 'depois' } as never })
    await entregues()
    expect(vistos).toEqual(['depois'])
    olhar = null
    await payload.delete({ collection: 'notas' as never, id: doc.id })
    await entregues()
  })

  it('escrita aninhada com o mesmo req (o histórico de cada preço) não parte o lote: um POST só', async () => {
    const r = await payload.update({ collection: 'precos' as never, where: { valor: { exists: true } }, data: { valor: 9 } as never })
    expect(r.docs).toHaveLength(5)
    await entregues()
    expect(recebidos).toHaveLength(1)
    const tags = recebidos[0]!
    expect(tags.filter((t) => t.startsWith('precos:'))).toHaveLength(5)
    expect(tags.filter((t) => t.startsWith('historico:'))).toHaveLength(5)
  }, 60_000)

  it('250 documentos num update em massa geram 3 POSTs (100 + 100 + 50)', async () => {
    const r = await payload.update({
      collection: 'notas' as never,
      where: { titulo: { like: 'nota' } },
      data: { titulo: 'nota revista' } as never,
    })
    expect(r.docs).toHaveLength(250)
    await entregues()
    expect(recebidos.map((lote) => lote.length)).toEqual([100, 100, 50])
    expect(new Set(recebidos.flat())).toEqual(new Set(r.docs.map((d) => `notas:${d.id}`)))
  }, 60_000)

  it('apagar os 250 em massa: 3 POSTs também', async () => {
    const r = await payload.delete({ collection: 'notas' as never, where: { titulo: { like: 'nota' } } })
    expect(r.docs).toHaveLength(250)
    await entregues()
    expect(recebidos.map((lote) => lote.length)).toEqual([100, 100, 50])
  }, 60_000)
})
