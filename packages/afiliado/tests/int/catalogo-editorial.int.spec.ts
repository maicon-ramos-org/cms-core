import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cmsCore } from '@maicon-ramos-org/cms-core'
import { grafoEditorial } from '@maicon-ramos-org/cms-core/grafo'
import { getPayload, handleEndpoints, type Payload, type SanitizedConfig } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { catalogoEditorial } from '../../src/cms/ofertas-editoriais/catalogo'
import { ofertasEditoriais } from '../../src/cms/ofertas-editoriais/plugin'

const semBanco = !process.env.DATABASE_URL
it.runIf(semBanco && process.env.CI)('CI exige Postgres para o catálogo editorial', () => expect(process.env.DATABASE_URL).toBeTruthy())

describe.skipIf(semBanco)('catálogo editorial com REST e Postgres reais', () => {
  let payload: Payload, config: SanitizedConfig
  let tenantA: any, tenantB: any, lojaA: any, lojaB: any, cupomA: any, categoriaA: any, categoriaB: any
  const key = 'catalogo-editorial-admin-fixture'
  const agentKey = 'catalogo-editorial-agent-fixture'
  const id = (value: any) => value && typeof value === 'object' ? value.id : value
  const create = (collection: string, data: Record<string, unknown>) => payload.create({ collection: collection as never, data: data as never, depth: 0 })
  const request = async (path: string, method = 'GET', body?: unknown, apiKey = key) => {
    const response = await handleEndpoints({ config, payloadInstanceCacheKey: 'catalogo-editorial-int',
      request: new Request(`http://teste.local/api${path}`, { method,
        headers: { 'Content-Type': 'application/json', Authorization: `users API-Key ${apiKey}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) })
    return { status: response.status, body: await response.json() }
  }
  const erro = async (path: string, body: Record<string, unknown>, field: string) => {
    const result = await request(path, 'POST', body)
    expect(result.status).toBe(400)
    expect(result.body.errors.flatMap((item: any) => item.data?.errors ?? [])).toContainEqual(expect.objectContaining({ path: field }))
  }

  beforeAll(async () => {
    const banco = new URL(process.env.DATABASE_URL!)
    banco.pathname = '/cms_core_teste_catalogo_editorial'
    vi.stubEnv('PAYLOAD_DB_PUSH', '1')
    vi.stubEnv('PAYLOAD_DROP_DATABASE', 'true')
    vi.stubEnv('PAYLOAD_SECRET', 'catalogo-editorial-fixture-sem-segredo-real')
    vi.stubEnv('REVALIDATE_URL', '')
    const pasta = mkdtempSync(join(tmpdir(), 'cms-catalogo-editorial-'))
    config = await cmsCore({ raiz: pasta, pastaDeMigracoes: pasta, db: { connectionString: banco.toString() },
      plugins: [grafoEditorial(), ofertasEditoriais({ programas: [{ slug: 'loja', rotulo: 'Loja', hostsPermitidos: ['loja.example'] }] }), catalogoEditorial()],
      midia: { r2: { bucket: 'nenhum', endpoint: 'https://bucket.invalid', publicBase: 'https://media.invalid',
        credentials: { accessKeyId: 'teste', secretAccessKey: 'teste' } } } })
    payload = await getPayload({ config, key: 'catalogo-editorial-int', disableOnInit: true })
    tenantA = await create('tenants', { nome: 'A', slug: 'a', canonical_host: 'a.example' })
    tenantB = await create('tenants', { nome: 'B', slug: 'b', canonical_host: 'b.example' })
    await create('users', { nome: 'Publicador', email: 'catalogo-publicador@example.test', roles: ['super-admin'],
      password: 'senha-fixture', enableAPIKey: true, apiKey: key, tenants: [{ tenant: tenantA.id }] })
    await create('users', { nome: 'Agente', email: 'catalogo-agente@example.test', roles: ['agente'],
      password: 'senha-fixture', enableAPIKey: true, apiKey: agentKey, tenants: [{ tenant: tenantA.id }] })
    lojaA = (await request('/lojas', 'POST', { tenant: tenantA.id, nome: 'Loja A', slug: 'loja-a', _status: 'published' })).body.doc
    lojaB = await create('lojas', { tenant: tenantB.id, nome: 'Loja B', slug: 'loja-b', _status: 'published' })
    cupomA = (await request('/cupons', 'POST', { tenant: tenantA.id, loja: lojaA.id, codigo: ' casa10 ',
      desconto_tipo: 'percentual', desconto_valor: 10, _status: 'published' })).body.doc
    categoriaA = (await request('/categorias_oferta', 'POST', { tenant: tenantA.id, nome: 'Treino em casa',
      slug: 'treino-em-casa', _status: 'published' })).body.doc
    categoriaB = await create('categorias_oferta', { tenant: tenantB.id, nome: 'Outro tenant', slug: 'outro-tenant' })
  }, 120_000)

  afterAll(async () => {
    if (payload) { await payload.db.dropDatabase({ adapter: payload.db as never }); await payload.destroy() }
    vi.unstubAllEnvs()
  })

  it('um publicador cadastra loja, cupom e categoria sem selo editorial duplicado', async () => {
    expect(lojaA._status).toBe('published')
    expect(cupomA.codigo).toBe('CASA10')
    expect(cupomA._status).toBe('published')
    expect(cupomA.verificado_em).toBeNull()
    expect(categoriaA._status).toBe('published')
    const oferta = await request('/ofertas_editoriais', 'POST', { tenant: tenantA.id, origem: 'hermes:oferta:1',
      slug: 'oferta-catalogada', nome: 'Produto único', programa: 'loja', estado: 'ativa',
      url_afiliado: 'https://loja.example/item', loja: lojaA.id, cupom: cupomA.id,
      categorias: [categoriaA.id], _status: 'published' })
    expect(oferta.status).toBe(201)
    expect(oferta.body.doc._status).toBe('published')
    expect(id(oferta.body.doc.loja)).toBe(lojaA.id)
    expect(id(oferta.body.doc.cupom)).toBe(cupomA.id)
    expect(oferta.body.doc.categorias.map(id)).toEqual([categoriaA.id])
    expect((await request('/ofertas')).status).toBe(404)
    expect((await request('/produtos')).status).toBe(404)
  })

  it('rejeita referência cruzada e cupom de outra loja com path do campo', async () => {
    await erro('/cupons', { tenant: tenantA.id, loja: lojaB.id, codigo: 'CRUZADO' }, 'loja')
    await erro('/categorias_oferta', { tenant: tenantA.id, nome: 'Cruzada', slug: 'cruzada', pai: categoriaB.id }, 'pai')
    await erro('/ofertas_editoriais', { tenant: tenantA.id, origem: 'hermes:oferta:cross', slug: 'cross',
      nome: 'Cross', programa: 'loja', estado: 'pausada', loja: lojaB.id }, 'loja')
    await erro('/ofertas_editoriais', { tenant: tenantA.id, origem: 'hermes:oferta:cross-category', slug: 'cross-category',
      nome: 'Cross', programa: 'loja', estado: 'pausada', categorias: [categoriaB.id] }, 'categorias.0')
    const outra = (await request('/lojas', 'POST', { tenant: tenantA.id, nome: 'Outra', slug: 'outra' })).body.doc
    await erro('/ofertas_editoriais', { tenant: tenantA.id, origem: 'hermes:oferta:wrong-coupon', slug: 'wrong-coupon',
      nome: 'Wrong coupon', programa: 'loja', estado: 'pausada', loja: outra.id, cupom: cupomA.id }, 'cupom')
  })

  it('não duplica cupom da mesma loja e preserva origem para upsert', async () => {
    await erro('/cupons', { tenant: tenantA.id, loja: lojaA.id, codigo: 'casa10' }, 'codigo')
    await erro('/lojas', { tenant: tenantA.id, nome: 'Duplicada', slug: 'loja-a' }, 'slug')
  })

  it('a key única do agente publica no tenant permitido, mas não atravessa para outro', async () => {
    const allowed = await request('/lojas', 'POST', { tenant: tenantA.id, nome: 'Agente A', slug: 'agente-a',
      _status: 'published' }, agentKey)
    expect(allowed.status).toBe(201)
    expect(allowed.body.doc._status).toBe('published')
    const denied = await request('/lojas', 'POST', { tenant: tenantB.id, nome: 'Agente B', slug: 'agente-b',
      _status: 'published' }, agentKey)
    expect(denied.status).toBe(403)
  })
})
