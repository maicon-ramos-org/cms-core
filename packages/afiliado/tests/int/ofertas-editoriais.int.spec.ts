import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cmsCore } from '@maicon-ramos-org/cms-core'
import { grafoEditorial } from '@maicon-ramos-org/cms-core/grafo'
import { sql } from '@payloadcms/db-postgres'
import { getPayload, handleEndpoints, type Payload, type SanitizedConfig } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ofertasEditoriais } from '../../src/cms/ofertas-editoriais/plugin'
import { ultimasVerificacoesOfertas } from '../../src/cms/ofertas-editoriais/ultimas-verificacoes'

const semBanco = !process.env.DATABASE_URL
it.runIf(semBanco && process.env.CI)('CI exige Postgres para ofertas editoriais', () => expect(process.env.DATABASE_URL).toBeTruthy())

describe.skipIf(semBanco)('ofertas editoriais opt-in, REST e Postgres reais', () => {
  let payload: Payload, config: SanitizedConfig
  let tenantA: any, tenantB: any, entidadeA: any, entidadeB: any, ofertaA: any, ofertaB: any
  const key = 'ofertas-interno-a-fixture', keyAgente = 'ofertas-agente-a-fixture'
  const create = (collection: string, data: Record<string, unknown>) => payload.create({ collection: collection as never, data: data as never, depth: 0 })
  const request = async (path: string, method = 'GET', body?: unknown, apiKey = key) => {
    const resposta = await handleEndpoints({ config, payloadInstanceCacheKey: 'ofertas-editoriais-int', request: new Request(`http://teste.local/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `users API-Key ${apiKey}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }) })
    return { status: resposta.status, body: await resposta.json() }
  }
  const erro = (r: { status: number; body: any }, path: string) => {
    expect(r.status).toBe(400)
    expect(r.body.errors.flatMap((e: any) => e.data?.errors ?? [])).toContainEqual(expect.objectContaining({ path }))
  }
  const dados = (nome: string) => ({ tenant: tenantA.id, origem: `legacy:offer:${nome}`, slug: nome, nome, programa: 'loja', estado: 'ativa', url_afiliado: 'https://loja.example/item', preco: null })

  beforeAll(async () => {
    const banco = new URL(process.env.DATABASE_URL!)
    banco.pathname = '/cms_core_teste_ofertas_editoriais_ultimas'
    vi.stubEnv('PAYLOAD_DB_PUSH', '1')
    vi.stubEnv('PAYLOAD_DROP_DATABASE', 'true')
    vi.stubEnv('PAYLOAD_SECRET', 'ofertas-fixture-sem-segredo-real')
    vi.stubEnv('REVALIDATE_URL', '')
    const pasta = mkdtempSync(join(tmpdir(), 'cms-ofertas-editoriais-'))
    config = await cmsCore({ raiz: pasta, pastaDeMigracoes: pasta, db: { connectionString: banco.toString() },
      plugins: [grafoEditorial(), ofertasEditoriais({ programas: [{ slug: 'loja', rotulo: 'Loja', hostsPermitidos: ['loja.example'] }] })],
      midia: { r2: { bucket: 'nenhum', endpoint: 'https://bucket.invalid', publicBase: 'https://media.invalid', credentials: { accessKeyId: 'teste', secretAccessKey: 'teste' } } } })
    payload = await getPayload({ config, key: 'ofertas-editoriais-int', disableOnInit: true })
    tenantA = await create('tenants', { nome: 'A', slug: 'a', canonical_host: 'a.example', ofertas_editoriais: { papeis_escolha: [{ slug: 'principal', rotulo: 'Principal' }, { slug: 'alternativa', rotulo: 'Alternativa' }] } })
    tenantB = await create('tenants', { nome: 'B', slug: 'b', canonical_host: 'b.example' })
    for (const [apiKey, roles, email] of [[key, ['agente', 'sistema'], 'ofertas-interno@example.test'], [keyAgente, ['agente'], 'ofertas-agente@example.test']] as const) {
      await create('users', { nome: email, email, roles: [...roles], password: 'senha-fixture', enableAPIKey: true, apiKey, tenants: [{ tenant: tenantA.id }] })
    }
    await create('users', { nome: 'Importador', email: 'ofertas-importador@example.test', roles: ['ingestao', 'sistema'], password: 'senha-fixture', enableAPIKey: true, apiKey: 'ofertas-importador-fixture', tenants: [{ tenant: tenantA.id }] })
    await create('users', { nome: 'Leitor SSR', email: 'ofertas-ssr@example.test', roles: ['sistema'], password: 'senha-fixture', enableAPIKey: true, apiKey: 'ofertas-ssr-fixture', tenants: [{ tenant: tenantA.id }] })
    entidadeA = await create('entidades', { tenant: tenantA.id, slug: 'conceito', nome: 'Conceito', tipo: 'conceito' })
    entidadeB = await create('entidades', { tenant: tenantB.id, slug: 'conceito', nome: 'Conceito B', tipo: 'conceito' })
    ofertaA = await create('ofertas_editoriais', { ...dados('canonica'), comissao_taxa: '0.1234', comissao_estimada: '99.99', entidades: [{ entidade: entidadeA.id, prioridade: -1 }] })
    ofertaB = await create('ofertas_editoriais', { ...dados('canonica'), tenant: tenantB.id })
  }, 120_000)
  afterAll(async () => {
    if (payload) { await payload.db.dropDatabase({ adapter: payload.db as never }); await payload.destroy() }
    vi.unstubAllEnvs()
  })

  it('cria draft sem preço e preserva decimais, métricas nullable e timestamp original', async () => {
    const r = await request('/ofertas_editoriais', 'POST', { ...dados('decimal'), preco: '00012.30', disclosure: false, atualizado_na_origem: '2020-01-01T00:00:00Z',
      evidencia_comercial: { vendas: null, numero_avaliacoes: 12, observado_em: null } })
    expect(r.status).toBe(201)
    expect(r.body.doc._status).toBe('draft')
    expect(r.body.doc.preco).toBe('12.30')
    expect(r.body.doc.disclosure).toBe(false)
    expect(r.body.doc.evidencia_comercial.vendas).toBeNull()
    expect(r.body.doc.evidencia_comercial.observado_em).toBeNull()
    expect(r.body.doc.atualizado_na_origem).toBe('2020-01-01T00:00:00.000Z')
    expect((await request(`/ofertas_editoriais/${ofertaA.id}`)).body.preco).toBeNull()
    erro(await request('/ofertas_editoriais', 'POST', { ...dados('float'), preco: 12.3 }), 'preco')
    expect((await request('/ofertas_editoriais', 'POST', { ...dados('publicacao-implicita'), _status: 'published' })).status).toBe(403)
  })
  it('campos privados só aparecem à key interna; tenant B não aparece nem em versions', async () => {
    const publico = await request(`/ofertas_editoriais/${ofertaA.id}`, 'GET', undefined, keyAgente)
    expect(publico.status).toBe(200)
    for (const campo of ['url_afiliado', 'comissao_taxa', 'comissao_estimada']) expect(publico.body).not.toHaveProperty(campo)
    expect((await request(`/ofertas_editoriais/${ofertaA.id}`)).body.comissao_taxa).toBe('0.1234')
    expect((await request(`/ofertas_editoriais/${ofertaB.id}`)).status).toBe(404)
    expect((await request(`/ofertas_editoriais/versions?where[version.tenant][equals]=${tenantB.id}`)).body.docs).toEqual([])
    const versoes = await request(`/ofertas_editoriais/versions?where[parent][equals]=${ofertaA.id}`, 'GET', undefined, keyAgente)
    expect(versoes.status).toBe(200)
    expect(JSON.stringify(versoes.body)).not.toContain('https://loja.example/item')
    expect(JSON.stringify(versoes.body)).not.toContain('0.1234')
    erro(await request(`/ofertas_editoriais/${ofertaA.id}`, 'PATCH', { tenant: tenantB.id }), 'tenant')
  })
  it('preserva slug legado sensível a caixa, sem aceitar separadores ou caracteres de URL', async () => {
    for (const slug of ['Oferta-Amazon-ABC123', 'oferta-amazon-abc123']) {
      const r = await request('/ofertas_editoriais', 'POST', dados(slug))
      expect(r.status).toBe(201)
      expect(r.body.doc.slug).toBe(slug)
      const lida = await request(`/ofertas_editoriais?where[slug][equals]=${slug}`)
      expect(lida.body.docs).toHaveLength(1)
      expect(lida.body.docs[0].slug).toBe(slug)
    }
    for (const slug of ['a/b', 'a?b', 'a%2Fb', '..', 'a b']) {
      erro(await request('/ofertas_editoriais', 'POST', dados(slug)), 'slug')
    }
  })
  it('ingestão só salva draft, sistema SSR não ganha permissão de escrita editorial', async () => {
    const r = await request('/ofertas_editoriais', 'POST', dados('importada'), 'ofertas-importador-fixture')
    expect(r.status).toBe(201)
    expect((await request(`/ofertas_editoriais/${r.body.doc.id}`, 'PATCH', { _status: 'published' }, 'ofertas-importador-fixture')).status).toBe(403)
    expect((await request('/ofertas_editoriais', 'POST', dados('ssr-nao-escreve'), 'ofertas-ssr-fixture')).status).toBe(403)
  })
  it('agente edita nome mas não campos comerciais privados, nem com null/overrideAccess', async () => {
    expect((await request(`/ofertas_editoriais/${ofertaA.id}`, 'PATCH', { nome: 'Nome editorial revisado' }, keyAgente)).status).toBe(200)
    for (const data of [{ url_afiliado: null }, { comissao_taxa: '0.9999' }, { comissao_estimada: null }]) {
      expect((await request(`/ofertas_editoriais/${ofertaA.id}`, 'PATCH', data, keyAgente)).status).toBe(403)
    }
    const users = await payload.find({ collection: 'users', where: { email: { equals: 'ofertas-agente@example.test' } } })
    await expect(payload.update({ collection: 'ofertas_editoriais' as never, id: ofertaA.id, data: { url_afiliado: 'https://loja.example/injetado' } as never,
      user: { ...users.docs[0]!, collection: 'users' }, overrideAccess: true })).rejects.toMatchObject({ status: 403 })
  })
  it('identidade e entidades são validadas até em PATCH null/Local API', async () => {
    erro(await request(`/ofertas_editoriais/${ofertaA.id}`, 'PATCH', { origem: null }), 'origem')
    erro(await request(`/ofertas_editoriais/${ofertaA.id}`, 'PATCH', { slug: 'trocado' }), 'slug')
    erro(await request('/ofertas_editoriais', 'POST', { ...dados('outra'), origem: ofertaA.origem }), 'origem')
    const external = await request('/ofertas_editoriais', 'POST', { ...dados('externa'), external_id: 'ID-1' })
    expect(external.status).toBe(201)
    erro(await request('/ofertas_editoriais', 'POST', { ...dados('externa-duplicada'), external_id: 'ID-1' }), 'external_id')
    await expect(create('ofertas_editoriais', { ...dados('cross'), entidades: [{ entidade: entidadeB.id, prioridade: 1 }] }))
      .rejects.toMatchObject({ data: { errors: expect.arrayContaining([expect.objectContaining({ path: 'entidades.0.entidade' })]) } })
    erro(await request('/ofertas_editoriais', 'POST', { ...dados('duplicada'), entidades: [{ entidade: entidadeA.id, prioridade: 1 }, { entidade: entidadeA.id, prioridade: 2 }] }), 'entidades.1.entidade')
  })
  it('draft conserva host pendente, mas publish/edição publicada falha fechado', async () => {
    const r = await request('/ofertas_editoriais', 'POST', { ...dados('host-pendente'), url_afiliado: 'https://nao-aprovado.example/p' })
    expect(r.status).toBe(201)
    erro(await request(`/ofertas_editoriais/${r.body.doc.id}`, 'PATCH', { _status: 'published' }), 'url_afiliado')
    expect((await request(`/ofertas_editoriais/${ofertaA.id}`, 'PATCH', { _status: 'published' })).status).toBe(200)
    erro(await request(`/ofertas_editoriais/${ofertaA.id}`, 'PATCH', { url_afiliado: 'https://evil.example/p' }), 'url_afiliado')
    erro(await request(`/ofertas_editoriais/${ofertaA.id}`, 'PATCH', { url_afiliado: null }), 'url_afiliado')
  })
  it('espelhos preservam busca/exato/equivalente e recusam self/cadeia/cross-tenant', async () => {
    for (const correspondencia of ['exato', 'equivalente', 'busca']) {
      const r = await request('/ofertas_editoriais', 'POST', { ...dados(`espelho-${correspondencia}`), espelho_de: ofertaA.id, correspondencia })
      expect(r.status).toBe(201)
      expect(r.body.doc.correspondencia).toBe(correspondencia)
      erro(await request('/ofertas_editoriais', 'POST', { ...dados(`cadeia-${correspondencia}`), espelho_de: r.body.doc.id, correspondencia: 'exato' }), 'espelho_de')
    }
    erro(await request(`/ofertas_editoriais/${ofertaA.id}`, 'PATCH', { espelho_de: ofertaA.id, correspondencia: 'exato' }), 'espelho_de')
    erro(await request('/ofertas_editoriais', 'POST', { ...dados('espelho-cross'), espelho_de: ofertaB.id, correspondencia: 'exato' }), 'espelho_de')
  })
  it('corridas de ciclo e origem não comprometem invariantes', async () => {
    const a = await create('ofertas_editoriais', dados('corrida-a')), b = await create('ofertas_editoriais', dados('corrida-b'))
    const result = await Promise.all([request(`/ofertas_editoriais/${a.id}`, 'PATCH', { espelho_de: b.id, correspondencia: 'exato' }), request(`/ofertas_editoriais/${b.id}`, 'PATCH', { espelho_de: a.id, correspondencia: 'exato' })])
    expect(result.map(r => r.status).sort()).toEqual([200, 400])
    const dup = await Promise.all([request('/ofertas_editoriais', 'POST', dados('corrida-origem')), request('/ofertas_editoriais', 'POST', dados('corrida-origem'))])
    expect(dup.map(r => r.status).sort()).toEqual([201, 400])
  })
  it('verificações preservam null/false/data antiga e são append-only com ator do servidor', async () => {
    const r = await request('/verificacoes_ofertas_editoriais', 'POST', { tenant: tenantA.id, origem: 'legacy:check:1', oferta: ofertaA.id,
      verificado_em: '2020-01-01T00:00:00Z', link_ativo: null, preco_visto: null, disponivel: false, ator: 999999 })
    expect(r.status).toBe(201)
    expect(r.body.doc.link_ativo).toBeNull()
    expect(r.body.doc.disponivel).toBe(false)
    expect(r.body.doc.preco_visto).toBeNull()
    expect(r.body.doc.ator).not.toBe(999999)
    expect((await request(`/verificacoes_ofertas_editoriais/${r.body.doc.id}`, 'PATCH', { nota: 'reescrever' })).status).toBe(403)
    await expect(payload.update({ collection: 'verificacoes_ofertas_editoriais' as never, id: r.body.doc.id, data: { nota: 'override não contorna auditoria' } as never }))
      .rejects.toMatchObject({ status: 400 })
    await expect(payload.delete({ collection: 'verificacoes_ofertas_editoriais' as never, id: r.body.doc.id })).rejects.toMatchObject({ status: 400 })
  })
  it('lê só o último check de cada oferta publicada do tenant, em um SQL', async () => {
    const indices = await payload.db.drizzle.execute(sql`SELECT indexdef FROM pg_indexes WHERE tablename = 'verificacoes_ofertas_editoriais'`)
    expect(indices.rows.some(row => /\(tenant_id, oferta_id, verificado_em\)/.test(String(row.indexdef)))).toBe(true)
    const a = (await request('/ofertas_editoriais', 'POST', dados('lote-check-a'))).body.doc
    const b = (await request('/ofertas_editoriais', 'POST', dados('lote-check-b'))).body.doc
    const draft = (await request('/ofertas_editoriais', 'POST', dados('lote-check-draft'))).body.doc
    for (const oferta of [a, b]) expect((await request(`/ofertas_editoriais/${oferta.id}`, 'PATCH', { _status: 'published' })).status).toBe(200)
    const checks = [
      { oferta: a.id, data: '2022-01-01T00:00:00Z', origem: 'lote-a-antigo', ativo: true },
      { oferta: a.id, data: '2024-01-01T00:00:00Z', origem: 'lote-a-recente', ativo: false },
      { oferta: b.id, data: '2023-01-01T00:00:00Z', origem: 'lote-b', ativo: null },
      { oferta: draft.id, data: '2025-01-01T00:00:00Z', origem: 'lote-draft', ativo: true },
    ]
    const criados = []
    for (const check of checks) {
      const r = await request('/verificacoes_ofertas_editoriais', 'POST', { tenant: tenantA.id, origem: check.origem,
        oferta: check.oferta, verificado_em: check.data, link_ativo: check.ativo })
      expect(r.status).toBe(201)
      criados.push(r.body.doc)
    }
    let consultas = 0
    const executar = async (sql: Parameters<typeof payload.db.drizzle.execute>[0]) => {
      consultas++
      return payload.db.drizzle.execute(sql)
    }
    const resultado = await ultimasVerificacoesOfertas(executar, tenantA.id, [a.id, b.id, draft.id, ofertaB.id, a.id])
    expect(consultas).toBe(1)
    expect(resultado).toEqual([
      { id: criados[1].id, ofertaId: a.id, verificadoEm: '2024-01-01T00:00:00.000Z', linkAtivo: false, disponivel: null, precoVisto: null },
      { id: criados[2].id, ofertaId: b.id, verificadoEm: '2023-01-01T00:00:00.000Z', linkAtivo: null, disponivel: null, precoVisto: null },
    ])
    expect(await ultimasVerificacoesOfertas(executar, tenantB.id, [a.id, b.id])).toEqual([])
    expect(await ultimasVerificacoesOfertas(executar, tenantA.id, [])).toEqual([])
    expect(consultas).toBe(2)
    await expect(ultimasVerificacoesOfertas(executar, tenantA.id, Array(101).fill(a.id))).rejects.toThrow('até 100')
    await expect(ultimasVerificacoesOfertas(executar, tenantA.id, [a.id, -1])).rejects.toThrow('IDs válidos')
    await expect(ultimasVerificacoesOfertas(executar, tenantA.id, [2_147_483_648])).rejects.toThrow('IDs válidos')
    expect(consultas).toBe(2)
  })
  it('picks têm vocabulário, papel único, tenant e bloqueio published→oferta draft', async () => {
    const draft = await create('ofertas_editoriais', dados('pick-draft'))
    const post = await request('/posts', 'POST', { tenant: tenantA.id, titulo: 'Escolhas documentadas', slug: 'escolhas', corpo_md: 'Rascunho.', escolhas: [{ oferta: draft.id, papel: 'principal', posicao: -1 }] })
    expect(post.status).toBe(201)
    erro(await request(`/posts/${post.body.doc.id}`, 'PATCH', { _status: 'published' }), 'escolhas.0.oferta')
    erro(await request(`/posts/${post.body.doc.id}`, 'PATCH', { escolhas: [{ oferta: ofertaB.id, papel: 'principal', posicao: 0 }] }), 'escolhas.0.oferta')
    erro(await request(`/posts/${post.body.doc.id}`, 'PATCH', { escolhas: [{ oferta: ofertaA.id, papel: 'inventado', posicao: 0 }] }), 'escolhas.0.papel')
    erro(await request(`/posts/${post.body.doc.id}`, 'PATCH', { escolhas: [{ oferta: ofertaA.id, papel: 'principal', posicao: 0 }, { oferta: ofertaA.id, papel: 'principal', posicao: 1 }] }), 'escolhas.1.papel')
    expect((await request(`/posts/${post.body.doc.id}`, 'PATCH', { escolhas: [{ oferta: ofertaA.id, papel: 'principal', posicao: 0 }], _status: 'published' })).status).toBe(200)
  })
})
