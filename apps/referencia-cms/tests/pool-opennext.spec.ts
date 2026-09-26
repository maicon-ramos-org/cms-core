/** Prova opt-in de runtime: só banco loopback novo, build real e credencial sintética fixa. */
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { unstable_dev, type Unstable_DevWorker } from 'wrangler'

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
          PAYLOAD_DB_PUSH: '1', REVALIDATE_URL: '', NODE_ENV: 'test' },
      })
    } catch { throw new Error('Subprocesso de seed local falhou; nenhuma resposta de provedor é impressa.') }
    const linha = saida.split('\n').find(l => l.startsWith('FIXTURE_POOL='))
    if (!linha) throw new Error('Seed sem confirmação estruturada.')
    tenantA = JSON.parse(linha.slice('FIXTURE_POOL='.length)).tenantA
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
})
