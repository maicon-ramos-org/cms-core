/**
 * O núcleo sozinho, e o núcleo com o plugin de afiliado — dois sites de teste, sem nada do
 * site real (PRD 17 RF1d; critérios de aceite do RF1).
 *
 * O plugin é quem prova que é plugin: sem ele, o site não tem nenhuma coleção, campo, rota ou
 * tabela de afiliado; com ele, tem. A API é a do próprio Payload (`handleEndpoints`, o mesmo
 * que responde `/api/*` no Next), e a migração é a que cada site GERARIA — escrita numa pasta
 * temporária e lida como texto.
 *
 * Precisa de um Postgres alcançável (`DATABASE_URL`) e das `R2_*`. No CI os dois estão no job,
 * e sem eles o teste REPROVA; fora do CI, pula — o mesmo padrão do teste do MinIO no app do
 * site (`tests/int/copia-r2.int.spec.ts`). Local: as variáveis do `.env` do CMS e as `R2_*`
 * do MinIO (README).
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cmsCore } from '@runzos/cms-core'
import { getPayload, handleEndpoints, type Plugin, type SanitizedConfig } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { afiliado } from '../../src/cms'

interface App {
  nome: string
  config: SanitizedConfig
  pasta: string
  /** o SQL da migração que este site geraria a partir do zero */
  sql: string
}

const apps: App[] = []

async function monta(nome: string, plugins: Plugin[]): Promise<App> {
  const pasta = mkdtempSync(join(tmpdir(), `app-${nome}-`))
  const config = await cmsCore({ raiz: pasta, plugins, pastaDeMigracoes: pasta })
  const payload = await getPayload({ config, key: nome, disableOnInit: true })
  await payload.db.createMigration({ migrationName: 'inicial', payload, forceAcceptWarning: true, skipEmpty: true })
  const arquivo = readdirSync(pasta).find((f) => f.endsWith('_inicial.ts'))
  expect(arquivo, `o ${nome} não gerou migração`).toBeTruthy()
  const app = { nome, config, pasta, sql: readFileSync(join(pasta, arquivo!), 'utf8') }
  apps.push(app)
  return app
}

const status = async (app: App, caminho: string) =>
  (await handleEndpoints({ config: app.config, payloadInstanceCacheKey: app.nome, request: new Request(`http://teste.local${caminho}`) }))
    .status

const colecoes = (app: App) => app.config.collections.map((c) => c.slug)
const camposDoTenant = (app: App) =>
  app.config.collections.find((c) => c.slug === 'tenants')!.fields.flatMap((f) => ('name' in f ? [f.name] : []))
const tabelas = (app: App) => [...app.sql.matchAll(/CREATE TABLE "([a-z_]+)"/g)].map((m) => m[1]).sort()

const AFILIADO = ['lojas', 'cupons', 'ofertas', 'produtos', 'banners', 'cliques', 'historico_desconto', 'categorias_oferta']

const semAmbiente = !process.env.DATABASE_URL || !process.env.R2_BUCKET

it.runIf(semAmbiente && process.env.CI)('no CI, banco e bucket são obrigatórios — sem eles este teste não pode pular calado', () => {
  expect(process.env.DATABASE_URL, 'DATABASE_URL').toBeTruthy()
  expect(process.env.R2_BUCKET, 'R2_BUCKET').toBeTruthy()
})

describe.skipIf(semAmbiente)('o núcleo SEM o plugin de afiliado', () => {
  let app: App
  beforeAll(async () => {
    app = await monta('nucleo', [])
  }, 120_000)

  it('não tem coleção de afiliado, e tem as do núcleo', () => {
    for (const slug of AFILIADO) expect(colecoes(app)).not.toContain(slug)
    for (const slug of ['tenants', 'users', 'midia', 'posts', 'pages', 'link_rules']) expect(colecoes(app)).toContain(slug)
  })

  it('`tenants` não tem programas_ativos nem chat_enabled (o primeiro é do plugin, o segundo de um site)', () => {
    expect(camposDoTenant(app)).not.toContain('programas_ativos')
    expect(camposDoTenant(app)).not.toContain('chat_enabled')
  })

  it('/api/cupons e /api/ofertas respondem 404; /api/posts existe', async () => {
    expect(await status(app, '/api/cupons')).toBe(404)
    expect(await status(app, '/api/ofertas')).toBe(404)
    expect(await status(app, '/api/posts')).not.toBe(404)
  })

  it('a migração que ele geraria não tem tabela de afiliado', () => {
    for (const t of AFILIADO) expect(tabelas(app)).not.toContain(t)
    expect(tabelas(app)).toContain('posts')
    expect(tabelas(app)).not.toContain('tenants_programas_ativos')
  })
})

describe.skipIf(semAmbiente)('o núcleo COM o plugin de afiliado', () => {
  let app: App
  beforeAll(async () => {
    app = await monta('com-afiliado', [afiliado()])
  }, 120_000)

  it('ganha as coleções de afiliado e o campo programas_ativos em tenants', () => {
    for (const slug of AFILIADO) expect(colecoes(app)).toContain(slug)
    expect(camposDoTenant(app)).toContain('programas_ativos')
    // chat_enabled continua fora: é de um site, não do plugin
    expect(camposDoTenant(app)).not.toContain('chat_enabled')
  })

  it('/api/cupons e /api/ofertas passam a existir', async () => {
    expect(await status(app, '/api/cupons')).not.toBe(404)
    expect(await status(app, '/api/ofertas')).not.toBe(404)
  })

  it('a migração que ele geraria cria as tabelas do plugin', () => {
    for (const t of AFILIADO) expect(tabelas(app)).toContain(t)
    expect(tabelas(app)).toContain('tenants_programas_ativos')
  })
})

afterAll(() => {
  for (const a of apps) rmSync(a.pasta, { recursive: true, force: true })
})
