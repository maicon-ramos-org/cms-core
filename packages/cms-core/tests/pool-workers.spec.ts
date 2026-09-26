import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { build } from 'esbuild'
import { convertV4MiniflareOptions, Log, LogLevel, Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const driver = require.resolve('pg', { paths: [dirname(require.resolve('@payloadcms/db-postgres'))] })
const { Pool } = require(driver)
const semBanco = !process.env.DATABASE_URL
it.runIf(semBanco && process.env.CI)('CI exige banco para prova do pool no workerd', () => expect(process.env.DATABASE_URL).toBeTruthy())

describe.skipIf(semBanco)('Pool do CMS no workerd real e Postgres local', () => {
  let runtime: Miniflare
  let observador: InstanceType<typeof Pool>
  const nome = `pool-worker-${randomUUID()}`
  const pede = async (path: string) => {
    const r = await runtime.dispatchFetch('https://fixture.test' + path)
    return { status: r.status, corpo: await r.text() }
  }
  const semConexoes = async () => {
    for (let i = 0; i < 50; i++) {
      const { rows } = await observador.query('SELECT count(*)::int AS total FROM pg_stat_activity WHERE application_name = $1', [nome])
      if (rows[0].total === 0) return
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error('Socket da fixture permaneceu no banco após terminar request')
  }

  beforeAll(async () => {
    const banco = new URL(process.env.DATABASE_URL!)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(banco.hostname)) throw new Error('Prova workerd exige banco local descartável.')
    observador = new Pool({ connectionString: banco.toString(), max: 1 })
    const bundle = await build({
      entryPoints: [fileURLToPath(new URL('./fixtures/pool-worker.mjs', import.meta.url))],
      bundle: true, write: false, platform: 'node', format: 'esm', target: 'es2022',
      conditions: ['workerd'], alias: { pg: driver }, external: ['cloudflare:sockets', 'pg-native'],
      banner: { js: 'import { createRequire } from "node:module"; const require = createRequire("/fixture.js");' },
    })
    runtime = new Miniflare(convertV4MiniflareOptions({ cf: false, log: new Log(LogLevel.ERROR), workers: [{
      name: 'pool-por-requisicao', compatibilityDate: '2026-08-04', compatibilityFlags: ['nodejs_compat'],
      modules: [{ type: 'ESModule', path: 'fixture.js', contents: bundle.outputFiles[0]!.text }],
      hyperdrives: { HYPERDRIVE: banco.toString() }, bindings: { PROBE_NAME: nome },
    }] }))
  })
  afterAll(async () => { await runtime?.dispose(); await observador?.end() })

  it('reproduz a falha de fila global mesmo com maxUses=1; sequencial passa', async () => {
    expect((await pede('/global')).status).toBe(200)
    const respostas = await Promise.all(Array.from({ length: 20 }, () => pede('/global')))
    expect(respostas.some(r => r.status === 500 && r.corpo.includes('hung and would never generate a response'))).toBe(true)
    await semConexoes()
  })

  it.each(['/query', '/transaction', '/rollback', '/callback', '/error'])('%s: vinte requests concorrentes passam e liberam clientes', async path => {
    const respostas = await Promise.all(Array.from({ length: 20 }, () => pede(path)))
    expect(respostas.map(r => r.status)).toEqual(Array(20).fill(200))
    expect(respostas.every(r => JSON.parse(r.corpo).waiting === 0)).toBe(true)
    await semConexoes()
  })

  it('fila dentro do mesmo request funciona; end não encerra o pool vizinho', async () => {
    expect((await pede('/batch')).status).toBe(200)
    const [fim, vizinho] = await Promise.all([pede('/end'), pede('/query')])
    expect(JSON.parse(fim.corpo).recusou).toBe(true)
    expect(vizinho.status).toBe(200)
    expect((await pede('/query')).status).toBe(200)
    await semConexoes()
  })

  it('bootstrap não retém cliente; EOF fecha cliente abandonado; waitUntil conclui consulta', async () => {
    expect(JSON.parse((await pede('/bootstrap')).corpo)).toEqual({ total: 0, waiting: 0 })
    await semConexoes()
    expect((await pede('/abandonado')).status).toBe(200)
    await semConexoes()
    expect((await pede('/background')).status).toBe(200)
    for (let i = 0; i < 50; i++) {
      if (JSON.parse((await pede('/background-done')).corpo).concluidos === 1) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    expect(JSON.parse((await pede('/background-done')).corpo).concluidos).toBe(1)
    await semConexoes()
  })

  it('cancelar corpo durante consulta encerra socket sem contaminar próximo request', async () => {
    const resposta = await runtime.dispatchFetch('https://fixture.test/cancelado')
    const reader = resposta.body!.getReader()
    expect((await reader.read()).done).toBe(false)
    await reader.cancel()
    await semConexoes()
    expect((await pede('/query')).status).toBe(200)
    await semConexoes()
  })
})
