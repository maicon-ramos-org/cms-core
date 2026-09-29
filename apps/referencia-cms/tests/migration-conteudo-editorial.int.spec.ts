/**
 * Migration `20260929_125623_conteudo_editorial_produto` contra um schema ANTIGO POPULADO, em banco
 * descartável criado só para o teste (nunca o `DATABASE_URL` em si). As migrations anteriores são as
 * reais; nenhum SQL de schema é reescrito aqui.
 *
 * - `up` é aditivo: as colunas e os dados legados ficam idênticos, e as novas nascem com o default
 *   editorial (`sem_conteudo`, `indexavel=false`, resto NULL).
 * - `down` é DESTRUTIVO: derruba as colunas novas e, com elas, todo o conteúdo editorial gravado.
 *   O teste prova isso (o conteúdo não volta num `up` seguinte); não há rollback sem perda.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as inicial from '../src/migrations/20260924_112918_inicial'
import * as agenda from '../src/migrations/20260924_234833_agenda_snapshot'
import * as paginas from '../src/migrations/20260927_165242_pages_navegacao'
import * as conteudo from '../src/migrations/20260929_125623_conteudo_editorial_produto'

const semBanco = !process.env.DATABASE_URL
it.runIf(semBanco && process.env.CI)('CI exige Postgres para testar a migration de conteúdo editorial', () => expect(process.env.DATABASE_URL).toBeTruthy())

const BANCO = 'cms_core_teste_migration_conteudo'
const NOVAS = ['meta_title', 'meta_description', 'resumo', 'descricao_markdown', 'destaques', 'faq', 'facts_hash', 'content_generator',
  'prompt_version', 'content_version', 'editorial_status', 'editorial_refresh_em', 'editorial_refresh_motivo', 'indexavel']
const NOVAS_VERSAO = NOVAS.map(c => `version_${c}`)
const TIPOS_NOVOS = ['enum_produtos_fisicos_editorial_status', 'enum__produtos_fisicos_v_version_editorial_status']

describe.skipIf(semBanco)('migration de conteúdo editorial sobre schema legado populado', () => {
  let admin: pg.Pool, pool: pg.Pool
  const db = () => drizzle(pool)
  const roda = (m: { up: (a: any) => Promise<void> }) => db().transaction(tx => m.up({ db: tx, payload: undefined, req: undefined }))
  const desce = (m: { down: (a: any) => Promise<void> }) => db().transaction(tx => m.down({ db: tx, payload: undefined, req: undefined }))
  const linhas = async (texto: string, params: unknown[] = []) => (await pool.query(texto, params)).rows
  const colunas = (tabela: string) => linhas(
    `SELECT column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 ORDER BY column_name`, [tabela])
  const nomes = async (tabela: string) => (await colunas(tabela)).map(c => c.column_name as string)
  const tipos = async () => (await linhas(`SELECT typname FROM pg_type WHERE typname = ANY($1) ORDER BY typname`, [TIPOS_NOVOS])).map(r => r.typname as string)

  let antes: { produtos: any[]; versoes: any[]; variantes: any[]; tenants: any[]; colProdutos: any[]; colVersoes: any[] }
  const lerLegado = async () => ({
    produtos: await linhas('SELECT id, tenant_id, nome, slug, marca, modelo, categoria, descricao, gtin, mpn, especificacoes, estado, updated_at, created_at FROM produtos_fisicos ORDER BY id'),
    versoes: await linhas(`SELECT id, parent_id, version_tenant_id, version_nome, version_slug, version_marca, version_modelo, version_categoria,
      version_descricao, version_gtin, version_mpn, version_especificacoes, version_estado, version_updated_at, version_created_at, created_at, updated_at
      FROM _produtos_fisicos_v ORDER BY id`),
    variantes: await linhas('SELECT * FROM variantes_produto ORDER BY id'),
    tenants: await linhas('SELECT id, slug, nome, canonical_host FROM tenants ORDER BY id'),
    colProdutos: await colunas('produtos_fisicos'),
    colVersoes: await colunas('_produtos_fisicos_v'),
  })

  beforeAll(async () => {
    const base = new URL(process.env.DATABASE_URL!)
    admin = new pg.Pool({ connectionString: base.toString(), max: 1 })
    await admin.query(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`)
    await admin.query(`CREATE DATABASE ${BANCO}`)
    base.pathname = `/${BANCO}`
    pool = new pg.Pool({ connectionString: base.toString(), max: 2 })

    // schema antigo: exatamente as migrations que já existiam antes da de conteúdo
    for (const m of [inicial, agenda, paginas]) await roda(m)

    await pool.query(`INSERT INTO tenants (slug, nome, canonical_host) VALUES ('legado', 'Site legado', 'legado.example'), ('outro', 'Outro', 'outro.example')`)
    await pool.query(`INSERT INTO produtos_fisicos (tenant_id, nome, slug, marca, modelo, categoria, descricao, gtin, mpn, especificacoes, estado, created_at, updated_at) VALUES
      (1, 'Filamento PLA', 'filamento-pla', 'Marca', 'PLA-1', 'filamento', 'Descrição legada que precisa sobreviver.', '7891234567895', 'MPN-1', '{"cor":"preto","peso_g":1000}', 'published', '2026-01-02T03:04:05Z', '2026-02-03T04:05:06Z'),
      (1, 'Impressora sem texto', 'impressora', 'Marca', 'IMP-1', 'impressora', NULL, NULL, NULL, NULL, 'draft', '2026-03-04T05:06:07Z', '2026-03-04T05:06:07Z'),
      (2, 'Resina', 'resina', 'Outra', 'RES-1', 'resina', '   ', NULL, NULL, '[1,2,3]', 'review', '2026-04-05T06:07:08Z', '2026-04-05T06:07:08Z')`)
    await pool.query(`INSERT INTO _produtos_fisicos_v (parent_id, version_tenant_id, version_nome, version_slug, version_marca, version_modelo, version_categoria,
      version_descricao, version_estado, version_created_at, version_updated_at) VALUES
      (1, 1, 'Filamento PLA', 'filamento-pla', 'Marca', 'PLA-1', 'filamento', 'Versão antiga do texto legado.', 'draft', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`)
    await pool.query(`INSERT INTO variantes_produto (tenant_id, produto_id, nome, sku_fabricante, peso_g, estado) VALUES (1, 1, 'Preto 1 kg', 'SKU-1', 1000, 'incerta')`)
    antes = await lerLegado()
  }, 120_000)

  afterAll(async () => {
    await pool?.end()
    if (admin) { await admin.query(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`); await admin.end() }
  })

  it('o schema antigo está populado e sem nenhuma coluna ou tipo do conteúdo editorial', async () => {
    expect(antes.produtos).toHaveLength(3)
    expect(antes.versoes).toHaveLength(1)
    expect(antes.variantes).toHaveLength(1)
    expect(await nomes('produtos_fisicos')).not.toContain('meta_title')
    expect(await nomes('_produtos_fisicos_v')).not.toContain('version_meta_title')
    expect(await tipos()).toEqual([])
  })

  it('up preserva colunas e dados legados e só acrescenta as colunas novas, com o default editorial', async () => {
    await roda(conteudo)

    const depois = await lerLegado()
    // dados legados idênticos, linha a linha (inclui `descricao`, JSONB e timestamps)
    expect(depois.produtos).toEqual(antes.produtos)
    expect(depois.versoes).toEqual(antes.versoes)
    expect(depois.variantes).toEqual(antes.variantes)
    expect(depois.tenants).toEqual(antes.tenants)

    // colunas legadas idênticas (tipo, nulidade, default); as demais são exatamente as novas
    const so = (cols: any[], novas: string[]) => cols.filter(c => !novas.includes(c.column_name))
    expect(so(depois.colProdutos, NOVAS)).toEqual(antes.colProdutos)
    expect(so(depois.colVersoes, NOVAS_VERSAO)).toEqual(antes.colVersoes)
    const acrescentadas = async (tabela: string, anteriores: any[]) =>
      (await nomes(tabela)).filter(c => !anteriores.some(a => a.column_name === c)).sort()
    expect(await acrescentadas('produtos_fisicos', antes.colProdutos)).toEqual([...NOVAS].sort())
    expect(await acrescentadas('_produtos_fisicos_v', antes.colVersoes)).toEqual([...NOVAS_VERSAO].sort())
    expect(await tipos()).toEqual([...TIPOS_NOVOS].sort())

    // linhas antigas nascem sem conteúdo, não indexáveis; o texto legado continua só em `descricao`
    const ps = await linhas('SELECT * FROM produtos_fisicos ORDER BY id')
    for (const p of ps) {
      expect(p).toMatchObject({ editorial_status: 'sem_conteudo', indexavel: false, meta_title: null, meta_description: null, resumo: null,
        descricao_markdown: null, destaques: null, faq: null, facts_hash: null, content_generator: null, prompt_version: null,
        content_version: null, editorial_refresh_em: null, editorial_refresh_motivo: null })
    }
    expect(ps[0].descricao).toBe('Descrição legada que precisa sobreviver.')
    const vs = await linhas('SELECT * FROM _produtos_fisicos_v')
    expect(vs[0]).toMatchObject({ version_editorial_status: 'sem_conteudo', version_indexavel: false, version_meta_title: null, version_descricao: 'Versão antiga do texto legado.' })

    // o schema novo aceita escrita normal e o enum recusa status desconhecido
    await pool.query(`INSERT INTO produtos_fisicos (tenant_id, nome, slug, marca, modelo, categoria) VALUES (1, 'Novo', 'novo', 'M', 'N-1', 'acessorio')`)
    expect((await linhas(`SELECT editorial_status, indexavel FROM produtos_fisicos WHERE slug = 'novo'`))[0]).toEqual({ editorial_status: 'sem_conteudo', indexavel: false })
    await expect(pool.query(`UPDATE produtos_fisicos SET editorial_status = 'publicado' WHERE slug = 'novo'`)).rejects.toThrow(/enum_produtos_fisicos_editorial_status/)
    await pool.query(`DELETE FROM produtos_fisicos WHERE slug = 'novo'`)
  })

  it('down é DESTRUTIVO: remove colunas e tipos novos e apaga o conteúdo editorial gravado; o legado fica', async () => {
    await pool.query(`UPDATE produtos_fisicos SET meta_title = 'Título editorial', resumo = 'Resumo', faq = '[{"pergunta":"a","resposta":"b"}]',
      editorial_status = 'rascunho', content_version = 3 WHERE slug = 'filamento-pla'`)
    await pool.query(`UPDATE _produtos_fisicos_v SET version_meta_title = 'Título na versão' WHERE id = 1`)
    expect((await linhas(`SELECT meta_title FROM produtos_fisicos WHERE slug = 'filamento-pla'`))[0].meta_title).toBe('Título editorial')

    await desce(conteudo)

    const depois = await lerLegado()
    expect(depois.produtos).toEqual(antes.produtos)
    expect(depois.versoes).toEqual(antes.versoes)
    expect(depois.variantes).toEqual(antes.variantes)
    expect(depois.colProdutos).toEqual(antes.colProdutos)
    expect(depois.colVersoes).toEqual(antes.colVersoes)
    for (const c of NOVAS) expect(await nomes('produtos_fisicos')).not.toContain(c)
    for (const c of NOVAS_VERSAO) expect(await nomes('_produtos_fisicos_v')).not.toContain(c)
    expect(await tipos()).toEqual([])
  })

  it('down seguido de up recria o schema novo VAZIO: o conteúdo apagado pelo down não volta', async () => {
    await roda(conteudo)
    const p = (await linhas(`SELECT * FROM produtos_fisicos WHERE slug = 'filamento-pla'`))[0]
    expect(p).toMatchObject({ meta_title: null, resumo: null, faq: null, editorial_status: 'sem_conteudo', content_version: null, indexavel: false,
      descricao: 'Descrição legada que precisa sobreviver.' })
    expect((await linhas('SELECT * FROM _produtos_fisicos_v'))[0].version_meta_title).toBeNull()
    expect((await lerLegado()).produtos).toEqual(antes.produtos)
  })
})
