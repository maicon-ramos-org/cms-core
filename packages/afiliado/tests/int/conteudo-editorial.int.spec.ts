/** Banco exclusivo, REST real e Local API; instância de vertical genérica (sem categorias padrão). */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from '@payloadcms/db-postgres'
import { cmsCore } from '@maicon-ramos-org/cms-core'
import { getPayload, handleEndpoints, type Payload, type SanitizedConfig } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { afiliado, hashDeFatos, SQL_BACKFILL_DESCRICAO_LEGADA } from '../../src/cms'

const semBanco = !process.env.DATABASE_URL
it.runIf(semBanco && process.env.CI)('CI exige Postgres para validar o conteúdo editorial', () => expect(process.env.DATABASE_URL).toBeTruthy())

describe.skipIf(semBanco)('conteúdo editorial do produto canônico no Payload/Postgres', () => {
  let payload: Payload, config: SanitizedConfig
  let tenantA: any, tenantB: any
  const chaves = { editorA: 'conteudo-editor-a', editorB: 'conteudo-editor-b', ingestaoA: 'conteudo-ingestao-a', agenteA: 'conteudo-agente-a' }
  const request = async (path: string, method = 'GET', body?: unknown, apiKey = chaves.ingestaoA) => {
    const resposta = await handleEndpoints({ config, payloadInstanceCacheKey: 'conteudo-integracao',
      request: new Request(`http://teste.local/api${path}`, { method,
        headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `users API-Key ${apiKey}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) })
    return { status: resposta.status, body: await resposta.json() }
  }
  const paths = (r: { status: number; body: any }) => r.body.errors.flatMap((e: any) => e.data?.errors ?? []).map((e: any) => e.path).sort() as string[]
  const create = (collection: string, data: Record<string, unknown>) => payload.create({ collection: collection as never, data: data as never, depth: 0 })
  const conteudo = (fatos = { peso: 1 }, extra: Record<string, unknown> = {}) => ({
    meta_title: 'Produto documentado M-1', meta_description: 'Descrição factual do produto documentado.', resumo: 'Resumo em um parágrafo.',
    descricao_markdown: '## O que é\n\nTexto factual.', destaques: ['Fato um', 'Fato dois'],
    faq: [{ pergunta: 'Serve para quê?', resposta: 'Para o uso descrito.' }], facts_hash: hashDeFatos(fatos),
    content_generator: 'gerador-de-teste', prompt_version: 'v1', ...extra })
  let n = 0
  const produto = (extra: Record<string, unknown> = {}, apiKey = chaves.ingestaoA, tenant = () => tenantA) => {
    n++
    return request('/produtos_fisicos', 'POST', { tenant: tenant().id, nome: `Produto ${n}`, slug: `produto-${n}`, categoria: 'suplemento', marca: 'Marca', modelo: `M-${n}`, ...extra }, apiKey)
  }

  beforeAll(async () => {
    const banco = new URL(process.env.DATABASE_URL!)
    banco.pathname = '/cms_core_teste_conteudo'
    vi.stubEnv('PAYLOAD_DB_PUSH', '1')
    vi.stubEnv('PAYLOAD_DROP_DATABASE', 'true')
    vi.stubEnv('PAYLOAD_SECRET', 'conteudo-fixture-sem-segredo-real')
    vi.stubEnv('REVALIDATE_URL', '')
    const pasta = mkdtempSync(join(tmpdir(), 'cms-conteudo-'))
    config = await cmsCore({ raiz: pasta, pastaDeMigracoes: pasta, db: { connectionString: banco.toString() },
      plugins: [afiliado({ catalogo: { incluirCategoriasPadrao: false, categoriasAdicionais: [
        { slug: 'equipamento', rotulo: 'Equipamento', atributosDeIdentidade: ['especificacoes.carga_max_kg'] },
        { slug: 'suplemento', rotulo: 'Suplemento', atributosDeIdentidade: ['especificacoes.sabor'] },
        { slug: 'acessorio', rotulo: 'Acessório', atributosDeIdentidade: ['especificacoes.material'] },
      ] } })],
      midia: { r2: { bucket: 'nenhum', endpoint: 'https://bucket.invalid', publicBase: 'https://media.invalid',
        credentials: { accessKeyId: 'teste', secretAccessKey: 'teste' } } } })
    payload = await getPayload({ config, key: 'conteudo-integracao', disableOnInit: true })
    tenantA = await create('tenants', { nome: 'Tenant A', slug: 'tenant-a', canonical_host: 'a.example' })
    tenantB = await create('tenants', { nome: 'Tenant B', slug: 'tenant-b', canonical_host: 'b.example' })
    const usuario = (email: string, roles: string[], apiKey: string, tenant: any) => create('users', { nome: email, email, password: 'senha-fixture',
      roles, enableAPIKey: true, apiKey, tenants: [{ tenant: tenant.id }] })
    await usuario('conteudo-editor-a@example.test', ['editor'], chaves.editorA, tenantA)
    await usuario('conteudo-editor-b@example.test', ['editor'], chaves.editorB, tenantB)
    await usuario('conteudo-ingestao-a@example.test', ['ingestao'], chaves.ingestaoA, tenantA)
    await usuario('conteudo-agente-a@example.test', ['agente'], chaves.agenteA, tenantA)
  }, 120_000)

  afterAll(async () => {
    if (payload) { await payload.db.dropDatabase({ adapter: payload.db as never }); await payload.destroy() }
    vi.unstubAllEnvs()
  })

  it('capabilities: autenticado enxerga versões e as categorias da instância; anônimo não', async () => {
    expect((await request('/afiliado/capabilities', 'GET', undefined, '')).status).toBe(401)
    const r = await request('/afiliado/capabilities')
    expect(r.status).toBe(200)
    expect(r.body.capabilities).toEqual({ 'affiliate.catalog': '2.0', 'affiliate.content': '1.0', 'affiliate.preflight': '1.0', 'affiliate.offer-history': '1.0' })
    expect(r.body.catalog.categories.map((c: any) => c.slug)).toEqual(['equipamento', 'suplemento', 'acessorio'])
    expect(r.body.content.limits).toMatchObject({ metaTitle: 60, metaDescription: 155 })
  })

  it('produto novo nasce draft, sem conteúdo, não indexável e com status sem_conteudo; categoria histórica não existe aqui', async () => {
    const r = await produto()
    expect(r.status).toBe(201)
    expect(r.body.doc).toMatchObject({ estado: 'draft', editorial_status: 'sem_conteudo', indexavel: false })
    expect(r.body.doc.content_version ?? null).toBeNull()
    expect(paths(await produto({ categoria: 'filamento' }))).toEqual(['categoria'])
  })

  it('ingestão grava o pacote completo como rascunho v1; aprovar/indexar/publicar é recusado', async () => {
    const r = await produto(conteudo())
    expect(r.status).toBe(201)
    expect(r.body.doc).toMatchObject({ editorial_status: 'rascunho', content_version: 1, indexavel: false, estado: 'draft',
      destaques: ['Fato um', 'Fato dois'], faq: [{ pergunta: 'Serve para quê?', resposta: 'Para o uso descrito.' }] })
    expect(paths(await produto(conteudo({ peso: 2 }, { editorial_status: 'aprovado' })))).toContain('editorial_status')
    expect(paths(await produto(conteudo({ peso: 3 }, { indexavel: true })))).toContain('indexavel')
    expect(paths(await produto({ ...conteudo(), meta_title: 'x'.repeat(61) }))).toEqual(['meta_title'])
    expect(paths(await produto({ ...conteudo(), faq: [{ pergunta: 'P?', resposta: 'R', extra: 1 }] }))).toEqual(['faq.0.extra'])
  })

  it('conteúdo existente não é sobrescrito; reenvio idêntico é idempotente e não muda a versão', async () => {
    const criado = (await produto(conteudo())).body.doc
    const alterado = await request(`/produtos_fisicos/${criado.id}`, 'PATCH', { resumo: 'Outro resumo' })
    expect(alterado.status).toBe(400)
    expect(paths(alterado)).toEqual(['resumo'])
    expect(paths(await request(`/produtos_fisicos/${criado.id}`, 'PATCH', conteudo({ peso: 9 })))).toEqual(['facts_hash'])
    const repetido = await request(`/produtos_fisicos/${criado.id}`, 'PATCH', conteudo())
    expect(repetido.status).toBe(200)
    expect(repetido.body.doc).toMatchObject({ resumo: 'Resumo em um parágrafo.', content_version: 1 })
    expect((await payload.findByID({ collection: 'produtos_fisicos', id: criado.id })).content_version).toBe(1)
    // credencial de agente também é automação
    expect(paths(await request(`/produtos_fisicos/${criado.id}`, 'PATCH', { resumo: 'Agente' }, chaves.agenteA))).toEqual(['resumo'])
  })

  it('refresh explícito: só o editor marca; a reescrita automatizada passa uma vez e volta a rascunho', async () => {
    const criado = (await produto(conteudo())).body.doc
    const url = `/produtos_fisicos/${criado.id}`
    expect(paths(await request(url, 'PATCH', { editorial_refresh_em: '2026-09-29T10:00:00Z' }))).toEqual(['editorial_refresh_em'])
    expect((await request(url, 'PATCH', { editorial_refresh_em: '2026-09-29T10:00:00Z', editorial_refresh_motivo: 'fatos novos' }, chaves.editorA)).status).toBe(200)
    const novo = conteudo({ peso: 2 }, { resumo: 'Resumo refeito com fatos novos.' })
    const r = await request(url, 'PATCH', novo)
    expect(r.status).toBe(200)
    expect(r.body.doc).toMatchObject({ resumo: 'Resumo refeito com fatos novos.', content_version: 2, editorial_status: 'rascunho', indexavel: false,
      editorial_refresh_em: null, editorial_refresh_motivo: null })
    expect(paths(await request(url, 'PATCH', { resumo: 'Segunda reescrita sem novo pedido' }))).toEqual(['resumo'])
  })

  it('portão de indexação: default false, só o editor liga, e só com produto publicado, aprovado e completo', async () => {
    const criado = (await produto(conteudo())).body.doc
    const url = `/produtos_fisicos/${criado.id}`
    expect(paths(await request(url, 'PATCH', { indexavel: true }, chaves.editorA))).toEqual(['indexavel'])
    expect((await request(url, 'PATCH', { estado: 'published', editorial_status: 'aprovado' }, chaves.editorA)).status).toBe(200)
    // ingestão nem chega a editar produto publicado (regra anterior); o agente chega e é barrado pelo portão
    expect(paths(await request(url, 'PATCH', { indexavel: true }, chaves.agenteA))).toEqual(['indexavel'])
    const ligado = await request(url, 'PATCH', { indexavel: true }, chaves.editorA)
    expect(ligado.status).toBe(200)
    expect(ligado.body.doc.indexavel).toBe(true)
    // rebaixar o status tira do índice, sem o editor precisar lembrar
    const rebaixado = await request(url, 'PATCH', { editorial_status: 'rascunho' }, chaves.editorA)
    expect(rebaixado.body.doc).toMatchObject({ editorial_status: 'rascunho', indexavel: false })
  })

  it('tenant isolado: conteúdo de A é invisível e imutável para B, e o relacionamento cruzado é recusado', async () => {
    const criado = (await produto(conteudo())).body.doc
    expect((await request(`/produtos_fisicos/${criado.id}`, 'GET', undefined, chaves.editorB)).status).toBe(404)
    expect([403, 404]).toContain((await request(`/produtos_fisicos/${criado.id}`, 'PATCH', { resumo: 'Invasão' }, chaves.editorB)).status)
    const lista = await request('/produtos_fisicos?limit=100', 'GET', undefined, chaves.editorB)
    expect(lista.body.docs).toEqual([])
    // criar apontando para o tenant A com a credencial de B é recusado (o `tenant` do corpo não concede acesso)
    const cruzado = await request('/produtos_fisicos', 'POST', { tenant: tenantA.id, nome: 'X', slug: 'x-b', categoria: 'suplemento', marca: 'M', modelo: 'X', ...conteudo({ peso: 7 }) }, chaves.editorB)
    expect(cruzado.status).toBe(400)
    expect(paths(cruzado)).toEqual(['tenant'])
    expect((await payload.find({ collection: 'produtos_fisicos', where: { and: [{ slug: { equals: 'x-b' } }, { tenant: { equals: tenantA.id } }] }, depth: 0 })).docs).toEqual([])
    expect((await payload.findByID({ collection: 'produtos_fisicos', id: criado.id })).resumo).toBe('Resumo em um parágrafo.')
    // o mesmo slug em outro tenant é outro produto, com conteúdo próprio
    const b = await request('/produtos_fisicos', 'POST', { tenant: tenantB.id, nome: 'Produto B', slug: `produto-${n}`, categoria: 'suplemento', marca: 'M', modelo: 'B', ...conteudo({ peso: 5 }) }, chaves.editorB)
    expect(b.status).toBe(201)
    expect(b.body.doc.content_version).toBe(1)
  })

  it('descricao legada: preservada e protegida; backfill opt-in copia como rascunho, idempotente, sem indexar', async () => {
    const legado = (await produto({ descricao: 'Texto legado.' })).body.doc
    expect(legado).toMatchObject({ descricao: 'Texto legado.', editorial_status: 'sem_conteudo' })
    // anexar o pacote novo não toca a descricao antiga
    const comPacote = await request(`/produtos_fisicos/${legado.id}`, 'PATCH', conteudo())
    expect(comPacote.body.doc).toMatchObject({ descricao: 'Texto legado.', editorial_status: 'rascunho', content_version: 1 })
    expect(paths(await request(`/produtos_fisicos/${legado.id}`, 'PATCH', { descricao: 'Reescrita' }))).toEqual(['descricao'])

    const outro = (await produto({ descricao: 'Outro texto legado.' })).body.doc
    const db = (payload.db as any).drizzle
    await db.execute(sql.raw(SQL_BACKFILL_DESCRICAO_LEGADA))
    await db.execute(sql.raw(SQL_BACKFILL_DESCRICAO_LEGADA))
    const depois = await payload.findByID({ collection: 'produtos_fisicos', id: outro.id }) as any
    expect(depois).toMatchObject({ descricao: 'Outro texto legado.', descricao_markdown: 'Outro texto legado.', editorial_status: 'rascunho', indexavel: false, content_version: 1 })
    // o backfill não sobrescreve o que já tem conteúdo estruturado
    expect((await payload.findByID({ collection: 'produtos_fisicos', id: legado.id }) as any).descricao_markdown).toBe('## O que é\n\nTexto factual.')
    // e o texto promovido continua protegido contra automação
    expect(paths(await request(`/produtos_fisicos/${outro.id}`, 'PATCH', { descricao_markdown: 'Automático' }))).toContain('descricao_markdown')
  })
})
