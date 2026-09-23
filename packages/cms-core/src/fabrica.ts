/**
 * A fábrica da config do Payload (PRD 17 RF1, ADR-0011).
 *
 * O núcleo decide o que é igual em todo site — banco, editor, idioma, mídia no bucket,
 * multi-tenant e SEO —, e o site entrega o que é dele: as coleções, os plugins e as
 * tarefas agendadas. Nesta primeira etapa (RF1a) todas as coleções ainda vêm do site; elas
 * passam para o núcleo e para o plugin de afiliado nas etapas seguintes, sem que a config
 * final mude — a prova é o `payload-types.ts` do site e o `migrate:create` sem diferença.
 *
 * Duas listas que o `payload.config` mantinha à mão agora são DEDUZIDAS das coleções, porque
 * com núcleo, plugin e site entregando coleções cada um pelo seu lado, lista à mão vira
 * lista desatualizada:
 * - do tenant: toda coleção, menos `tenants` e `users` (`colecoesDoTenant`);
 * - SEO: a que marca `custom.seo` (`colecoesComSeo`).
 */
import path from 'node:path'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { en } from '@payloadcms/translations/languages/en'
import { pt } from '@payloadcms/translations/languages/pt'
import { buildConfig, type CollectionConfig, type Config, type Plugin, type SanitizedConfig } from 'payload'
import sharp from 'sharp'

import { editorFeatures } from './editor'
import { configR2DaExecucao, urlPublica } from './r2'

/** As duas coleções que NÃO são de um tenant: o próprio cadastro e quem administra. */
const FORA_DO_TENANT = new Set(['tenants', 'users'])

export interface OpcoesCmsCore {
  /**
   * A pasta `src` do site (`path.dirname(fileURLToPath(import.meta.url))` no
   * `payload.config.ts`): de lá saem o `payload-types.ts` e o mapa de componentes do admin.
   */
  raiz: string
  /** As coleções do site, na ordem em que aparecem no admin e no `payload-types.ts`. */
  colecoes: CollectionConfig[]
  /** Plugins do site. Rodam ANTES dos do núcleo, que precisam enxergar tudo o que eles acrescentam. */
  plugins?: Plugin[]
  /** Tarefas agendadas do site (Payload Jobs). */
  jobs?: Config['jobs']
}

/**
 * Coleção → opções do plugin multi-tenant: toda coleção, menos `tenants` e `users`. A que já
 * traz o próprio campo de tenant (o catálogo físico, ADR-0010) marca
 * `custom.tenantCampoProprio` e recebe `customTenantField`.
 */
export function colecoesDoTenant(colecoes: CollectionConfig[]): Record<string, { customTenantField?: true }> {
  return Object.fromEntries(
    colecoes
      .filter((c) => !FORA_DO_TENANT.has(c.slug))
      .map((c) => [c.slug, c.custom?.tenantCampoProprio ? { customTenantField: true as const } : {}]),
  )
}

/** As coleções que ganham o grupo `meta` do plugin de SEO: as que marcam `custom.seo`. */
export function colecoesComSeo(colecoes: CollectionConfig[]): string[] {
  return colecoes.filter((c) => c.custom?.seo === true).map((c) => c.slug)
}

/**
 * Plugin que monta OUTRO plugin a partir das coleções que existem naquele ponto — depois
 * dos plugins do site. É o que deixa as duas listas acima valerem também para coleção que
 * um plugin acrescentou.
 */
const comAsColecoes =
  (monta: (colecoes: CollectionConfig[]) => Plugin): Plugin =>
  (config) =>
    monta(config.collections ?? [])(config)

export function cmsCore(opcoes: OpcoesCmsCore): Promise<SanitizedConfig> {
  /*
   * PRD 18 RF1 — a mídia mora no bucket R2 da instância (ADR-0012). Sem as cinco `R2_*`, o
   * CMS NÃO sobe: `configR2DaExecucao` lança com o nome de cada variável que falta. Degradar
   * para o disco em silêncio esconderia um acervo partido entre disco e bucket. A única
   * exceção é o `next build`, onde as variáveis não existem (ver `r2.ts`).
   */
  const r2 = configR2DaExecucao(process.env)

  return buildConfig({
    admin: {
      user: 'users',
      importMap: { baseDir: path.resolve(opcoes.raiz) },
    },
    collections: opcoes.colecoes,
    // Lista de features em `editor.ts` — os scripts de migração precisam usar a MESMA.
    editor: lexicalEditor({ features: editorFeatures }),
    i18n: { fallbackLanguage: 'pt', supportedLanguages: { pt, en } },
    secret: process.env.PAYLOAD_SECRET || '',
    typescript: { outputFile: path.resolve(opcoes.raiz, 'payload-types.ts') },
    db: postgresAdapter({
      pool: { connectionString: process.env.DATABASE_URL || '' },
      // ADR-0006: push só em dev interativo, e por env explícita. Em CI/staging/produção
      // o schema vem de migration versionada — nunca de push, que além de não-determinístico
      // trava em prompt quando não há TTY.
      push: process.env.PAYLOAD_DB_PUSH === '1',
    }),
    sharp,
    ...(opcoes.jobs ? { jobs: opcoes.jobs } : {}),
    plugins: [
      ...(opcoes.plugins ?? []),
      /*
       * PRD 18 RF1/RF2. `disablePayloadAccessControl`: o Payload deixa de servir o arquivo
       * (`/api/midia/file/…`), e a URL de cada imagem e de cada derivado passa a ser a do
       * bucket (`generateFileURL`, calculada na LEITURA a partir do nome do arquivo — nenhum
       * registro precisa ser reescrito). A mídia é pública (`read: () => true` na coleção),
       * então não há controle de acesso a perder. Os endereços antigos — `/api/midia/file/…`
       * e o alias `/wp-content/uploads/…` — viram redirecionamento permanente no proxy da
       * instância: nenhuma imagem passa mais pela VPS.
       */
      s3Storage({
        collections: {
          midia: {
            disablePayloadAccessControl: true,
            generateFileURL: ({ filename: arquivo, prefix }) => urlPublica(r2.publicBase, arquivo, prefix),
          },
        },
        bucket: r2.bucket,
        config: { endpoint: r2.endpoint, region: 'auto', forcePathStyle: true, credentials: r2.credentials },
      }),
      // conteúdo de tenant: campo `tenant` + access do plugin (PRD 01 RF2)
      comAsColecoes((colecoes) =>
        multiTenantPlugin({
          collections: colecoesDoTenant(colecoes),
          tenantsSlug: 'tenants',
          userHasAccessToAllTenants: (user) =>
            Boolean((user as { roles?: string[] | null })?.roles?.includes('super-admin')),
        }),
      ),
      comAsColecoes((colecoes) =>
        seoPlugin({
          collections: colecoesComSeo(colecoes),
          uploadsCollection: 'midia',
          tabbedUI: true,
          generateTitle: ({ doc }) =>
            (doc as { titulo?: string; nome?: string })?.titulo ?? (doc as { nome?: string })?.nome ?? '',
        }),
      ),
      // PENDENTE F0-E2 (ver docs/backlog.md): plugin-redirects, plugin-import-export,
      // plugin-mcp (interno), plugin-sentry, dashboard widgets (RF7), jobs queue (RF9).
    ],
  })
}
