/** REST real e Local API sobre um banco exclusivo; nunca toca banco de instância. */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getPayload, handleEndpoints, type Payload, type SanitizedConfig } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cmsCore } from '../../src/fabrica'
import { grafoEditorial } from '../../src/grafo'

const semBanco = !process.env.DATABASE_URL
it.runIf(semBanco && process.env.CI)('CI exige Postgres para provar os limites do grafo', () => expect(process.env.DATABASE_URL).toBeTruthy())

describe.skipIf(semBanco)('grafo editorial no Payload e Postgres', () => {
  let payload: Payload
  let config: SanitizedConfig
  let tenantA: any, tenantB: any, entidadeA: any, entidadeB: any, fonteA: any, claimA: any
  const key = 'grafo-integracao-chave-a'
  const fonteURL = 'https://pesquisa.example/estudo'
  const request = async (path: string, method = 'GET', body?: unknown, autenticar = true) => {
    const resposta = await handleEndpoints({ config, payloadInstanceCacheKey: 'grafo-integracao',
      request: new Request(`http://teste.local/api${path}`, { method,
        headers: { 'Content-Type': 'application/json', ...(autenticar ? { Authorization: `users API-Key ${key}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) })
    return { status: resposta.status, body: await resposta.json() }
  }
  const create = (collection: string, data: Record<string, unknown>) => payload.create({ collection: collection as never, data: data as never, depth: 0 })
  const erroPath = (r: { status: number; body: any }, path: string) => {
    expect(r.status).toBe(400)
    expect(r.body.errors.flatMap((e: any) => e.data?.errors ?? [])).toContainEqual(expect.objectContaining({ path }))
  }

  beforeAll(async () => {
    const banco = new URL(process.env.DATABASE_URL!)
    banco.pathname = '/cms_core_teste_grafo'
    vi.stubEnv('PAYLOAD_DB_PUSH', '1')
    vi.stubEnv('PAYLOAD_DROP_DATABASE', 'true')
    vi.stubEnv('PAYLOAD_SECRET', 'grafo-fixture-sem-segredo-real')
    vi.stubEnv('REVALIDATE_URL', '')
    const pasta = mkdtempSync(join(tmpdir(), 'cms-grafo-'))
    config = await cmsCore({ raiz: pasta, pastaDeMigracoes: pasta, db: { connectionString: banco.toString() },
      plugins: [grafoEditorial({ formatos: [{ slug: 'guia', rotulo: 'Guia', intencao: 'aprender' }] })],
      midia: { r2: { bucket: 'nenhum', endpoint: 'https://bucket.invalid', publicBase: 'https://media.invalid',
        credentials: { accessKeyId: 'teste', secretAccessKey: 'teste' } } } })
    payload = await getPayload({ config, key: 'grafo-integracao', disableOnInit: true })
    tenantA = await create('tenants', { nome: 'Tenant A', slug: 'tenant-a', canonical_host: 'a.example', gates: { ativo: false } })
    tenantB = await create('tenants', { nome: 'Tenant B', slug: 'tenant-b', canonical_host: 'b.example' })
    await create('users', { nome: 'Agente A', email: 'agente-a@example.test', password: 'senha-fixture-exclusiva',
      roles: ['agente'], enableAPIKey: true, apiKey: key, tenants: [{ tenant: tenantA.id }] })
    entidadeA = await create('entidades', { tenant: tenantA.id, nome: 'Conceito A', slug: 'conceito', tipo: 'conceito', origem: 'legacy:entity:1' })
    entidadeB = await create('entidades', { tenant: tenantB.id, nome: 'Conceito B privado', slug: 'conceito', tipo: 'conceito' })
    fonteA = await create('fontes', { tenant: tenantA.id, url: fonteURL, publisher: 'Instituto de pesquisa', tier: 1 })
    claimA = await create('claims', { tenant: tenantA.id, entidade: entidadeA.id, fonte: fonteA.id,
      texto: 'redução de 12% na amostra', ano_ancora: new Date().getUTCFullYear(), status: 'vigente', origem: 'legacy:claim:1' })
  }, 120_000)

  afterAll(async () => {
    if (payload) { await payload.db.dropDatabase({ adapter: payload.db as never }); await payload.destroy() }
    vi.unstubAllEnvs()
  })

  it('claim exige fonte, inclusive PATCH null e Local API', async () => {
    erroPath(await request('/claims', 'POST', { tenant: tenantA.id, entidade: entidadeA.id, texto: 'Sem fonte' }), 'fonte')
    erroPath(await request(`/claims/${claimA.id}`, 'PATCH', { fonte: null }), 'fonte')
    await expect(create('claims', { tenant: tenantA.id, entidade: entidadeA.id, texto: 'Sem fonte' })).rejects.toMatchObject({ data: { errors: expect.arrayContaining([expect.objectContaining({ path: 'fonte' })]) } })
  })
  it('vínculo cross-tenant e autorrelação reprovam com path', async () => {
    erroPath(await request('/relacoes', 'POST', { tenant: tenantA.id, de: entidadeA.id, para: entidadeB.id, tipo: 'relacionada' }), 'para')
    erroPath(await request('/relacoes', 'POST', { tenant: tenantA.id, de: entidadeA.id, para: entidadeA.id, tipo: 'relacionada' }), 'para')
  })
  it('relação embutida no corpo também valida tenant, mesmo com overrideAccess', async () => {
    const corpo = { root: { type: 'root', version: 1, children: [{ type: 'relationship', version: 2, relationTo: 'entidades', value: entidadeB.id }], direction: null, format: '', indent: 0 } }
    await expect(create('posts', { tenant: tenantA.id, titulo: 'Relação proibida', slug: 'relacao-proibida', corpo }))
      .rejects.toMatchObject({ data: { errors: expect.arrayContaining([expect.objectContaining({ path: 'corpo' })]) } })
  })
  it('tenant não pode mudar nem pela Local API com overrideAccess', async () => {
    await expect(payload.update({ collection: 'entidades' as never, id: entidadeA.id, data: { tenant: tenantB.id } as never, overrideAccess: true }))
      .rejects.toMatchObject({ data: { errors: expect.arrayContaining([expect.objectContaining({ path: 'tenant' })]) } })
  })
  it('origem identifica import idempotente e não pode ser limpa', async () => {
    erroPath(await request('/entidades', 'POST', { tenant: tenantA.id, nome: 'Outra', slug: 'outra', tipo: 'conceito', origem: 'legacy:entity:1' }), 'origem')
    erroPath(await request(`/entidades/${entidadeA.id}`, 'PATCH', { origem: null }), 'origem')
  })
  it('relação duplicada reprova e índice composto é gerado', async () => {
    const outra = await create('entidades', { tenant: tenantA.id, nome: 'Outro conceito', slug: 'outro', tipo: 'conceito' })
    const dados = { tenant: tenantA.id, de: entidadeA.id, para: outra.id, tipo: 'relacionada' }
    expect((await request('/relacoes', 'POST', dados)).status).toBe(201)
    erroPath(await request('/relacoes', 'POST', dados), 'tipo')
    expect(config.collections.find(c => c.slug === 'relacoes')!.indexes).toContainEqual({ fields: ['tenant', 'de', 'para', 'tipo'], unique: true })
  })
  it('contexto exige autenticação, rejeita tenant alheio e não vaza conteúdo do B', async () => {
    expect((await request('/grafo/contexto?entidade=conceito', 'GET', undefined, false)).status).toBe(401)
    expect((await request(`/grafo/contexto?entidade=conceito&tenant=${tenantB.id}`)).status).toBe(403)
    const r = await request('/grafo/contexto?entidade=conceito')
    expect(r.status).toBe(200)
    expect(r.body.entidade.id).toBe(entidadeA.id)
    expect(JSON.stringify(r.body)).not.toContain('Conceito B privado')
    expect(r.body.claims[0].fonte.url).toBe(fonteURL)
    expect((await request('/grafo/contexto?entidade=conceito&profundidade=2')).status).toBe(400)
  })
  it('agente cria draft e Markdown vira Lexical; Lexical explícito vence', async () => {
    const r = await request('/posts', 'POST', { tenant: tenantA.id, titulo: 'Artigo de teste em rascunho', slug: 'rascunho',
      tipo: 'guia', corpo_md: '## Introdução\n\nTexto com [fonte](https://pesquisa.example/estudo).', entidades: [entidadeA.id] })
    expect(r.status).toBe(201)
    expect(r.body.doc._status).toBe('draft')
    expect(r.body.doc.corpo.root.children[0].type).toBe('heading')
    const outro = await request(`/posts/${r.body.doc.id}`, 'PATCH', { corpo: r.body.doc.corpo, corpo_md: 'CONTEÚDO INJETADO' })
    expect(outro.status).toBe(200)
    expect(outro.body.doc.corpo_md).toContain('Introdução')
    expect(outro.body.doc.corpo_md).not.toContain('INJETADO')
    const contexto = await request('/grafo/contexto?entidade=conceito')
    expect(contexto.body.posts[0]).not.toHaveProperty('corpo')
    expect(contexto.body.posts[0]).not.toHaveProperty('corpo_md')
    expect((await request('/posts', 'POST', { tenant: tenantA.id, titulo: 'Publicação proibida', slug: 'proibido', corpo_md: 'Texto', _status: 'published' })).status).toBe(403)
  })
  it('eventos têm ator da key e são imutáveis até pela Local API', async () => {
    const r = await request('/entidades', 'POST', { tenant: tenantA.id, nome: 'Auditado', slug: 'auditado', tipo: 'conceito' })
    expect(r.status).toBe(201)
    const eventos = await payload.find({ collection: 'eventos' as never, depth: 0, where: { and: [{ colecao: { equals: 'entidades' } }, { doc: { equals: String(r.body.doc.id) } }] } })
    expect(eventos.docs[0]!.ator).toBeTruthy()
    expect(eventos.docs[0]!.campos).toContain('nome')
    expect(eventos.docs[0]).not.toHaveProperty('diff')
    await expect(payload.update({ collection: 'eventos' as never, id: eventos.docs[0]!.id, data: { acao: 'update' } as never }))
      .rejects.toMatchObject({ status: 400 })
    await expect(payload.delete({ collection: 'eventos' as never, id: eventos.docs[0]!.id })).rejects.toMatchObject({ status: 400 })
  })
  it('dry-run e publish concordam, não criam versão no dry-run, e usuário não desliga gates', async () => {
    await payload.update({ collection: 'tenants', id: tenantA.id, data: { gates: { ativo: true, g1: true, g2: true, g3: true, g4: false } } })
    await create('pesquisas', { tenant: tenantA.id, entidade: entidadeA.id, corpo_md: 'Pesquisa registrada', qualidade: 90, validade_dias: 30 })
    const r = await request('/posts', 'POST', { tenant: tenantA.id, titulo: 'Evidência publicada depois da revisão', slug: 'evidencia',
      corpo_md: 'Texto sem a evidência da claim.', entidades: [entidadeA.id], claims: [claimA.id] })
    expect(r.status).toBe(201)
    const id = r.body.doc.id
    const versoes = () => payload.findVersions({ collection: 'posts', where: { parent: { equals: id } }, limit: 1 }).then(r => r.totalDocs)
    const antes = await versoes()
    const dry = await request(`/posts/${id}/gates`, 'POST')
    expect(dry.status).toBe(200)
    expect(dry.body).toContainEqual(expect.objectContaining({ gate: 'G2', path: 'claims' }))
    expect(await versoes()).toBe(antes)
    erroPath(await request(`/posts/${id}`, 'PATCH', { _status: 'published' }), 'claims')
    const corpo = `A pesquisa de ${new Date().getUTCFullYear()} registra redução de 12% na amostra [na fonte](${fonteURL}).`
    const atualizado = await request(`/posts/${id}`, 'PATCH', { corpo_md: corpo })
    expect(atualizado.status).toBe(200)
    expect(atualizado.body.doc.corpo_md).toContain('redução de 12%')
    expect((await request(`/posts/${id}/gates`, 'POST')).body).toEqual([])
    expect((await request(`/posts/${id}`, 'PATCH', { _status: 'published', gates: [] })).status).toBe(200)
    // Editar post já publicado continua sujeito aos gates mesmo sem reenviar _status.
    erroPath(await request(`/posts/${id}`, 'PATCH', { corpo_md: 'Evidência removida.' }), 'claims')
    const agente = await payload.find({ collection: 'users', where: { email: { equals: 'agente-a@example.test' } } })
    await expect(payload.update({ collection: 'tenants', id: tenantA.id, user: { ...agente.docs[0]!, collection: 'users' }, overrideAccess: true,
      data: { gates: { ativo: false } } })).rejects.toMatchObject({ status: 403 })
  })
})
