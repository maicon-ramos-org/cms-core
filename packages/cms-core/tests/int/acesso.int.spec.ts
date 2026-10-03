/**
 * Acesso pela REST real do Payload (handleEndpoints) sobre a config da fábrica e um banco
 * descartável: API keys de vários papéis, sessão de login (JWT) e anônimo. Nenhuma chave de
 * verdade; o banco é criado e apagado aqui. Pool por requisição (como num Worker): nenhuma
 * conexão sobra para impedir o DROP no fim.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { getPayload, handleEndpoints, type Payload, type SanitizedConfig } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cmsCore } from '../../src/fabrica'
import { poolPostgresPorRequisicao, type ContextoConexaoPostgres } from '../../src/db/pool-por-requisicao'

const require = createRequire(import.meta.url)
const { Pool } = require(require.resolve('pg', { paths: [dirname(require.resolve('@payloadcms/db-postgres'))] }))
const semBanco = !process.env.DATABASE_URL
it.runIf(semBanco && process.env.CI)('CI exige Postgres para provar o acesso pela REST', () => expect(process.env.DATABASE_URL).toBeTruthy())

const CHAVES = {
  admin: 'acesso-fixture-chave-admin',
  agente: 'acesso-fixture-chave-agente',
  sistema: 'acesso-fixture-chave-sistema',
  editor: 'acesso-fixture-chave-editor',
} as const
type Papel = keyof typeof CHAVES
const SENHA = 'senha-fixture-acesso'

describe.skipIf(semBanco)('acesso: users, mensagens, coleções internas e SVG (REST real, PG local)', () => {
  const nomeBanco = `cms_core_teste_acesso_${randomUUID().replaceAll('-', '')}`
  let admin: InstanceType<typeof Pool>, config: SanitizedConfig, payload: Payload, conexao: string
  let criado = false
  const contexto = new AsyncLocalStorage<ContextoConexaoPostgres>()
  const atual = () => { const c = contexto.getStore(); if (!c) throw new Error('Fixture fora de contexto'); return c }
  const roda = <T>(f: () => T) => contexto.run({ identidade: {}, connectionString: conexao }, f)
  let tenant: { id: number }
  const ids = {} as Record<Papel, number>
  const jwt = {} as Record<'admin' | 'editor', string>

  type Credencial = { chave?: Papel; jwt?: 'admin' | 'editor' }
  const pede = async (path: string, cred: Credencial = {}, method = 'GET', body?: unknown) => {
    const headers = new Headers()
    if (cred.chave) headers.set('authorization', `users API-Key ${CHAVES[cred.chave]}`)
    if (cred.jwt) headers.set('authorization', `JWT ${jwt[cred.jwt]}`)
    let corpo: BodyInit | undefined
    if (body instanceof FormData) corpo = body
    else if (body !== undefined) {
      headers.set('content-type', 'application/json')
      corpo = JSON.stringify(body)
    }
    const r = await roda(() => handleEndpoints({ config, request: new Request('http://fixture.test/api' + path, { method, headers, body: corpo }) }))
    const texto = await r.text()
    let json: any = {}
    try { json = JSON.parse(texto) } catch { /* corpo não-JSON */ }
    return { status: r.status, texto, json }
  }
  /** Nenhuma chave de OUTRO usuário, nem `apiKeyIndex`, no corpo da resposta. */
  const semChaveAlheia = (texto: string, propria?: Papel) =>
    !Object.entries(CHAVES).some(([papel, k]) => papel !== propria && texto.includes(k)) && !texto.includes('apiKeyIndex')

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Fixture de acesso exige PostgreSQL loopback.')
    admin = new Pool({ connectionString: url.toString(), max: 1 })
    await admin.query(`CREATE DATABASE "${nomeBanco}"`)
    criado = true
    url.pathname = '/' + nomeBanco
    conexao = url.toString()
    vi.stubEnv('PAYLOAD_DB_PUSH', '1')
    vi.stubEnv('PAYLOAD_SECRET', 'acesso-fixture-sem-segredo-real')
    vi.stubEnv('REVALIDATE_URL', '')
    config = await cmsCore({ raiz: '/tmp/acesso-fixture-config', sharp: null,
      db: { connectionString: conexao, maxUses: 1 }, logger: { options: { level: 'silent' } },
      midia: { r2: { bucket: 'fixture', endpoint: 'https://bucket.invalid', publicBase: 'https://media.invalid',
        credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' } } },
      plugins: [(c) => ({ ...c, typescript: { ...c.typescript, autoGenerate: false } }), poolPostgresPorRequisicao(atual)],
    })
    payload = await roda(() => getPayload({ config, key: nomeBanco, disableOnInit: true }))
    tenant = await roda(() => payload.create({ collection: 'tenants', data: { nome: 'Tenant fixture', slug: 'acesso-fixture', canonical_host: 'acesso.fixture.test' } as never })) as never
    const roles: Record<Papel, string> = { admin: 'super-admin', agente: 'agente', sistema: 'sistema', editor: 'editor' }
    for (const papel of Object.keys(CHAVES) as Papel[]) {
      const u = await roda(() => payload.create({ collection: 'users', data: { nome: papel, email: `${papel}@fixture.test`, password: SENHA,
        roles: [roles[papel]], tenants: [{ tenant: tenant.id }], enableAPIKey: true, apiKey: CHAVES[papel] } as never }))
      ids[papel] = u.id as number
    }
    for (const papel of ['admin', 'editor'] as const) {
      const login = await roda(() => payload.login({ collection: 'users', data: { email: `${papel}@fixture.test`, password: SENHA } }))
      if (!login.token) throw new Error('Fixture não gerou sessão.')
      jwt[papel] = login.token
    }
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

  describe('users', () => {
    it.each(['agente', 'sistema', 'editor'] as const)('chave de %s: lista só a si mesma, sem a chave de outro usuário', async (papel) => {
      const lista = await pede('/users?depth=0&limit=100', { chave: papel })
      expect(lista.status).toBe(200)
      expect(lista.json.docs.map((d: any) => d.email)).toEqual([`${papel}@fixture.test`])
      expect(semChaveAlheia(lista.texto, papel)).toBe(true)
      const doAdmin = await pede(`/users/${ids.admin}?depth=0`, { chave: papel })
      expect(doAdmin.status).toBe(404)
      expect(doAdmin.texto).not.toContain('admin@fixture.test')
      const me = await pede('/users/me', { chave: papel })
      expect(me.status).toBe(200)
      expect(me.json.user.email).toBe(`${papel}@fixture.test`)
      expect(semChaveAlheia(me.texto, papel)).toBe(true)
    })

    it('super-admin (sessão) lista todos; nem ele recebe apiKeyIndex', async () => {
      const todos = await pede('/users?depth=0&limit=100', { jwt: 'admin' })
      expect(todos.status).toBe(200)
      expect(todos.json.totalDocs).toBe(4)
      expect(todos.texto).not.toContain('apiKeyIndex')
      // o /admin precisa ler a chave do usuário de serviço para não gerar outra ao salvar
      expect(todos.json.docs.find((d: any) => d.id === ids.agente).apiKey).toBe(CHAVES.agente)
    })

    it('editor em sessão não lê a chave de outro usuário', async () => {
      const lista = await pede('/users?depth=0&limit=100', { jwt: 'editor' })
      expect(lista.json.docs.map((d: any) => d.email)).toEqual(['editor@fixture.test'])
      expect(semChaveAlheia(lista.texto, 'editor')).toBe(true)
    })

    it('chave vazada não grava senha no próprio usuário (não vira acesso ao /admin)', async () => {
      const r = await pede(`/users/${ids.agente}`, { chave: 'agente' }, 'PATCH', { password: 'senha-de-invasor-123' })
      expect(r.status).toBe(403)
      const login = await pede('/users/login', {}, 'POST', { email: 'agente@fixture.test', password: 'senha-de-invasor-123' })
      expect(login.status).toBe(401)
      expect((await pede(`/users/${ids.agente}`, { chave: 'agente' }, 'PATCH', { email: 'outro@fixture.test' })).status).toBe(403)
      expect((await pede(`/users/${ids.agente}`, { chave: 'agente' }, 'PATCH', { nome: 'renomeado' })).status).toBe(403)
    })

    it('nem a chave do super-admin troca senha ou e-mail; o resto da administração continua', async () => {
      expect((await pede(`/users/${ids.editor}`, { chave: 'admin' }, 'PATCH', { password: 'senha-de-invasor-123' })).status).toBe(403)
      expect((await pede(`/users/${ids.admin}`, { chave: 'admin' }, 'PATCH', { password: 'senha-de-invasor-123' })).status).toBe(403)
      expect((await pede(`/users/${ids.editor}`, { chave: 'admin' }, 'PATCH', { email: 'trocado@fixture.test' })).status).toBe(403)
      const ok = await pede(`/users/${ids.editor}`, { chave: 'admin' }, 'PATCH', { nome: 'Editor renomeado' })
      expect(ok.status).toBe(200)
      expect((await pede('/users/login', {}, 'POST', { email: 'editor@fixture.test', password: SENHA })).status).toBe(200)
    })

    it('em sessão de login, o usuário edita a si mesmo (e só a si mesmo)', async () => {
      expect((await pede(`/users/${ids.editor}`, { jwt: 'editor' }, 'PATCH', { nome: 'Editor' })).status).toBe(200)
      expect((await pede(`/users/${ids.agente}`, { jwt: 'editor' }, 'PATCH', { nome: 'x' })).status).toBe(403)
    })
  })

  describe('mensagens', () => {
    const mensagem = () => ({ tenant: tenant.id, nome: 'Pessoa', email: 'pessoa@exemplo.test', mensagem: 'olá', ip_hash: 'hash-fixture', user_agent: 'ua', origem_url: '/contato/' })

    it('criação anônima é recusada; a chave do servidor do site cria, sem receber o dado pessoal de volta', async () => {
      expect((await pede('/mensagens', {}, 'POST', mensagem())).status).toBe(403)
      expect((await pede('/mensagens', { chave: 'agente' }, 'POST', mensagem())).status).toBe(403)
      const doSite = await pede('/mensagens', { chave: 'sistema' }, 'POST', mensagem())
      expect(doSite.status).toBe(201)
      expect(doSite.texto).not.toContain('pessoa@exemplo.test')
    })

    it('o servidor do site conta por ip_hash sem ver campos pessoais; agente não lê', async () => {
      const q = `where[and][0][tenant][equals]=${tenant.id}&where[and][1][ip_hash][equals]=hash-fixture`
      const conta = await pede(`/mensagens?${q}&limit=0`, { chave: 'sistema' })
      expect(conta.status).toBe(200)
      expect(conta.json.totalDocs).toBeGreaterThanOrEqual(1)
      const docs = (await pede(`/mensagens?${q}`, { chave: 'sistema' })).json.docs
      for (const campo of ['nome', 'email', 'mensagem', 'user_agent', 'origem_url']) {
        expect(docs.some((d: any) => campo in d), campo).toBe(false)
      }
      expect((await pede('/mensagens', { chave: 'agente' })).status).toBe(403)
    })

    it('editor lê com os campos pessoais e marca como lida; o servidor do site não edita', async () => {
      const lista = await pede('/mensagens?depth=0', { jwt: 'editor' })
      expect(lista.status).toBe(200)
      const doc = lista.json.docs[0]
      expect(doc.email).toBe('pessoa@exemplo.test')
      expect((await pede(`/mensagens/${doc.id}`, { jwt: 'editor' }, 'PATCH', { lida: true })).status).toBe(200)
      expect((await pede(`/mensagens/${doc.id}`, { chave: 'sistema' }, 'PATCH', { lida: false })).status).toBe(403)
    })
  })

  describe('coleções internas do Payload', () => {
    it('API key não cria trava de documento (nem em nome de outro usuário)', async () => {
      const post = await roda(() => payload.create({ collection: 'tags', data: { tenant: tenant.id, nome: 'Trava', slug: 'trava' } as never }))
      const emNomeDoAdmin = { document: { relationTo: 'tags', value: post.id }, user: { relationTo: 'users', value: ids.admin } }
      for (const papel of ['sistema', 'agente', 'admin'] as const) {
        expect((await pede('/payload-locked-documents', { chave: papel }, 'POST', emNomeDoAdmin)).status, papel).toBe(403)
      }
      // a REST do /admin (sessão) cria, mas sempre em nome próprio
      const pedeOutro = { document: { relationTo: 'tags', value: post.id }, user: { relationTo: 'users', value: ids.agente } }
      const daSessao = await pede('/payload-locked-documents?depth=0', { jwt: 'editor' }, 'POST', pedeOutro)
      expect(daSessao.status).toBe(201)
      const dono = daSessao.json.doc.user
      expect(typeof dono === 'object' ? dono.value ?? dono.id : dono).toBe(ids.editor)
      // o agente não solta a trava de quem está editando
      expect((await pede(`/payload-locked-documents/${daSessao.json.doc.id}`, { chave: 'agente' }, 'DELETE')).status).toBe(403)
      expect((await pede(`/payload-locked-documents/${daSessao.json.doc.id}`, { jwt: 'editor' }, 'DELETE')).status).toBe(200)
    })

    // a rota `/:key` do Payload grava sempre na preferência do próprio usuário (upsert pelo banco)
    it('API key não grava preferência pela REST padrão; a sessão continua gravando', async () => {
      expect((await pede('/payload-preferences', { chave: 'sistema' }, 'POST', { key: 'fixture', value: 1 })).status).toBe(403)
      expect((await pede('/payload-preferences/fixture', { jwt: 'editor' }, 'POST', { value: 1 })).status).toBe(200)
    })
  })

  describe('mídia', () => {
    it('SVG com script de namespace é recusado (400) antes de chegar ao bucket', async () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/2000/svg"><h:script>fetch("/x")</h:script></svg>'
      const form = new FormData()
      form.set('file', new Blob([svg], { type: 'image/svg+xml' }), 'prova-xss.svg')
      form.set('_payload', JSON.stringify({ alt: 'prova', tenant: tenant.id }))
      const r = await pede('/midia', { chave: 'agente' }, 'POST', form)
      expect(r.status).toBe(400)
      expect(r.texto).toContain('SVG com script')
    })
  })
})
