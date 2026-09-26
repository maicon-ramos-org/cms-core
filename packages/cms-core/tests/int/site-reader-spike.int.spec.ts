/** Transporte/config/ACL sobre PG16 descartável; nunca usa instâncias reais. */
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { getPayload, handleEndpoints, type Payload, type SanitizedConfig } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cmsCore } from '../../src/fabrica'
import { poolPostgresPorRequisicao, type ContextoConexaoPostgres } from '../../src/db/pool-por-requisicao'
import { protegerTransporteSiteReader, leitorNoPreflightSiteReader } from '../../src/site-reader/transporte'
import { grafoEditorial } from '../../src/grafo'
import { afiliado } from '../../../afiliado/src/cms/plugin'

const require = createRequire(import.meta.url)
const { Pool } = require(require.resolve('pg', { paths: [dirname(require.resolve('@payloadcms/db-postgres'))] }))
const semBanco = !process.env.DATABASE_URL
it.runIf(semBanco && process.env.CI)('CI exige PG16 no spike reader', () => expect(process.env.DATABASE_URL).toBeTruthy())

describe.skipIf(semBanco)('spike site-reader: config real, API key, custo e revogação PG16', () => {
  const nomeBanco = `cms_core_reader_spike_${randomUUID().replaceAll('-', '')}`
  const contexto = new AsyncLocalStorage<ContextoConexaoPostgres>()
  const atual = () => { const c = contexto.getStore(); if (!c) throw new Error('Fixture fora de contexto'); return c }
  const roda = <T>(f: () => T) => contexto.run({ identidade: {}, connectionString: conexao }, f)
  let admin: InstanceType<typeof Pool>, conexao: string, config: SanitizedConfig, payload: Payload
  let criado = false, readerId: number | string, tenantId: number | string
  let leiturasUsers = 0
  let executouJob = 0
  const rest = (request: Request) => handleEndpoints({ config, request })
  const request = (path: string, credential?: 'reader' | 'editor', method = 'GET', headers?: HeadersInit, body?: string) => roda(async () => {
    const h = new Headers(headers)
    if (credential) h.set('authorization', `users API-Key reader-spike-${credential}-fixture`)
    const original = new Request('http://fixture.test/api' + path, { method, headers: h, ...(body === undefined ? {} : { body }) })
    return protegerTransporteSiteReader({ config, handler: rest, superficie: 'rest' })(original)
  })

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Spike exige PostgreSQL loopback.')
    admin = new Pool({ connectionString: url.toString(), max: 1 })
    await admin.query(`CREATE DATABASE "${nomeBanco}"`)
    criado = true
    url.pathname = '/' + nomeBanco
    conexao = url.toString()
    vi.stubEnv('PAYLOAD_DB_PUSH', '1')
    vi.stubEnv('PAYLOAD_SECRET', 'reader-spike-sem-segredo-real')
    vi.stubEnv('REVALIDATE_URL', '')
    config = await cmsCore({ raiz: '/tmp/reader-spike-config', sharp: null, siteReader: true,
      db: { connectionString: conexao, maxUses: 1 }, logger: { options: { level: 'silent' } },
      midia: { r2: { bucket: 'fixture', endpoint: 'https://bucket.invalid', publicBase: 'https://media.invalid', credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' } } },
      plugins: [afiliado(), grafoEditorial(), c => ({ ...c, typescript: { ...c.typescript, autoGenerate: false } }), poolPostgresPorRequisicao(atual)],
      jobs: { tasks: [{ slug: 'reader_canario', handler: async () => { executouJob++; return { output: {} } } }] },
    })
    payload = await roda(() => getPayload({ config, disableOnInit: true }))
    const tenant = await roda(() => payload.create({ collection: 'tenants', data: {
      nome: 'Tenant fixture', slug: 'reader-fixture', canonical_host: 'reader.fixture.test',
      tema: { cor_primaria: '#6F57D3', cor_fundo: '#ffffff' }, autolinker: { max_links_pagina: 3 }, seo: { title_pattern_loja: '{loja}' },
    } as never }))
    tenantId = tenant.id
    for (const role of ['reader', 'editor'] as const) {
      const u = await roda(() => payload.create({ collection: 'users', data: { nome: 'Fixture', email: `${role}@fixture.test`, password: 'senha-fixture',
        roles: [role === 'reader' ? 'site-reader' : 'editor'], tenants: [{ tenant: tenant.id }], enableAPIKey: true, apiKey: `reader-spike-${role}-fixture`,
      } as never }))
      if (role === 'reader') readerId = u.id
    }
    const find = payload.find.bind(payload)
    vi.spyOn(payload, 'find').mockImplementation((args: Parameters<Payload['find']>[0]) => {
      if (args.collection === 'users') leiturasUsers++
      return find(args)
    })
  }, 120_000)

  afterAll(async () => {
    vi.restoreAllMocks()
    if (payload) await roda(() => payload.destroy())
    if (criado) {
      const { rows } = await admin.query('SELECT count(*)::int AS total FROM pg_stat_activity WHERE datname=$1', [nomeBanco])
      expect(rows[0].total).toBe(0)
      await admin.query(`DROP DATABASE "${nomeBanco}"`)
    }
    await admin?.end()
    vi.unstubAllEnvs()
  })

  it('anônimo público mantém zero lookups Users; identity anônima também', async () => {
    const antes = leiturasUsers
    expect((await request('/midia')).status).toBe(200)
    expect((await request('/editorial/identity-v1')).status).toBe(401)
    expect(leiturasUsers - antes).toBe(0)
  })

  it('API key reader chega somente a DTO mínimo, com uma leitura Users, sem Users.read', async () => {
    const antes = leiturasUsers
    const r = await request('/editorial/identity-v1', 'reader')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ versao: 1, papel: 'site-reader', tenantId: String(tenantId) })
    expect(leiturasUsers - antes).toBe(1)
    expect(await roda(() => leitorNoPreflightSiteReader({ config, headers: new Headers({ authorization: 'users API-Key reader-spike-reader-fixture' }) }))).toBe(true)
  })

  it('reader não entra em users/me, drafts, versões, auditoria e jobs; mesmo sem wrapper REST', async () => {
    const paths = ['/users', '/users/me?depth=10&select[apiKey]=true', '/posts?draft=true', '/claims/versions', '/eventos', '/historico_desconto', '/payload-jobs/run?queue=diario']
    for (const path of paths) {
      expect((await request(path, 'reader')).status, path).toBe(403)
      const r = await roda(() => rest(new Request('http://fixture.test/api' + path, { headers: { authorization: 'users API-Key reader-spike-reader-fixture' } })))
      expect(r.status, 'sem wrapper: ' + path).toBe(403)
    }
  })

  it('mede custo de não-reader delegado: duas leituras Users, sem cache de identidade', async () => {
    const antes = leiturasUsers
    expect((await request('/midia', 'editor')).status).toBe(200)
    expect(leiturasUsers - antes).toBe(2)
  })

  it('job GET negado não executa tarefa nem altera fila/auditoria', async () => {
    const job = await roda(() => payload.jobs.queue({ task: 'reader_canario' as never, input: {}, queue: 'reader-spike' })) as unknown as { id: number | string }
    const busca = () => roda(() => payload.findByID({ collection: 'payload-jobs', id: job.id, depth: 0 }))
    const antes = await busca()
    const eventosAntes = await roda(() => payload.count({ collection: 'eventos' as never }))
    expect((await request('/payload-jobs/run?queue=reader-spike', 'reader')).status).toBe(403)
    const semWrapper = await roda(() => rest(new Request('http://fixture.test/api/payload-jobs/run?queue=reader-spike', { headers: { authorization: 'users API-Key reader-spike-reader-fixture' } })))
    expect(semWrapper.status).toBe(403)
    expect(executouJob).toBe(0)
    expect(await busca()).toEqual(antes)
    expect(await roda(() => payload.count({ collection: 'eventos' as never }))).toEqual(eventosAntes)
  })

  it.each(['super-admin', 'editor', 'agente', 'ingestao', 'sistema'])('não provisiona papel misto %s com reader', async role => {
    await expect(roda(() => payload.create({ collection: 'users', data: { nome: 'Inválido', email: `${role}-invalid@fixture.test`, password: 'senha-fixture',
      roles: ['site-reader', role], tenants: [{ tenant: tenantId }],
    } as never }))).rejects.toMatchObject({ status: 400, data: { errors: expect.arrayContaining([expect.objectContaining({ path: 'roles' })]) } })
  })

  it.each([null, [], [{ tenant: 1 }, { tenant: 1 }]].map(tenants => [tenants]))('PATCH administrativo preserva requisito tenant: %j', async tenants => {
    await expect(roda(() => payload.update({ collection: 'users', id: readerId, data: { tenants } as never })))
      .rejects.toMatchObject({ status: 400, data: { errors: expect.arrayContaining([expect.objectContaining({ path: 'tenants' })]) } })
  })

  it('reader não modifica a própria chave/papéis/tenant e não faz login por senha', async () => {
    for (const data of [{ roles: ['super-admin'] }, { tenants: [] }, { apiKey: 'nao-gravar-fixture' }, { email: 'nao-gravar@fixture.test' }, { password: 'nao-gravar-fixture' }]) {
      expect((await request(`/users/${readerId}`, 'reader', 'PATCH', { 'content-type': 'application/json' }, JSON.stringify(data))).status).toBe(403)
    }
    const login = await request('/users/login', undefined, 'POST', { 'content-type': 'application/json' }, JSON.stringify({ email: 'reader@fixture.test', password: 'senha-fixture' }))
    expect(login.status).toBe(403)
    expect(login.headers.has('set-cookie')).toBe(false)
  })

  it('sessão JWT anterior não vira reader privilegiado; cookie com espaço também é inspecionado', async () => {
    const user = await roda(() => payload.create({ collection: 'users', data: { nome: 'Sessão fixture', email: 'sessao@fixture.test', password: 'senha-fixture', roles: ['editor'], tenants: [{ tenant: tenantId }] } as never }))
    const login = await roda(() => payload.login({ collection: 'users', data: { email: 'sessao@fixture.test', password: 'senha-fixture' } }))
    if (!login.token) throw new Error('Fixture não gerou sessão.')
    await roda(() => payload.update({ collection: 'users', id: user.id, data: { roles: ['site-reader'] } as never }))
    // Token somente em memória; nunca entra em saída/diagnóstico de mock.
    for (const headers of [new Headers({ cookie: `payload-token =${login.token}` }), new Headers({ authorization: `Bearer ${login.token}` })]) {
      expect((await request('/editorial/identity-v1', undefined, 'GET', headers)).status).toBe(403)
      expect((await request('/users/me', undefined, 'GET', headers)).status).toBe(403)
      expect(await roda(() => leitorNoPreflightSiteReader({ config, headers }))).toBe(true)
      let executouResolver = 0
      const r = await roda(() => protegerTransporteSiteReader({ config, superficie: 'graphql', handler: async () => { executouResolver++; return new Response() } })(new Request('http://fixture.test/api/graphql', { method: 'POST', headers, body: '{' })))
      expect(r.status).toBe(403)
      expect(executouResolver).toBe(0)
    }
  })

  it('afterRead que apaga roles não transforma reader autenticado em usuário liberado', async () => {
    const users = payload.collections.users!.config
    const anteriores = users.hooks.afterRead
    users.hooks.afterRead = [...anteriores, ({ doc }) => {
      if (String(doc.id) === String(readerId)) delete doc.roles
      return doc
    }]
    try {
      expect((await request('/editorial/identity-v1', 'reader')).status).toBe(403)
      expect((await request('/midia', 'reader')).status).toBe(403)
      const h = new Headers({ authorization: 'users API-Key reader-spike-reader-fixture' })
      expect((await roda(() => rest(new Request('http://fixture.test/api/midia', { headers: h })))).status).toBe(403)
      expect(await roda(() => leitorNoPreflightSiteReader({ config, headers: h }))).toBe(true)
      let executouResolver = 0
      const r = await roda(() => protegerTransporteSiteReader({ config, superficie: 'graphql', handler: async () => { executouResolver++; return new Response() } })(new Request('http://fixture.test/api/graphql', { headers: h })))
      expect(r.status).toBe(403)
      expect(executouResolver).toBe(0)
    } finally { users.hooks.afterRead = anteriores }
  })

  it.each(['X-HTTP-Method-Override', 'X-Payload-HTTP-Method-Override'])('Request original rejeita %s antes da transformação/body/auth', async header => {
    const antes = leiturasUsers
    const r = await request('/editorial/identity-v1', 'reader', 'POST', { [header]: 'GET', 'content-type': 'application/json' }, '{')
    expect(r.status).toBe(405)
    expect(leiturasUsers).toBe(antes)
  })

  it('revogação administrativa da key é observada no próximo request', async () => {
    expect((await request('/editorial/identity-v1', 'reader')).status).toBe(200)
    await roda(() => payload.update({ collection: 'users', id: readerId, data: { enableAPIKey: false }, overrideAccess: true }))
    const antes = leiturasUsers
    expect((await request('/editorial/identity-v1', 'reader')).status).toBe(401)
    expect(leiturasUsers - antes).toBe(1)
  })
})
