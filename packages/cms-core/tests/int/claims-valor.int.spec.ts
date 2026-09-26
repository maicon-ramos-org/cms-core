/** REST/PG16 real, dados sintéticos e banco exclusivo; nenhum acervo de instância. */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload, handleEndpoints, ValidationError, type Payload, type Plugin, type SanitizedConfig } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cmsCore } from '../../src/fabrica'
import { grafoEditorial } from '../../src/grafo'
import { preparaOperacaoValorClaim, preservaLeituraDoValorVersionado, preservaValorClaim } from '../../src/grafo/valor-claim'
import { VALORES_CLAIM, valorNoWire } from '../fixtures/claims-valores'

const semBanco = !process.env.DATABASE_URL
it.runIf(semBanco && process.env.CI)('CI exige Postgres para preservar JSON das claims', () => expect(process.env.DATABASE_URL).toBeTruthy())

// Extensão da instância: o core não ganha campo de proveniência nem afrouxa sua trava.
const provenienciaFixture: Plugin = config => ({ ...config, collections: config.collections?.map(c => c.slug !== 'claims' ? c : {
  ...c, fields: [...c.fields, { name: 'status_na_origem', type: 'select', options: ['vigente', 'desatualizada', 'contestada'] }],
  hooks: { ...c.hooks, beforeValidate: [...(c.hooks?.beforeValidate ?? []), ({ data, originalDoc, req }) => {
    const antes = originalDoc?.status_na_origem
    const atual = data?.status_na_origem === undefined ? antes : data.status_na_origem
    if (antes != null && (atual !== antes || (req.context.isRestoringVersion && data?.status_na_origem !== antes))) {
      throw new ValidationError({ errors: [{ path: 'status_na_origem', message: 'Proveniência preenchida é imutável.' }] })
    }
    return data
  }] },
}) })

// Equivalente ao runtime .6: retira EXATAMENTE os três hooks acrescentados na .7.
// Nenhum DML direto, parser customizado ou alteração nas coleções restantes.
const grafoAntesDaCorrecao: Plugin = config => {
  const banco = config.db
  return { ...config, db: { ...banco, init: args => {
    const adapter = banco.init(args) as PostgresAdapter
    adapter.afterSchemaInit = adapter.afterSchemaInit.filter(h => h !== preservaLeituraDoValorVersionado)
    return adapter
  } }, collections: config.collections?.map(c => c.slug !== 'claims' ? c : {
    ...c, hooks: { ...c.hooks, beforeOperation: c.hooks?.beforeOperation?.filter(h => h !== preparaOperacaoValorClaim) },
    fields: c.fields.map(f => f.type !== 'json' || f.name !== 'valor' ? f : { ...f,
      hooks: { ...f.hooks, beforeValidate: f.hooks?.beforeValidate?.filter(h => h !== preservaValorClaim) } }),
  }) }
}

describe.skipIf(semBanco)('claims.valor nativo atravessa PATCH, versões e restore', () => {
  let payload: Payload, config: SanitizedConfig
  let tenantA: any, tenantB: any, entidadeA: any, fonteA: any, agenteA: any, agenteB: any
  let sequencia = 0
  const anteriores: Array<{ id: number | string; versao: number | string; valor: string; rawDoc: string; rawVersao: string }> = []
  const raw = async (id: number | string, versao: number | string) => {
    const pool = (payload.db as unknown as PostgresAdapter).pool
    return {
      rawDoc: (await pool.query('SELECT row_to_json(t)::text AS bytes FROM claims t WHERE id = $1', [id])).rows[0].bytes as string,
      rawVersao: (await pool.query('SELECT row_to_json(t)::text AS bytes FROM _claims_v t WHERE id = $1', [versao])).rows[0].bytes as string,
    }
  }
  const keyA = 'claims-json-fixture-agente-a', keyB = 'claims-json-fixture-agente-b', keySistema = 'claims-json-fixture-sistema'
  const request = async (path: string, method = 'GET', body?: unknown, key: string | null = keyA) => {
    const r = await handleEndpoints({ config, payloadInstanceCacheKey: 'claims-json-fixture', request: new Request('http://fixture.test/api' + path, {
      method, headers: { 'content-type': 'application/json', ...(key ? { authorization: `users API-Key ${key}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }) })
    return { status: r.status, body: await r.json() as any }
  }
  const criaLocal = (collection: string, data: Record<string, unknown>) => payload.create({ collection: collection as never, data: data as never, depth: 0 })
  const cria = async (valor: unknown) => {
    const r = await request('/claims', 'POST', { tenant: tenantA.id, entidade: entidadeA.id, fonte: fonteA.id,
      texto: 'Texto editorial original', status: 'revisar', origem: `legacy:claim:${++sequencia}`, valor: valorNoWire(valor) })
    expect(r.status).toBe(201)
    expect(r.body.doc.valor).toEqual(valor)
    return r.body.doc
  }
  const versoes = (id: number | string) => payload.findVersions({ collection: 'claims' as never, where: { parent: { equals: id } }, sort: '-updatedAt', limit: 50, depth: 0 })
  const eventos = (id: number) => payload.find({ collection: 'eventos' as never, where: { and: [{ colecao: { equals: 'claims' } }, { doc: { equals: String(id) } }] }, sort: '-createdAt', limit: 50, depth: 0 })
  const erroPath = (r: { status: number; body: any }, path: string) => {
    expect(r.status).toBe(400)
    expect(r.body.errors.flatMap((e: any) => e.data?.errors ?? [])).toContainEqual(expect.objectContaining({ path }))
  }

  beforeAll(async () => {
    const banco = new URL(process.env.DATABASE_URL!)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(banco.hostname)) throw new Error('Fixture exige PostgreSQL loopback isolado.')
    banco.pathname = '/cms_core_teste_claims_json'
    vi.stubEnv('PAYLOAD_DB_PUSH', '1'); vi.stubEnv('PAYLOAD_DROP_DATABASE', 'true')
    vi.stubEnv('PAYLOAD_SECRET', 'claims-json-fixture-sem-segredo-real'); vi.stubEnv('REVALIDATE_URL', '')
    const pasta = mkdtempSync(join(tmpdir(), 'cms-claims-json-'))
    const monta = (plugins: Plugin[]) => cmsCore({ raiz: pasta, pastaDeMigracoes: pasta, db: { connectionString: banco.toString() },
      logger: { options: { level: 'silent' } }, plugins,
      midia: { r2: { bucket: 'fixture', endpoint: 'https://bucket.invalid', publicBase: 'https://media.invalid',
        credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' } } } })
    const configAnterior = await monta([grafoEditorial(), provenienciaFixture, grafoAntesDaCorrecao])
    payload = await getPayload({ config: configAnterior, key: 'claims-json-anterior-fixture', disableOnInit: true })
    tenantA = await criaLocal('tenants', { nome: 'Tenant A', slug: 'a', canonical_host: 'a.fixture.test' })
    tenantB = await criaLocal('tenants', { nome: 'Tenant B', slug: 'b', canonical_host: 'b.fixture.test' })
    const usuario = (email: string, apiKey: string, tenant: number, roles: string[]) => criaLocal('users', {
      nome: 'Fixture', email, password: 'senha-fixture', roles, enableAPIKey: true, apiKey, tenants: [{ tenant }],
    })
    agenteA = await usuario('a@fixture.test', keyA, tenantA.id, ['agente'])
    agenteB = await usuario('b@fixture.test', keyB, tenantB.id, ['agente'])
    await usuario('sistema@fixture.test', keySistema, tenantA.id, ['sistema'])
    entidadeA = await criaLocal('entidades', { tenant: tenantA.id, nome: 'Entidade', slug: 'entidade', tipo: 'conceito' })
    fonteA = await criaLocal('fontes', { tenant: tenantA.id, url: 'https://fonte.fixture.test/estudo', tier: 1 })
    for (const valor of ['12', 'null', 'false', '{}', '[]', '"texto"']) {
      const doc = await criaLocal('claims', { tenant: tenantA.id, entidade: entidadeA.id, fonte: fonteA.id,
        texto: 'Versão criada antes da correção', origem: `fixture:anterior:${++sequencia}`, status_na_origem: 'vigente', valor: valorNoWire(valor) })
      expect((await payload.findByID({ collection: 'claims' as never, id: doc.id })).valor).toEqual(valor)
      // Segunda versão também é gravada pelo runtime anterior, não só create.
      await payload.update({ collection: 'claims' as never, id: doc.id,
        data: { texto: 'Versão editada antes da correção', valor: valorNoWire(valor) } as never })
      const versao = (await versoes(doc.id)).docs[0]!
      expect(versao.version.valor).toEqual(JSON.parse(valor)) // reproduz o decode antigo
      anteriores.push({ id: doc.id, versao: versao.id, valor, ...await raw(doc.id, versao.id) })
    }
    await payload.destroy()
    // Upgrade de runtime NO MESMO BANCO, sem push, drop, migration ou reescrita.
    vi.stubEnv('PAYLOAD_DB_PUSH', '0'); vi.stubEnv('PAYLOAD_DROP_DATABASE', 'false')
    config = await monta([grafoEditorial(), provenienciaFixture])
    payload = await getPayload({ config, key: 'claims-json-fixture', disableOnInit: true })
  }, 120_000)
  afterAll(async () => {
    if (payload) { await payload.db.dropDatabase({ adapter: payload.db as never }); await payload.destroy() }
    vi.unstubAllEnvs()
  })

  it('upgrade equivalente .6 → .7 lê/restaura versões antigas sem reescrever bytes SQL', async () => {
    for (const anterior of anteriores) {
      expect(await raw(anterior.id, anterior.versao)).toEqual({ rawDoc: anterior.rawDoc, rawVersao: anterior.rawVersao })
      expect((await request(`/claims/${anterior.id}`)).body.valor).toBe(anterior.valor)
      expect((await versoes(anterior.id)).docs.every(v => v.version.valor === anterior.valor)).toBe(true)
      expect((await request(`/claims/versions/${anterior.versao}`)).body.version.valor).toBe(anterior.valor)
      expect(await raw(anterior.id, anterior.versao)).toEqual({ rawDoc: anterior.rawDoc, rawVersao: anterior.rawVersao })
      expect((await request(`/claims/${anterior.id}`, 'PATCH', { valor: valorNoWire('valor atual diferente') })).status).toBe(200)
      const restaurada = await request(`/claims/versions/${anterior.versao}`, 'POST')
      expect(restaurada.status).toBe(200)
      expect(restaurada.body.valor).toBe(anterior.valor)
      expect((await raw(anterior.id, anterior.versao)).rawVersao).toBe(anterior.rawVersao)
    }
  })

  it('diagnóstico read-only separa JSONB persistido do decode de versões', async () => {
    for (const valor of ['12%', '12', 'null', '{}', '[]', '"texto"', '', { valor: '12' }, [null, 'null'], 12, null]) {
      const doc = await cria(valor)
      const pool = (payload.db as unknown as PostgresAdapter).pool
      const atual = (await pool.query('SELECT valor::text AS texto FROM claims WHERE id = $1', [doc.id])).rows[0].texto
      const versao = (await pool.query('SELECT version_valor::text AS texto FROM _claims_v WHERE parent_id = $1 ORDER BY id DESC LIMIT 1', [doc.id])).rows[0].texto
      expect(atual === null ? null : JSON.parse(atual)).toEqual(valorNoWire(valor))
      expect(versao === null ? null : JSON.parse(versao)).toEqual(valor)
      const lido = (await request(`/claims/${doc.id}`)).body.valor
      const versionado = (await versoes(doc.id)).docs[0]!.version.valor
      expect(lido).toEqual(valor)
      expect(versionado).toEqual(valor)
    }
  })

  it('mapper não altera schema/migration nem outros JSONB do grafo', async () => {
    const db = payload.db as unknown as PostgresAdapter
    const coluna = db.tables._claims_v!.version_valor!
    const mapper = coluna.mapFromDriverValue
    const { generateDrizzleJson, generateMigration } = db.requireDrizzleKit()
    const depois = generateDrizzleJson(db.schema)
    let antes: ReturnType<typeof generateDrizzleJson>
    try {
      // Só na fixture, sem consulta concorrente: o schema anterior usa o mapper
      // original do protótipo. Nenhum dado ou metadado SQL é alterado.
      coluna.mapFromDriverValue = Object.getPrototypeOf(coluna).mapFromDriverValue
      antes = generateDrizzleJson(db.schema)
    } finally { coluna.mapFromDriverValue = mapper }
    expect(await generateMigration(antes, depois)).toEqual([])
    for (const valor of [{ valor: '12', numero: 12 }, ['null', null], 12, null]) {
      const doc = await criaLocal('entidades', { tenant: tenantA.id, nome: 'Outro JSONB', slug: `json-${++sequencia}`, tipo: 'conceito', saude: valor })
      expect((await request(`/entidades/${doc.id}`)).body.saude).toEqual(valor)
      const lista = await request(`/entidades/versions?where[parent][equals]=${doc.id}`)
      expect(lista.body.docs[0].version.saude).toEqual(valor)
      expect((await request(`/entidades/${doc.id}`, 'PATCH', { nome: 'Edição preservando JSONB' })).status).toBe(200)
      expect((await request(`/entidades/versions/${lista.body.docs[0].id}`, 'POST')).body.saude).toEqual(valor)
    }
  })

  it.each(VALORES_CLAIM)('PATCH mínimo/editorial preserva %s, versões e eventos', async (_nome, valor) => {
    const doc = await cria(valor)
    const antes = await versoes(doc.id), auditoria = await eventos(doc.id)
    const anotada = await request(`/claims/${doc.id}`, 'PATCH', { status_na_origem: 'desatualizada' })
    expect(anotada.status).toBe(200)
    expect(anotada.body.doc).toMatchObject({ valor, status: 'revisar', status_na_origem: 'desatualizada' })
    const editada = await request(`/claims/${doc.id}`, 'PATCH', { texto: 'Edição editorial sem valor' })
    expect(editada.status).toBe(200)
    expect((await request(`/claims/${doc.id}`)).body.valor).toEqual(valor)
    const depois = await versoes(doc.id), eventosDepois = await eventos(doc.id)
    expect(depois.totalDocs).toBe(antes.totalDocs + 2)
    expect(depois.docs.every(v => v.version.valor === null ? valor === null : JSON.stringify(v.version.valor) === JSON.stringify(valor))).toBe(true)
    expect(eventosDepois.totalDocs).toBe(auditoria.totalDocs + 2)
    expect(eventosDepois.docs[0]).toMatchObject({ ator: agenteA.id, acao: 'update', campos: expect.arrayContaining(['texto']) })
    expect(eventosDepois.docs[0]!.campos).not.toContain('valor')
    expect(eventosDepois.docs[1]!.campos).not.toContain('valor')
  })

  it.each(VALORES_CLAIM)('restore de versão anotada preserva %s, não o valor atual', async (_nome, valor) => {
    const doc = await cria(valor)
    expect((await request(`/claims/${doc.id}`, 'PATCH', { status_na_origem: 'vigente', valor: valorNoWire(valor) })).status).toBe(200)
    const alvo = (await versoes(doc.id)).docs[0]!
    expect(alvo.version.valor).toEqual(valor)
    expect((await request(`/claims/${doc.id}`, 'PATCH', { texto: 'Outro texto', valor: valorNoWire('outro valor atual') })).status).toBe(200)
    const antes = await versoes(doc.id), auditoria = await eventos(doc.id)
    const restaurada = await request(`/claims/versions/${alvo.id}`, 'POST')
    expect(restaurada.status).toBe(200)
    expect(restaurada.body).toMatchObject({ valor, texto: 'Texto editorial original', status: 'revisar', status_na_origem: 'vigente' })
    expect((await request(`/claims/${doc.id}`)).body.valor).toEqual(valor)
    const depois = await versoes(doc.id), eventosDepois = await eventos(doc.id)
    expect(depois.totalDocs).toBe(antes.totalDocs + 1)
    expect(depois.docs[0]!.version.valor).toEqual(valor)
    expect(eventosDepois.totalDocs).toBe(auditoria.totalDocs + 1)
    expect(eventosDepois.docs[0]).toMatchObject({ ator: agenteA.id, campos: expect.arrayContaining(['valor', 'texto']) })
    expect((await request(`/claims/versions/${alvo.id}`)).body.version.valor).toEqual(valor)
  })

  it('entrada explícita inválida continua 400/path e HTTP não forja restore', async () => {
    const doc = await cria('12%')
    const antes = await versoes(doc.id), auditoria = await eventos(doc.id)
    for (const valor of ['12%', '', '{', 'linha\nquebra']) {
      erroPath(await request(`/claims/${doc.id}?isRestoringVersion=true`, 'PATCH', { valor, context: { isRestoringVersion: true } }), 'valor')
    }
    expect((await request(`/claims/${doc.id}`)).body.valor).toBe('12%')
    expect((await versoes(doc.id)).totalDocs).toBe(antes.totalDocs)
    expect((await eventos(doc.id)).totalDocs).toBe(auditoria.totalDocs)
    // Contrato textual explícito do Payload permanece, sem wrapping automático.
    expect((await request(`/claims/${doc.id}`, 'PATCH', { valor: '12' })).body.doc.valor).toBe(12)
    expect((await request(`/claims/${doc.id}`, 'PATCH', { valor: 'null' })).body.doc.valor).toBeNull()
  })

  it('restore de versão não anotada continua bloqueado pela extensão, sem escrita parcial', async () => {
    const doc = await cria('null')
    const antiga = (await versoes(doc.id)).docs[0]!
    expect((await request(`/claims/${doc.id}`, 'PATCH', { status_na_origem: 'contestada', valor: valorNoWire('12%') })).status).toBe(200)
    const antes = await versoes(doc.id), auditoria = await eventos(doc.id)
    erroPath(await request(`/claims/versions/${antiga.id}`, 'POST'), 'status_na_origem')
    expect((await request(`/claims/${doc.id}`)).body).toMatchObject({ valor: '12%', status_na_origem: 'contestada', status: 'revisar' })
    expect((await versoes(doc.id)).totalDocs).toBe(antes.totalDocs)
    expect((await eventos(doc.id)).totalDocs).toBe(auditoria.totalDocs)
  })

  it('ACL de papel, tenant, anonimato, versões e Local API permanece', async () => {
    const doc = await cria('12%')
    const alvo = (await versoes(doc.id)).docs[0]!
    const antes = await versoes(doc.id), auditoria = await eventos(doc.id)
    for (const key of [keyB, keySistema, null]) {
      expect([403, 404]).toContain((await request(`/claims/${doc.id}`, 'PATCH', { texto: 'Proibido' }, key)).status)
      expect([403, 404]).toContain((await request(`/claims/versions/${alvo.id}`, 'POST', undefined, key)).status)
    }
    expect((await request('/claims/versions', 'GET', undefined, keyB)).body.docs).toEqual([])
    await expect(payload.update({ collection: 'claims' as never, id: doc.id, data: { texto: 'Proibido por tenant' } as never,
      user: { ...agenteB, collection: 'users' }, overrideAccess: true })).rejects.toMatchObject({ status: 403 })
    expect((await versoes(doc.id)).totalDocs).toBe(antes.totalDocs)
    expect((await eventos(doc.id)).totalDocs).toBe(auditoria.totalDocs)
    const local = await payload.update({ collection: 'claims' as never, id: doc.id, data: { texto: 'Edição Local API' } as never,
      user: { ...agenteA, collection: 'users' }, overrideAccess: false, depth: 0 })
    expect(local.valor).toBe('12%')
    const campo = config.collections.find(c => c.slug === 'claims')!.fields.find(f => 'name' in f && f.name === 'valor')!
    expect(campo.type).toBe('json')
    expect('access' in campo ? campo.access?.update : undefined).toBeUndefined()
  })

  it('mesmo req após restore não serializa input explícito nem aceita JSON inválido', async () => {
    const doc = await cria('12%')
    const versao = (await versoes(doc.id)).docs[0]!
    const req = await createLocalReq({ user: { ...agenteA, collection: 'users' }, context: {} }, payload)
    const comum = { collection: 'claims' as never, req, overrideAccess: false, depth: 0 }
    expect((await payload.restoreVersion({ ...comum, id: versao.id })).valor).toBe('12%')
    expect(req.context.isRestoringVersion).toBe(true)
    const explicita = await payload.update({ ...comum, id: doc.id, data: { valor: '12' } as never })
    expect(explicita.valor).toBe(12)
    expect(req.context.isRestoringVersion).toBeUndefined()
    await expect(payload.update({ ...comum, id: doc.id, data: { valor: '12%' } as never })).rejects.toMatchObject({
      status: 400, data: { errors: expect.arrayContaining([expect.objectContaining({ path: 'valor' })]) },
    })
    expect((await request(`/claims/${doc.id}`)).body.valor).toBe(12)
  })
})
