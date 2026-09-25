/**
 * PRD 24 RF1 — a revalidação agrupada contra o Payload de verdade.
 *
 * O teste unitário (`tests/revalidate.spec.ts`) chama os hooks à mão; este prova o que ele
 * não prova: que o Payload roda o `afterOperation` UMA vez depois dos 250 `afterChange` de um
 * `update` em massa, com o mesmo `req.context`, e que os POSTs já chegaram ao site quando a
 * operação volta. O "site" é um servidor HTTP local que só conta o que recebe.
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

describe.skipIf(semBanco)('revalidação agrupada no Payload', () => {
  let payload: Payload
  let site: Server
  let recebidos: string[][] = []

  beforeAll(async () => {
    site = createServer((req, res) => {
      let corpo = ''
      req.on('data', (parte) => (corpo += parte))
      req.on('end', () => {
        recebidos.push(JSON.parse(corpo).tags)
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
      colecoes: [notas],
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
    })
    payload = await getPayload({ config, key: 'revalidacao', disableOnInit: true })

    // o acervo entra como num import: sem REVALIDATE_URL, nenhum POST
    for (let i = 1; i <= 250; i++) await payload.create({ collection: 'notas' as never, data: { titulo: `nota ${i}` } as never })
    expect(recebidos).toEqual([])
  }, 180_000)

  beforeEach(() => {
    recebidos = []
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

  it('um save: um POST, já entregue quando o create volta', async () => {
    const doc = await payload.create({ collection: 'notas' as never, data: { titulo: 'avulsa' } as never })
    expect(recebidos).toEqual([[`notas:${doc.id}`]])
    await payload.delete({ collection: 'notas' as never, id: doc.id })
  })

  it('250 documentos num update em massa geram 3 POSTs (100 + 100 + 50), já entregues quando o update volta', async () => {
    const r = await payload.update({
      collection: 'notas' as never,
      where: { titulo: { like: 'nota' } },
      data: { titulo: 'nota revista' } as never,
    })
    expect(r.docs).toHaveLength(250)
    expect(recebidos.map((lote) => lote.length)).toEqual([100, 100, 50])
    expect(new Set(recebidos.flat())).toEqual(new Set(r.docs.map((d) => `notas:${d.id}`)))
  }, 60_000)

  it('apagar os 250 em massa: 3 POSTs também', async () => {
    const r = await payload.delete({ collection: 'notas' as never, where: { titulo: { like: 'nota' } } })
    expect(r.docs).toHaveLength(250)
    expect(recebidos.map((lote) => lote.length)).toEqual([100, 100, 50])
  }, 60_000)
})
