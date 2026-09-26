/** Banco exclusivo, REST real e Local API; nenhuma conexão com instâncias de produção. */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cmsCore } from '@maicon-ramos-org/cms-core'
import { getPayload, handleEndpoints, type Payload, type SanitizedConfig } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { afiliado } from '../../src/cms'

const semBanco = !process.env.DATABASE_URL
it.runIf(semBanco && process.env.CI)('CI exige Postgres para validar categorias', () => expect(process.env.DATABASE_URL).toBeTruthy())

describe.skipIf(semBanco)('categorias injetadas no Payload/Postgres', () => {
  let payload: Payload, config: SanitizedConfig
  let tenantA: any, tenantB: any, produtoA: any, produtoB: any, varianteA: any
  const key = 'categorias-fixture-chave-a'
  const request = async (path: string, method = 'GET', body?: unknown, apiKey = key) => {
    const resposta = await handleEndpoints({ config, payloadInstanceCacheKey: 'categorias-integracao',
      request: new Request(`http://teste.local/api${path}`, { method,
        headers: { 'Content-Type': 'application/json', Authorization: `users API-Key ${apiKey}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) })
    return { status: resposta.status, body: await resposta.json() }
  }
  const create = (collection: string, data: Record<string, unknown>) => payload.create({ collection: collection as never, data: data as never, depth: 0 })
  const erroPath = (r: { status: number; body: any }, path: string) => {
    expect(r.status).toBe(400)
    expect(r.body.errors.flatMap((e: any) => e.data?.errors ?? [])).toContainEqual(expect.objectContaining({ path }))
  }
  const spec = { capacidade: 0, conectado: false }

  beforeAll(async () => {
    const banco = new URL(process.env.DATABASE_URL!)
    banco.pathname = '/cms_core_teste_categorias'
    vi.stubEnv('PAYLOAD_DB_PUSH', '1')
    vi.stubEnv('PAYLOAD_DROP_DATABASE', 'true')
    vi.stubEnv('PAYLOAD_SECRET', 'categorias-fixture-sem-segredo-real')
    vi.stubEnv('REVALIDATE_URL', '')
    const pasta = mkdtempSync(join(tmpdir(), 'cms-categorias-'))
    config = await cmsCore({ raiz: pasta, pastaDeMigracoes: pasta, db: { connectionString: banco.toString() },
      plugins: [afiliado({ catalogo: { categoriasAdicionais: [{ slug: 'dispositivo', rotulo: 'Dispositivo',
        atributosDeIdentidade: ['especificacoes.capacidade', 'especificacoes.conectado'],
        validarVariante: (variante, produto) => {
          const specs = variante.especificacoes as Record<string, unknown> | undefined
          // Tentativas de efeito colateral ficam na cópia, nunca no dado persistido.
          Object.assign(variante, { tenant: -1 })
          Object.assign(produto, { marca: 'não persistir' })
          return specs?.bloqueado === true ? [{ path: 'especificacoes.bloqueado', message: 'Exige revisão do site.' }] : []
        } }] } })],
      midia: { r2: { bucket: 'nenhum', endpoint: 'https://bucket.invalid', publicBase: 'https://media.invalid',
        credentials: { accessKeyId: 'teste', secretAccessKey: 'teste' } } } })
    payload = await getPayload({ config, key: 'categorias-integracao', disableOnInit: true })
    tenantA = await create('tenants', { nome: 'Tenant A', slug: 'tenant-a', canonical_host: 'a.example' })
    tenantB = await create('tenants', { nome: 'Tenant B', slug: 'tenant-b', canonical_host: 'b.example' })
    await create('users', { nome: 'Agente A', email: 'categorias-a@example.test', password: 'senha-fixture',
      roles: ['agente'], enableAPIKey: true, apiKey: key, tenants: [{ tenant: tenantA.id }] })
    await create('users', { nome: 'Ingestão A', email: 'categorias-ingestao@example.test', password: 'senha-fixture',
      roles: ['ingestao'], enableAPIKey: true, apiKey: 'categorias-fixture-ingestao', tenants: [{ tenant: tenantA.id }] })
    const produto = { nome: 'Dispositivo documentado', slug: 'dispositivo-documentado', marca: 'Marca documentada', modelo: 'Modelo documentado', categoria: 'dispositivo' }
    produtoA = await create('produtos_fisicos', { ...produto, tenant: tenantA.id })
    produtoB = await create('produtos_fisicos', { ...produto, tenant: tenantB.id })
    varianteA = await create('variantes_produto', { tenant: tenantA.id, produto: produtoA.id, nome: 'Variante documentada', gtin: '1234567890001', especificacoes: spec, estado: 'confirmada' })
  }, 120_000)

  afterAll(async () => {
    if (payload) { await payload.db.dropDatabase({ adapter: payload.db as never }); await payload.destroy() }
    vi.unstubAllEnvs()
  })

  it('categoria registrada persiste e desconhecida retorna path; marca/modelo não são inventados', async () => {
    const dados = { tenant: tenantA.id, nome: 'Outro dispositivo', slug: 'outro', categoria: 'dispositivo', marca: 'Marca', modelo: 'Modelo' }
    expect((await request('/produtos_fisicos', 'POST', dados)).status).toBe(201)
    erroPath(await request('/produtos_fisicos', 'POST', { ...dados, slug: 'desconhecido', categoria: 'desconhecida' }), 'categoria')
    erroPath(await request('/produtos_fisicos', 'POST', { ...dados, slug: 'sem-marca', marca: null }), 'marca')
    erroPath(await request('/produtos_fisicos', 'POST', { ...dados, slug: 'sem-modelo', modelo: null }), 'modelo')
  })
  it('confirmação exige atributos escalares; PATCH null e callback do site falham com path', async () => {
    const dados = { tenant: tenantA.id, produto: produtoA.id, nome: 'Variante', estado: 'confirmada' }
    erroPath(await request('/variantes_produto', 'POST', dados), 'especificacoes.capacidade')
    erroPath(await request('/variantes_produto', 'POST', { ...dados, especificacoes: { ...spec, capacidade: {} } }), 'especificacoes.capacidade')
    erroPath(await request(`/variantes_produto/${varianteA.id}`, 'PATCH', { especificacoes: { ...spec, capacidade: null } }), 'especificacoes.capacidade')
    erroPath(await request(`/variantes_produto/${varianteA.id}`, 'PATCH', { especificacoes: { ...spec, bloqueado: true } }), 'especificacoes.bloqueado')
  })
  it('incerta pode ficar incompleta; confirma depois somente se identidade já estava completa', async () => {
    const incerta = await request('/variantes_produto', 'POST', { tenant: tenantA.id, produto: produtoA.id, nome: 'Incompleta' })
    expect(incerta.status).toBe(201)
    expect(incerta.body.doc.estado).toBe('incerta')
    erroPath(await request(`/variantes_produto/${incerta.body.doc.id}`, 'PATCH', { estado: 'confirmada' }), 'especificacoes.capacidade')
    const completa = await request('/variantes_produto', 'POST', { tenant: tenantA.id, produto: produtoA.id, nome: 'Completa', especificacoes: { ...spec, capacidade: 2 } })
    expect(completa.status).toBe(201)
    expect((await request(`/variantes_produto/${completa.body.doc.id}`, 'PATCH', { estado: 'confirmada' })).status).toBe(200)
  })
  it('metadados mudam sem trocar hash; identidade e categoria continuam imutáveis', async () => {
    const atualizado = await request(`/variantes_produto/${varianteA.id}`, 'PATCH', { especificacoes: { ...spec, nota: 'revisada' } })
    expect(atualizado.status).toBe(200)
    expect(atualizado.body.doc.chave_normalizada).toBe(varianteA.chave_normalizada)
    expect(atualizado.body.doc.tenant).not.toBe(-1)
    expect((await payload.findByID({ collection: 'produtos_fisicos', id: produtoA.id })).marca).toBe('Marca documentada')
    erroPath(await request(`/variantes_produto/${varianteA.id}`, 'PATCH', { especificacoes: { ...spec, capacidade: 3 } }), 'chave_normalizada')
    erroPath(await request(`/produtos_fisicos/${produtoA.id}`, 'PATCH', { categoria: 'acessorio' }), 'categoria')
  })
  it('tenant segue isolado, inclusive relação na Local API overrideAccess', async () => {
    await expect(create('variantes_produto', { tenant: tenantA.id, produto: produtoB.id, nome: 'Cross-tenant', especificacoes: spec }))
      .rejects.toMatchObject({ data: { errors: expect.arrayContaining([expect.objectContaining({ path: 'produto' })]) } })
    erroPath(await request(`/variantes_produto/${varianteA.id}`, 'PATCH', { tenant: tenantB.id }), 'tenant')
    expect((await request(`/produtos_fisicos/${produtoB.id}`)).status).toBe(404)
  })
  it('ingestão permanece draft-first na categoria adicional', async () => {
    const dados = { tenant: tenantA.id, nome: 'Ingestão', slug: 'ingestao', categoria: 'dispositivo', marca: 'Marca', modelo: 'Modelo' }
    erroPath(await request('/produtos_fisicos', 'POST', { ...dados, estado: 'published' }, 'categorias-fixture-ingestao'), 'estado')
    const r = await request('/produtos_fisicos', 'POST', dados, 'categorias-fixture-ingestao')
    expect(r.status).toBe(201)
    expect(r.body.doc.estado).toBe('draft')
  })
  it('vínculo automático usa registro e recusa contradições mesmo com score enviado', async () => {
    const entrada = { marca: produtoA.marca, modelo: produtoA.modelo, especificacoes: spec }
    const dados = { tenant: tenantA.id, entrada: 'fixture:1', variante: varianteA.id, metodo: 'atributos', score: 1,
      evidencia: { entrada }, decisao: 'confirmado', observado_em: '2026-09-25T12:00:00Z' }
    expect((await request('/vinculos_catalogo', 'POST', dados)).status).toBe(201)
    erroPath(await request('/vinculos_catalogo', 'POST', { ...dados, evidencia: { entrada: { ...entrada, especificacoes: { ...spec, capacidade: 9 } } } }), 'evidencia')
    erroPath(await request('/vinculos_catalogo', 'POST', { ...dados, evidencia: { entrada: { ...entrada, categoria: 'outra' } } }), 'evidencia')
    const porGTIN = { ...dados, metodo: 'gtin', evidencia: { entrada: { gtin: varianteA.gtin, categoria: 'dispositivo' } } }
    expect((await request('/vinculos_catalogo', 'POST', porGTIN)).status).toBe(201)
    erroPath(await request('/vinculos_catalogo', 'POST', { ...porGTIN, evidencia: { entrada: { gtin: varianteA.gtin, categoria: 'outra' } } }), 'evidencia')
  })
  it('filamento padrão mantém exigência e hash literal dentro da instância estendida', async () => {
    const p = await create('produtos_fisicos', { tenant: tenantA.id, nome: 'Filamento', slug: 'filamento', categoria: 'filamento', marca: 'Marca', modelo: 'PLA' })
    erroPath(await request('/variantes_produto', 'POST', { tenant: tenantA.id, produto: p.id, nome: 'Sem atributos', estado: 'confirmada' }), 'material')
    const v = await create('variantes_produto', { tenant: tenantA.id, produto: p.id, nome: 'Completa', estado: 'confirmada',
      sku_fabricante: 'SKU-A', gtin: '1234567890123', material: 'PLA', cor: 'Preto', peso_g: 1000,
      diametro_mm: 1.75, acabamento: 'standard', especificacoes: { origem: 'documentada' } })
    expect(v.chave_normalizada).toBe('036b1d3f605a150f67446205012473ff91e07cad5664fa887b07a7cdecc63119')
  })
})
