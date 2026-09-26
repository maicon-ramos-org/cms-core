import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { buildConfig, getPayload, handleEndpoints, type Payload, type SanitizedConfig } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { poolPostgresPorRequisicao, type ContextoConexaoPostgres } from '../../src/db/pool-por-requisicao'

const require = createRequire(import.meta.url)
const { Pool } = require(require.resolve('pg', { paths: [dirname(require.resolve('@payloadcms/db-postgres'))] }))
const semBanco = !process.env.DATABASE_URL
it.runIf(semBanco && process.env.CI)('CI exige Postgres para endpoints Payload com pool isolado', () => expect(process.env.DATABASE_URL).toBeTruthy())

describe.skipIf(semBanco)('Payload real com pool por contexto, Node/PG local', () => {
  const contexto = new AsyncLocalStorage<ContextoConexaoPostgres>()
  const id = randomUUID().replaceAll('-', '')
  const nomeBanco = `cms_core_teste_pool_${id}`
  const nomeAplicacao = `pool-payload-${id}`
  const chave = `pool-payload-${id}`
  let admin: InstanceType<typeof Pool>, payload: Payload, config: SanitizedConfig, conexao: string
  let criouBanco = false
  let ofertaA: any, ofertaB: any
  const atual = () => { const c = contexto.getStore(); if (!c) throw new Error('Payload fora de contexto'); return c }
  const roda = <T>(f: () => T) => contexto.run({ identidade: {}, connectionString: conexao }, f)
  const request = (path: string, method = 'GET', body?: unknown) => roda(async () => {
    const r = await handleEndpoints({ config, payloadInstanceCacheKey: chave, request: new Request('http://fixture.test/api' + path, {
      method, headers: { 'content-type': 'application/json', authorization: 'users API-Key pool-fixture-a' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }) })
    return { status: r.status, body: await r.json() as any }
  })

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Fixture Payload exige banco local descartável.')
    admin = new Pool({ connectionString: url.toString(), max: 1 })
    // Nome é prefixo fixo + UUID hexadecimal; nunca recebe entrada de produção.
    await admin.query(`CREATE DATABASE "${nomeBanco}"`)
    criouBanco = true
    url.pathname = '/' + nomeBanco
    conexao = url.toString()
    config = await buildConfig({
      secret: 'pool-fixture-sem-segredo-real',
      typescript: { autoGenerate: false },
      db: postgresAdapter({ pool: { connectionString: conexao, maxUses: 1, application_name: nomeAplicacao }, push: true, disableCreateDatabase: true }),
      plugins: [poolPostgresPorRequisicao(atual)],
      collections: [
        { slug: 'users', auth: { useAPIKey: true }, fields: [{ name: 'escopo_fixture', type: 'text', required: true }] },
        { slug: 'provas_pool' as never, versions: { drafts: true },
          access: { read: ({ req }) => req.user ? { escopo: { equals: (req.user as any).escopo_fixture } } : false },
          fields: [{ name: 'titulo', type: 'text', required: true }, { name: 'escopo', type: 'text', required: true },
            { name: 'privado', type: 'text', access: { read: () => false } }],
          hooks: { afterChange: [({ doc }) => { if (doc.titulo === 'rollback') throw new Error('rollback deliberado da fixture'); return doc }] },
        },
      ],
    })
    payload = await roda(() => getPayload({ config, key: chave, disableOnInit: true }))
    await roda(() => payload.create({ collection: 'users', data: { email: 'pool@example.test', password: 'senha-fixture', enableAPIKey: true, apiKey: 'pool-fixture-a', escopo_fixture: 'a' } as never }))
    const cria = (escopo: string) => roda(() => payload.create({ collection: 'provas_pool' as never,
      data: { titulo: escopo, escopo, privado: 'valor-interno-fixture', _status: 'draft' } as never, depth: 0 }))
    ofertaA = await cria('a')
    ofertaB = await cria('b')
  })
  afterAll(async () => {
    if (payload) await roda(() => payload.destroy())
    if (criouBanco) await admin.query(`DROP DATABASE "${nomeBanco}"`)
    await admin?.end()
  })

  it('vinte endpoints autenticados concorrentes preservam isolamento, draft e campos privados', async () => {
    const respostas = await Promise.all(Array.from({ length: 20 }, () => request('/provas_pool?depth=0&draft=true')))
    expect(respostas.every(r => r.status === 200)).toBe(true)
    for (const r of respostas) {
      expect(r.body.docs.map((doc: any) => doc.id)).toEqual([ofertaA.id])
      expect(r.body.docs[0]._status).toBe('draft')
      expect(r.body.docs[0]).not.toHaveProperty('privado')
    }
    expect((await request('/provas_pool/' + ofertaB.id)).status).toBe(404)
  })

  it('transação que falha não deixa documento; novo POST/GET seguem funcionando', async () => {
    expect((await request('/provas_pool', 'POST', { titulo: 'rollback', escopo: 'a', _status: 'draft' })).status).toBe(500)
    expect((await request('/provas_pool?where[titulo][equals]=rollback')).body.totalDocs).toBe(0)
    const r = await request('/provas_pool', 'POST', { titulo: 'depois', escopo: 'a', _status: 'draft' })
    expect(r.status).toBe(201)
    expect((await request('/provas_pool/' + r.body.doc.id)).status).toBe(200)
  })

  it('bootstrap, leituras e transações não deixam sockets emprestados', async () => {
    const { rows } = await admin.query('SELECT count(*)::int AS total FROM pg_stat_activity WHERE application_name = $1', [nomeAplicacao])
    expect(rows[0].total).toBe(0)
  })

  it('adapter.connect com pool existente não reserva outro monitor nem perde isolamento', async () => {
    await roda(() => payload.db.connect!({ hotReload: true }))
    const leitura = await request('/provas_pool?depth=0&draft=true')
    expect(leitura.status).toBe(200)
    expect(leitura.body.docs.every((doc: any) => doc.escopo === 'a')).toBe(true)
    const { rows } = await admin.query('SELECT count(*)::int AS total FROM pg_stat_activity WHERE application_name = $1', [nomeAplicacao])
    expect(rows[0].total).toBe(0)
  })
})
