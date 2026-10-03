/**
 * Pool por requisição com UMA conexão (o que o Hyperdrive dá por shard): escrita pela REST real
 * não pode precisar de duas conexões ao mesmo tempo. Antes, `uniquePorTenant`, `slugDeRelacao`
 * e o `checkDocumentLockStatus` do Payload consultavam sem `req`, fora da transação, e esperavam
 * uma vaga que só abriria no COMMIT — aqui, `connectionTimeoutMillis` curto transforma essa
 * espera em erro (500), em vez de pendurar o teste.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { getPayload, handleEndpoints, type Payload, type Plugin, type SanitizedConfig } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cmsCore } from '../../src/fabrica'
import { poolPostgresPorRequisicao, type ContextoConexaoPostgres } from '../../src/db/pool-por-requisicao'

const require = createRequire(import.meta.url)
const { Pool } = require(require.resolve('pg', { paths: [dirname(require.resolve('@payloadcms/db-postgres'))] }))
const semBanco = !process.env.DATABASE_URL
it.runIf(semBanco && process.env.CI)('CI exige Postgres para provar o pool de uma conexão', () => expect(process.env.DATABASE_URL).toBeTruthy())

// super-admin: o núcleo reserva o DELETE de conteúdo a ele
const CHAVE = 'pool-uma-conexao-fixture-admin'

describe.skipIf(semBanco)('pool por requisição com max 1: create/update/delete pela REST não travam', () => {
  const id = randomUUID().replaceAll('-', '')
  const nomeBanco = `cms_core_teste_pool1_${id}`
  const nomeAplicacao = `pool1-${id}`
  const contexto = new AsyncLocalStorage<ContextoConexaoPostgres>()
  const atual = () => { const c = contexto.getStore(); if (!c) throw new Error('Fixture fora de contexto'); return c }
  let admin: InstanceType<typeof Pool>, config: SanitizedConfig, payload: Payload, conexao: string
  let criado = false
  let tenant: { id: number }
  const roda = <T>(f: () => T) => contexto.run({ identidade: {}, connectionString: conexao }, f)
  const pede = (path: string, method = 'GET', body?: unknown) => roda(async () => {
    const r = await handleEndpoints({ config, request: new Request('http://fixture.test/api' + path, { method,
      headers: { authorization: `users API-Key ${CHAVE}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) })
    return { status: r.status, json: await r.json() as any }
  })

  /** Uma conexão por Pool, e a espera por outra vira erro em 2 s (o FATAL do Hyperdrive, em miniatura). */
  const umaConexao: Plugin = (c) => {
    const banco = c.db!
    return { ...c, db: { ...banco, init: (args) => {
      const adapter = banco.init(args) as PostgresAdapter
      adapter.poolOptions = { ...adapter.poolOptions, max: 1, connectionTimeoutMillis: 2000, application_name: nomeAplicacao }
      return adapter
    } } }
  }

  /** Hook de terceiro que consulta SEM `req` no meio da escrita: o pool tem que aguentar. */
  const colecaoComHookSemReq: Plugin = (c) => ({ ...c, collections: [...(c.collections ?? []), {
    slug: 'provas_sem_req',
    access: { create: () => true, read: () => true, update: () => true, delete: () => true },
    fields: [{ name: 'titulo', type: 'text', required: true }],
    hooks: {
      beforeValidate: [async ({ data, req }) => {
        await req.payload.find({ collection: 'tags', limit: 1, depth: 0, overrideAccess: true })
        return data
      }],
      afterChange: [async ({ doc, req }) => {
        await req.payload.count({ collection: 'tags', overrideAccess: true })
        return doc
      }],
    },
  }] })

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Fixture do pool exige PostgreSQL loopback.')
    admin = new Pool({ connectionString: url.toString(), max: 1 })
    await admin.query(`CREATE DATABASE "${nomeBanco}"`)
    criado = true
    url.pathname = '/' + nomeBanco
    conexao = url.toString()
    vi.stubEnv('PAYLOAD_DB_PUSH', '1')
    vi.stubEnv('PAYLOAD_SECRET', 'pool1-fixture-sem-segredo-real')
    vi.stubEnv('REVALIDATE_URL', '')
    config = await cmsCore({ raiz: '/tmp/pool1-fixture-config', sharp: null,
      db: { connectionString: conexao, maxUses: 1 }, logger: { options: { level: 'silent' } },
      midia: { r2: { bucket: 'fixture', endpoint: 'https://bucket.invalid', publicBase: 'https://media.invalid',
        credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' } } },
      plugins: [(c) => ({ ...c, typescript: { ...c.typescript, autoGenerate: false } }), colecaoComHookSemReq,
        umaConexao, poolPostgresPorRequisicao(atual)],
    })
    payload = await roda(() => getPayload({ config, key: nomeBanco, disableOnInit: true }))
    tenant = await roda(() => payload.create({ collection: 'tenants', data: { nome: 'Tenant fixture', slug: 'pool1-fixture', canonical_host: 'pool1.fixture.test' } as never })) as never
    await roda(() => payload.create({ collection: 'users', data: { nome: 'Admin', email: 'admin@pool1.test', password: 'senha-fixture-pool1',
      roles: ['super-admin'], tenants: [{ tenant: tenant.id }], enableAPIKey: true, apiKey: CHAVE } as never }))
  }, 120_000)

  afterAll(async () => {
    if (payload) await roda(() => payload.destroy())
    if (criado) {
      const { rows } = await admin.query('SELECT count(*)::int AS total FROM pg_stat_activity WHERE datname = $1', [nomeBanco])
      expect(rows[0].total).toBe(0)
      await admin.query(`DROP DATABASE "${nomeBanco}"`)
    }
    await admin?.end()
    vi.unstubAllEnvs()
  })

  it('tags: create (uniquePorTenant + revalidação), update (trava do Payload) e delete', async () => {
    const criada = await pede('/tags?depth=0', 'POST', { tenant: tenant.id, nome: 'Uma conexão', slug: 'uma-conexao' })
    expect(criada.status).toBe(201)
    const tagId = criada.json.doc.id
    const repetida = await pede('/tags?depth=0', 'POST', { tenant: tenant.id, nome: 'Repetida', slug: 'uma-conexao' })
    expect(repetida.status).toBe(400)
    const mudada = await pede(`/tags/${tagId}?depth=0`, 'PATCH', { nome: 'Uma conexão só' })
    expect(mudada.status).toBe(200)
    expect(mudada.json.doc.nome).toBe('Uma conexão só')
    expect((await pede(`/tags/${tagId}`, 'DELETE')).status).toBe(200)
    expect((await pede(`/tags/${tagId}`)).status).toBe(404)
  }, 30_000)

  it('posts e páginas: create/update/delete, com hooks do núcleo que consultam outras coleções', async () => {
    const corpo = { root: { type: 'root', format: '', indent: 0, version: 1, direction: null, children: [
      { type: 'paragraph', format: '', indent: 0, version: 1, direction: null, textFormat: 0,
        children: [{ type: 'text', text: 'prova', format: 0, detail: 0, mode: 'normal', style: '', version: 1 }] }] } }
    const post = await pede('/posts?depth=0', 'POST', { tenant: tenant.id, titulo: 'Prova', slug: 'prova-pool', corpo, _status: 'draft' })
    expect(post.status).toBe(201)
    expect((await pede(`/posts/${post.json.doc.id}?depth=0`, 'PATCH', { titulo: 'Prova 2' })).status).toBe(200)
    expect((await pede(`/posts/${post.json.doc.id}`, 'DELETE')).status).toBe(200)
  }, 30_000)

  it('hook de terceiro sem req (find no beforeValidate, count no afterChange) não trava a escrita', async () => {
    const criada = await pede('/provas_sem_req', 'POST', { tenant: tenant.id, titulo: 'sem req' })
    expect(criada.status).toBe(201)
    expect((await pede(`/provas_sem_req/${criada.json.doc.id}`, 'PATCH', { titulo: 'sem req 2' })).status).toBe(200)
    expect((await pede(`/provas_sem_req/${criada.json.doc.id}`, 'DELETE')).status).toBe(200)
  }, 30_000)

  it('nenhuma conexão fica emprestada depois das escritas', async () => {
    await new Promise((r) => setTimeout(r, 100))
    const { rows } = await admin.query('SELECT count(*)::int AS total FROM pg_stat_activity WHERE application_name = $1', [nomeAplicacao])
    expect(rows[0].total).toBe(0)
  })
})
