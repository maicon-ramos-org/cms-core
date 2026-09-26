/** Prova opt-in de runtime: só banco loopback novo, build real e credencial sintética fixa. */
import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { unstable_dev, type Unstable_DevWorker } from 'wrangler'
import { VALORES_CLAIM, valorNoWire } from '../../../packages/cms-core/tests/fixtures/claims-valores'

const require = createRequire(import.meta.url)
const { Pool } = require(require.resolve('pg', { paths: [dirname(require.resolve('@payloadcms/db-postgres'))] }))
const ativo = process.env.TESTAR_POOL_OPENNEXT === '1'
it.runIf(process.env.CI && ativo)('prova obrigatória exige DATABASE_URL local', () => expect(process.env.DATABASE_URL).toBeTruthy())

describe.skipIf(!ativo)('Payload OpenNext gerado, pool por requisição e PG16', () => {
  const nomeBanco = `cms_core_pool_opennext_${randomUUID().replaceAll('-', '')}`
  const flags = ['CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV', 'CLOUDFLARE_INCLUDE_PROCESS_ENV'] as const
  let worker: Unstable_DevWorker, admin: InstanceType<typeof Pool>
  let criouBanco = false
  let tenantA: number | string
  let readerId: number | string
  let serverActionId: string
  let claims: Array<{ id: number; versao: number; nome: string }>
  const claimRequest = async (path: string, method = 'GET', body?: unknown) => {
    const r = await worker.fetch('/api' + path, { method,
      headers: { authorization: 'users API-Key claims-opennext-fixture-a', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: r.status, body: await r.json() as any }
  }
  const esperaSemConexoes = async () => {
    for (let i = 0; i < 100; i++) {
      const { rows } = await admin.query('SELECT count(*)::int AS total FROM pg_stat_activity WHERE datname = $1', [nomeBanco])
      if (rows[0].total === 0) return
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error('Fixture ainda tem conexão aberta após encerramento.')
  }

  beforeAll(async () => {
    const script = fileURLToPath(new URL('../.open-next/worker.js', import.meta.url))
    if (!existsSync(script)) throw new Error('Prova exige build OpenNext real antes de rodar.')
    // Nunca imprime o manifesto: ele também contém encryptionKey do build.
    const manifests = ['../.next/server/server-reference-manifest.json',
      '../.open-next/server-functions/default/apps/referencia-cms/.next/server/server-reference-manifest.json']
      .map(path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')))
    for (const manifest of manifests) {
      expect(Object.keys(manifest.edge)).toHaveLength(0)
      const actions = Object.entries(manifest.node) as Array<[string, { filename: string; exportedName: string }]>
      expect(actions).toHaveLength(2)
      expect(actions.filter(([, action]) => action.filename === 'app/(payload)/layout.tsx')).toHaveLength(1)
      expect(actions.filter(([, action]) => action.filename.endsWith('/@payloadcms/next/dist/layouts/Root/index.js'))).toHaveLength(1)
      expect(actions.every(([, action]) => action.exportedName === '$$RSC_SERVER_ACTION_0')).toBe(true)
    }
    expect(Object.keys(manifests[0].node)).toEqual(Object.keys(manifests[1].node))
    serverActionId = Object.entries(manifests[0].node).find(([, action]) => (action as { filename: string }).filename === 'app/(payload)/layout.tsx')![0]
    const banco = new URL(process.env.DATABASE_URL!)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(banco.hostname)) throw new Error('Prova exige PostgreSQL loopback isolado.')
    admin = new Pool({ connectionString: banco.toString(), max: 1 })
    await admin.query(`CREATE DATABASE "${nomeBanco}"`)
    criouBanco = true
    banco.pathname = '/' + nomeBanco
    for (const flag of flags) vi.stubEnv(flag, 'false')
    vi.stubEnv('CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE', banco.toString())
    // O Pool Node mantém um monitor emprestado: destroy não o fecha, end aguarda
    // sua devolução. O CLI encerra normalmente após writes aguardados; sem mexer
    // em internals de pg ou usar pg_terminate_backend na prova.
    let saida: string
    try {
      saida = execFileSync(process.execPath, [require.resolve('tsx/cli'), fileURLToPath(new URL('./fixtures/seed-pool.ts', import.meta.url))], {
        encoding: 'utf8', timeout: 60_000, env: { PATH: process.env.PATH,
          DATABASE_URL: banco.toString(), PAYLOAD_SECRET: 'fixture-pool-sem-segredo-real',
          PAYLOAD_DB_PUSH: '1', REVALIDATE_URL: '', NODE_ENV: 'test', TESTAR_SITE_READER: '1' },
      })
    } catch { throw new Error('Subprocesso de seed local falhou; nenhuma resposta de provedor é impressa.') }
    const linha = saida.split('\n').find(l => l.startsWith('FIXTURE_POOL='))
    if (!linha) throw new Error('Seed sem confirmação estruturada.')
    const fixture = JSON.parse(linha.slice('FIXTURE_POOL='.length))
    tenantA = fixture.tenantA
    readerId = fixture.readerId
    claims = fixture.claims
    expect(typeof tenantA).toBe('number')
    await esperaSemConexoes()
    worker = await unstable_dev(script, {
      config: fileURLToPath(new URL('./fixtures/pool-opennext.wrangler.jsonc', import.meta.url)),
      local: true, ip: '127.0.0.1', port: 0, inspectorPort: 0, persist: false,
      logLevel: 'error', experimental: { forceLocal: true, disableExperimentalWarning: true, disableDevRegistry: true, watch: false },
    })
  }, 120_000)
  afterAll(async () => {
    try {
      await worker?.stop()
      if (criouBanco) { await esperaSemConexoes(); await admin.query(`DROP DATABASE "${nomeBanco}"`) }
    } finally { await admin?.end(); vi.unstubAllEnvs() }
  })

  it('20 GETs cold e 20 warm autenticados não penduram nem cruzam tenant', async () => {
    for (let rodada = 0; rodada < 2; rodada++) {
      const respostas = await Promise.all(Array.from({ length: 20 }, async () => {
        const r = await worker.fetch('/api/tenants?limit=2&depth=0', { headers: { authorization: 'users API-Key pool-opennext-fixture-a' } })
        const texto = await r.text()
        let corpo: { docs?: Array<{ id: number | string }> } = {}
        try { corpo = JSON.parse(texto) } catch { /* relatório não imprime corpo do provedor */ }
        return { status: r.status, ids: corpo.docs?.map(doc => doc.id) }
      }))
      expect(respostas).toEqual(Array(20).fill({ status: 200, ids: [tenantA] }))
    }
  }, 60_000)

  it('credencial fixa autentica a identidade esperada, não leitura anônima', async () => {
    const r = await worker.fetch('/api/users/me', { headers: { authorization: 'users API-Key pool-opennext-fixture-a' } })
    expect(r.status).toBe(200)
    const corpo = await r.json() as { user?: { email: string } }
    expect(corpo.user?.email).toBe('pool@fixture.test')
  })

  it.each(VALORES_CLAIM)('claims JSON %s: Node → GET/PATCH/versions/restore no OpenNext real', async (nome, valor) => {
    const doc = claims.find(c => c.nome === nome)!
    expect((await claimRequest(`/claims/${doc.id}`)).body.valor).toEqual(valor)
    expect((await claimRequest(`/claims/versions/${doc.versao}`)).body.version.valor).toEqual(valor)
    const patch = await claimRequest(`/claims/${doc.id}`, 'PATCH', { texto: 'Alteração sem valor no Worker' })
    expect(patch.status).toBe(200)
    expect(patch.body.doc.valor).toEqual(valor)
    expect(patch.body.doc.outro_json).toEqual({ texto: '12', numero: 12 })
    const versoes = await claimRequest(`/claims/versions?where[parent][equals]=${doc.id}&sort=-updatedAt`)
    expect(versoes.body.docs).toHaveLength(2)
    expect(versoes.body.docs.every((v: any) => JSON.stringify(v.version.valor) === JSON.stringify(valor))).toBe(true)
    expect((await claimRequest(`/claims/${doc.id}`, 'PATCH', { valor: valorNoWire('Diferente no Worker') })).status).toBe(200)
    const restaurada = await claimRequest(`/claims/versions/${doc.versao}`, 'POST')
    expect(restaurada.status).toBe(200)
    expect(restaurada.body.valor).toEqual(valor)
    expect(restaurada.body.outro_json).toEqual({ texto: '12', numero: 12 })
    expect(restaurada.body.texto).toBe('Texto inicial')
    expect((await claimRequest(`/claims/${doc.id}`)).body.valor).toEqual(valor)
    const invalida = await claimRequest(`/claims/${doc.id}`, 'PATCH', { valor: '12%' })
    expect(invalida.status).toBe(400)
    expect(invalida.body.errors.flatMap((e: any) => e.data?.errors ?? [])).toContainEqual(expect.objectContaining({ path: 'valor' }))
  })

  it('reader no OpenNext real: identidade mínima e bloqueio de REST/GraphQL/admin', async () => {
    const headers = { authorization: 'users API-Key reader-opennext-fixture-a' }
    const identity = await worker.fetch('/api/editorial/identity-v1', { headers })
    expect(identity.status).toBe(200)
    expect(await identity.json()).toEqual({ versao: 1, papel: 'site-reader', tenantId: String(tenantA) })
    expect(identity.headers.get('cache-control')).toBe('private, no-store')
    expect(identity.headers.has('set-cookie')).toBe(false)
    for (const path of ['/api/users/me?select[apiKey]=true&depth=10', '/api/claims?draft=true', '/api/claims/versions', '/api/payload-jobs/run?queue=diario', '/api/graphql-playground']) {
      expect((await worker.fetch(path, { headers })).status, path).toBe(403)
    }
    expect((await worker.fetch('/api/graphql', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{' })).status).toBe(403)
    for (const path of ['/admin', '/admin/login']) expect((await worker.fetch(path, { headers, redirect: 'manual' })).status, path).toBe(404)
  })

  it.each(['X-HTTP-Method-Override', 'X-Payload-HTTP-Method-Override'])('Next/workerd mantém Request original: %s não vira GET', async header => {
    const r = await worker.fetch('/api/editorial/identity-v1', { method: 'POST',
      headers: { authorization: 'users API-Key reader-opennext-fixture-a', [header]: 'GET', 'content-type': 'application/json' }, body: '{' })
    expect(r.status).toBe(405)
    expect(r.headers.get('allow')).toBe('GET')
  })

  it('action HTTP real executa slugify para admin, mas reader não alcança handleServerFunctions', async () => {
    const origin = `http://${worker.address}:${worker.port}`
    const call = async (key: string) => {
      const response = await worker.fetch(origin + '/admin', { method: 'POST', headers: {
        authorization: `users API-Key ${key}`, origin, 'Next-Action': serverActionId,
        'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component',
      }, body: JSON.stringify([{ name: 'slugify', args: { collectionSlug: 'posts', path: 'slug', valueToSlugify: 'Fixture Action Guard', data: {} } }]) })
      // Somente status/presença do resultado são comparados; Flight pode conter dados privados.
      return { status: response.status, executou: (await response.text()).includes('fixture-action-guard') }
    }
    expect(await call('reader-admin-opennext-fixture')).toEqual({ status: 200, executou: true })
    expect(await call('reader-opennext-fixture-a')).toEqual({ status: 404, executou: false })
  })

  it('única action upstream permitida conserva corpo estrito de cookie de idioma, sem auth/Payload/CRUD', () => {
    const source = readFileSync(resolve(dirname(require.resolve('@payloadcms/next/layouts')), '../layouts/Root/index.js'), 'utf8')
    expect(source).toContain("import { cookies as nextCookies } from 'next/headers.js';")
    const body = source.match(/async function switchLanguageServerAction\(lang\) \{([\s\S]*?)\n  \}/)?.[1]
    expect(body?.replace(/\s+/g, ' ').trim()).toBe("'use server'; const cookies = await nextCookies(); cookies.set({ name: `${config.cookiePrefix || 'payload'}-lng`, maxAge: 60 * 60 * 24 * 365, path: '/', value: lang });")
    // RootProvider recebe a função independentemente de req.user, inclusive no login anônimo.
    expect(source).toContain('switchLanguageServerAction: switchLanguageServerAction,')
  })

  it('login anônimo entrega a referência da action de idioma, que não é privilégio do reader', async () => {
    const response = await worker.fetch('/admin/login')
    expect(response.status).toBe(200)
    const body = await response.text()
    // Não imprime HTML/Flight nem o argumento bound criptografado.
    expect(body.includes('switchLanguageServerAction')).toBe(true)
  })

  it('Worker observa revogação no request seguinte, sem cache global de principal', async () => {
    const r = await worker.fetch(`/api/users/${readerId}`, { method: 'PATCH', headers: { authorization: 'users API-Key reader-admin-opennext-fixture', 'content-type': 'application/json' }, body: JSON.stringify({ enableAPIKey: false }) })
    expect(r.status).toBe(200)
    const invalid = await worker.fetch('/api/editorial/identity-v1', { headers: { authorization: 'users API-Key reader-opennext-fixture-a' } })
    expect(invalid.status).toBe(401)
  })
})
