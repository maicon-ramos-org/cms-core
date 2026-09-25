/**
 * O que a fábrica DEDUZ das coleções que recebe (PRD 17 RF1).
 *
 * Antes da fábrica, o `payload.config` do site listava à mão quais coleções são do tenant e
 * quais ganham SEO. Com o núcleo, o plugin (afiliado) e o site entregando coleções cada um
 * pelo seu lado, lista à mão vira lista desatualizada: a coleção é quem diz o que é.
 * - do tenant: TODA coleção, menos `tenants` e `users`. A que já traz o próprio campo de
 *   tenant (o catálogo físico, ADR-0010) marca `custom.tenantCampoProprio`;
 * - SEO: a que marca `custom.seo`.
 */
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { getPayload, type CollectionConfig, type SanitizedConfig } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cmsCore, colecoesComSeo, colecoesDoTenant, type OpcoesCmsCore } from '../src/fabrica'
import { revalidateAfterOperation, revalidateBeforeOperation } from '../src/hooks/revalidate'
import type { CustomDaMidia, GeradorDeDerivados } from '../src/midia/derivados'

const c = (slug: string, custom?: CollectionConfig['custom']): CollectionConfig => ({ slug, fields: [], ...(custom ? { custom } : {}) })

describe('colecoesDoTenant', () => {
  it('toda coleção é do tenant, menos tenants e users', () => {
    expect(colecoesDoTenant([c('tenants'), c('users'), c('posts'), c('midia')])).toEqual({ posts: {}, midia: {} })
  })

  it('a coleção que traz o próprio campo de tenant pede customTenantField', () => {
    expect(colecoesDoTenant([c('posts'), c('produtos_fisicos', { tenantCampoProprio: true })])).toEqual({
      posts: {},
      produtos_fisicos: { customTenantField: true },
    })
  })
})

describe('colecoesComSeo', () => {
  it('só as que marcam custom.seo, na ordem em que chegam', () => {
    expect(colecoesComSeo([c('posts', { seo: true }), c('midia'), c('pages', { seo: true }), c('tags', { seo: false })])).toEqual([
      'posts',
      'pages',
    ])
  })
})

/*
 * PRD 24 RF1 — a fábrica injetável. O mesmo núcleo monta o CMS em Node (VPS, CI, scripts) e
 * num Worker; o que muda entre os dois vem por opção, e SEM a opção tudo fica como antes.
 */
describe('cmsCore: as opções injetáveis', () => {
  beforeEach(() => {
    vi.stubEnv('R2_ACCOUNT_ID', 'conta')
    vi.stubEnv('R2_ACCESS_KEY_ID', 'chave')
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'segredo')
    vi.stubEnv('R2_BUCKET', 'midia-teste')
    vi.stubEnv('R2_PUBLIC_BASE', 'https://media.exemplo.com')
    vi.stubEnv('DATABASE_URL', 'postgres://ambiente@127.0.0.1:5432/do-ambiente')
  })
  afterEach(() => vi.unstubAllEnvs())

  const raiz = mkdtempSync(join(tmpdir(), 'fabrica-'))
  const monta = (opcoes: Partial<OpcoesCmsCore> = {}) => cmsCore({ raiz, pastaDeMigracoes: raiz, ...opcoes })
  const upload = (config: SanitizedConfig, slug = 'midia') => {
    const u = config.collections.find((c) => c.slug === slug)!.upload
    return typeof u === 'object' ? u : undefined
  }
  const poolDe = (config: SanitizedConfig) =>
    (config.db.init({ payload: {} as never }) as unknown as { poolOptions: Record<string, unknown> }).poolOptions

  describe('sharp', () => {
    it('sem a opção: o sharp de sempre, carregado pela fábrica (comportamento de hoje)', async () => {
      const sharp = (await import('sharp')).default
      const config = await monta()
      expect(config.sharp).toBe(sharp)
      expect(upload(config)?.crop).not.toBe(false)
      expect(upload(config)?.focalPoint).not.toBe(false)
    })

    it('o sharp passado é o usado', async () => {
      const sharp = (await import('sharp')).default
      const config = await monta({ sharp })
      expect(config.sharp).toBe(sharp)
    })

    it('sharp: null — a config sai sem sharp, sem recorte e sem ponto focal (sem imageSizes ativos)', async () => {
      const config = await monta({ sharp: null })
      expect(config.sharp).toBeUndefined()
      expect(upload(config)?.crop).toBe(false)
      expect(upload(config)?.focalPoint).toBe(false)
    })

    it('sharp: null — os imageSizes seguem DECLARADOS: as colunas de `sizes` são as mesmas nos dois formatos, e é a lista que o gerador de derivados recebe', async () => {
      const nomes = (config: SanitizedConfig) => (upload(config)?.imageSizes ?? []).map((s) => s.name)
      expect(nomes(await monta({ sharp: null }))).toEqual(['cartao', 'capa', 'og'])
      expect(nomes(await monta({ sharp: null }))).toEqual(nomes(await monta()))
    })
  })

  describe('db', () => {
    it('sem a opção: DATABASE_URL, como hoje', async () => {
      const pool = poolDe(await monta())
      expect(pool.connectionString).toBe('postgres://ambiente@127.0.0.1:5432/do-ambiente')
      expect(pool).not.toHaveProperty('maxUses')
    })

    it('com db: a string passada (a do Hyperdrive) e o maxUses', async () => {
      const pool = poolDe(await monta({ db: { connectionString: 'postgres://hyperdrive@exemplo.local:5432/banco', maxUses: 1 } }))
      expect(pool.connectionString).toBe('postgres://hyperdrive@exemplo.local:5432/banco')
      expect(pool.maxUses).toBe(1)
    })
  })

  describe('graphQL e logger', () => {
    it('graphQL.disable é repassado; sem a opção, o GraphQL continua ligado', async () => {
      expect((await monta({ graphQL: { disable: true } })).graphQL?.disable).toBe(true)
      expect((await monta()).graphQL?.disable).toBeFalsy()
    })

    it('o logger passado é o da config (num Worker, sobre console)', async () => {
      const logger = { level: 'info', info: console.log, warn: console.warn, error: console.error } as unknown as OpcoesCmsCore['logger']
      expect((await monta({ logger })).logger).toBe(logger)
    })
  })

  describe('midia', () => {
    it('midia.r2: o bucket passado, sem ler as R2_* do ambiente', async () => {
      for (const v of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE']) vi.stubEnv(v, '')
      await expect(monta()).rejects.toThrow(/faltam variáveis do bucket/)
      const r2 = {
        bucket: 'midia-dev',
        endpoint: 'https://conta.r2.cloudflarestorage.com',
        credentials: { accessKeyId: 'a', secretAccessKey: 'b' },
        publicBase: 'https://media-dev.exemplo.com',
      }
      await expect(monta({ midia: { r2 } })).resolves.toBeTruthy()
    })

    it('midia.derivados: o gerador chega à coleção midia, em custom.derivados (o hook da RF2 lê de lá)', async () => {
      const gerador: GeradorDeDerivados = { gera: async () => [] }
      const config = await monta({ sharp: null, midia: { derivados: gerador } })
      const custom = config.collections.find((c) => c.slug === 'midia')!.custom as CustomDaMidia
      // a config copia objetos simples (`copia.ts`): chega um gerador com o MESMO método
      expect(custom.derivados?.gera).toBe(gerador.gera)
    })

    it('sem midia.derivados, a coleção midia sai como sempre', async () => {
      const config = await monta()
      expect(config.collections.find((c) => c.slug === 'midia')!.custom?.derivados).toBeUndefined()
    })
  })

  describe('revalidação', () => {
    it('toda coleção ganha o quadro da operação (beforeOperation) e o envio (afterOperation) — as do núcleo, as de plugin e as do site', async () => {
      const doSite: CollectionConfig = { slug: 'notas', fields: [{ name: 'titulo', type: 'text' }] }
      const config = await monta({ colecoes: [doSite] })
      for (const slug of ['posts', 'pages', 'tenants', 'midia', 'notas']) {
        const hooks = config.collections.find((c) => c.slug === slug)!.hooks
        expect(hooks?.afterOperation ?? [], slug).toContain(revalidateAfterOperation)
        // por último: marca os `args` que o afterOperation recebe (o da midia vem depois do nomeBaseUnico)
        expect((hooks?.beforeOperation ?? []).at(-1), slug).toBe(revalidateBeforeOperation)
      }
    })

    it('revalidacao.emSegundoPlano vai para o custom da config (só do servidor), de onde o hook o lê', async () => {
      const emSegundoPlano = (p: Promise<unknown>) => void p
      const config = await monta({ revalidacao: { emSegundoPlano } })
      expect(config.custom?.revalidacao?.emSegundoPlano).toBe(emSegundoPlano)
    })

    it('sem a opção, a config não ganha custom (em Node, o envio sai solto, como sempre)', async () => {
      const config = await monta()
      expect(config.custom?.revalidacao).toBeUndefined()
    })
  })
})

/*
 * O Worker não roda migração nem push, mas lê e escreve com o schema que a config dele
 * descreve. Se `sharp: null` mudasse uma coluna, o Worker leria e gravaria um banco diferente
 * do que a migração criou.
 */
describe('cmsCore: sharp: null não muda o schema', () => {
  beforeEach(() => {
    for (const [v, valor] of Object.entries({
      R2_ACCOUNT_ID: 'conta',
      R2_ACCESS_KEY_ID: 'chave',
      R2_SECRET_ACCESS_KEY: 'segredo',
      R2_BUCKET: 'midia-teste',
      R2_PUBLIC_BASE: 'https://media.exemplo.com',
      PAYLOAD_SECRET: 'segredo-de-teste',
    }))
      vi.stubEnv(v, valor)
  })
  afterEach(() => vi.unstubAllEnvs())

  const migracao = async (nome: string, opcoes: Partial<OpcoesCmsCore>) => {
    const pasta = mkdtempSync(join(tmpdir(), `schema-${nome}-`))
    const config = await cmsCore({ raiz: pasta, pastaDeMigracoes: pasta, ...opcoes })
    const payload = await getPayload({ config, key: `schema-${nome}`, disableDBConnect: true, disableOnInit: true })
    await payload.db.createMigration({ migrationName: 'inicial', payload, forceAcceptWarning: true, skipEmpty: true })
    const arquivo = readdirSync(pasta).find((f) => f.endsWith('_inicial.ts'))!
    return readFileSync(join(pasta, arquivo), 'utf8')
  }

  it('a migração gerada com sharp: null é idêntica à de hoje', async () => {
    const semSharp = await migracao('sem-sharp', { sharp: null })
    // a comparação não é vazia: as colunas dos derivados e do ponto focal estão lá
    expect(semSharp).toContain('"sizes_og_filename"')
    expect(semSharp).toContain('"focal_x"')
    expect(semSharp).toBe(await migracao('com-sharp', {}))
  }, 120_000)
})
