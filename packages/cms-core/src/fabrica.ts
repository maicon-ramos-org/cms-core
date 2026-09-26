/**
 * A fábrica da config do Payload (PRD 17 RF1, ADR-0011).
 *
 * O núcleo decide o que é igual em todo site — banco, editor, idioma, mídia no bucket,
 * multi-tenant, SEO e as coleções de conteúdo que todo site tem (`tenants`, `users`,
 * `midia`, `posts`, `pages`, taxonomias, `mensagens`, `queries_log` e as do auto-linker).
 * O site entrega o que é dele: as próprias coleções, plugins, campos de `tenants`, templates
 * de página, tarefas agendadas e a ORDEM final de tudo isso (`ordem.ts`). Cada etapa do
 * PRD 17 RF1 muda onde o código mora sem mudar a config final — a prova é o
 * `payload-types.ts` do site e o `migrate:create` sem diferença.
 *
 * Duas listas que o `payload.config` mantinha à mão agora são DEDUZIDAS das coleções, porque
 * com núcleo, plugin e site entregando coleções cada um pelo seu lado, lista à mão vira
 * lista desatualizada:
 * - do tenant: toda coleção, menos `tenants` e `users` (`colecoesDoTenant`);
 * - SEO: a que marca `custom.seo` (`colecoesComSeo`).
 *
 * PRD 24 RF1 — a fábrica é INJETÁVEL: o mesmo núcleo monta o CMS em Node (VPS, CI, scripts) e
 * num Worker da Cloudflare. O que difere entre os dois — `sharp`, banco, bucket, gerador de
 * derivados, GraphQL, logger — vem por opção, e sem a opção tudo fica como era.
 */
import path from 'node:path'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { en } from '@payloadcms/translations/languages/en'
import { pt } from '@payloadcms/translations/languages/pt'
import { buildConfig, type CollectionConfig, type Config, type Field, type Plugin, type SanitizedConfig } from 'payload'
import { isSuperAdmin } from './access/roles'
import { preparaPrincipalSiteReader } from './site-reader/provisionamento'
import { aplicaPoliticaSiteReader } from './site-reader/politica'
import type { ProjetorRenderSiteReaderV1 } from './site-reader/render'

import { LinkRules, LinksGerados } from './collections/AutoLinker'
import { QueriesLog } from './collections/Logs'
import { Mensagens } from './collections/Mensagens'
import { Midia } from './collections/Midia'
import { paginas, type TemplateDePagina } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Autores, Categorias, Tags } from './collections/Taxonomias'
import { Tenants } from './collections/Tenants'
import { Users } from './collections/Users'
import { editorFeatures } from './editor'
import { copiaProfunda } from './copia'
import { revalidateAfterOperation, revalidateBeforeOperation, type CustomDaRevalidacao, type EmSegundoPlano } from './hooks/revalidate'
import type { CustomDaMidia, GeradorDeDerivados } from './midia/derivados'
import { aplicaOrdem, type Ordem } from './ordem'
import { configR2DaExecucao, urlPublica, type ConfigR2 } from './r2'

/** As duas coleções que NÃO são de um tenant: o próprio cadastro e quem administra. */
const FORA_DO_TENANT = new Set(['tenants', 'users'])

export interface OpcoesCmsCore {
  /** SSR de tenant único: exige também wrappers HTTP/admin explícitos no consumidor. */
  siteReader?: boolean | { renderV1: ProjetorRenderSiteReaderV1 }
  /**
   * A pasta `src` do site (`path.dirname(fileURLToPath(import.meta.url))` no
   * `payload.config.ts`): de lá saem o `payload-types.ts` e o mapa de componentes do admin.
   */
  raiz: string
  /** As coleções do site. Entram depois das do núcleo; a posição final é a `ordem.colecoes`. */
  colecoes?: CollectionConfig[]
  /** Plugins do site. Rodam ANTES dos do núcleo, que precisam enxergar tudo o que eles acrescentam. */
  plugins?: Plugin[]
  /** Campos de topo que o site acrescenta a `tenants` (os do núcleo vêm primeiro). */
  camposDoTenant?: Field[]
  /** Templates de `pages` além dos do núcleo (`conteudo`, `institucional`, `contato`, `indice`). */
  templatesDePagina?: TemplateDePagina[]
  /**
   * A ordem final de coleções, campos e opções que chegam intercalados entre núcleo, plugins
   * e site. Sem ela, fica a ordem de chegada: núcleo, plugins, site.
   */
  ordem?: Ordem
  /** Tarefas agendadas do site (Payload Jobs). */
  jobs?: Config['jobs']
  /**
   * Onde ficam (e onde o `migrate:create` escreve) as migrações do site. Sem ela, a padrão do
   * Payload: `src/migrations` a partir da pasta em que o processo roda.
   */
  pastaDeMigracoes?: string
  /**
   * O `sharp` que gera os `imageSizes`, o recorte e o ponto focal. Sem a opção, a fábrica o
   * carrega (é o de sempre, em Node). `null` desliga os três — num Worker não há `sharp`
   * (binário nativo) —, e quem gera os derivados passa a ser `midia.derivados`. Os
   * `imageSizes` continuam DECLARADOS: são as colunas de `sizes` no banco, as mesmas nos dois
   * formatos, e a lista que o gerador recebe.
   */
  sharp?: NonNullable<Config['sharp']> | null
  /**
   * O Postgres. Sem a opção, `DATABASE_URL`. Num Worker, a string do Hyperdrive e
   * `maxUses: 1`. Para isolar também a fila por invocação, a plataforma instala
   * explicitamente `poolPostgresPorRequisicao`; maxUses sozinho não faz esse isolamento.
   */
  db?: { connectionString: string; maxUses?: number }
  midia?: {
    /** O bucket. Sem a opção, as `R2_*` do ambiente (`configR2DaExecucao`). */
    r2?: ConfigR2
    /**
     * Quem gera os derivados quando a config vem sem `sharp` (o binding Images, num Worker).
     * A fábrica o entrega à coleção `midia` em `custom.derivados` (`CustomDaMidia`), de onde o
     * `beforeChange` da coleção o lê.
     */
    derivados?: GeradorDeDerivados
  }
  /** Sem a opção, o GraphQL do Payload fica como está (ligado). */
  graphQL?: { disable: boolean }
  /** Sem a opção, o do Payload (pino). Num Worker, um logger sobre `console`: o `pino-pretty` não roda lá. */
  logger?: Config['logger']
  revalidacao?: {
    /**
     * Quem segura a promessa do aviso ao site, que o save não espera (`hooks/revalidate.ts`).
     * Sem a opção, ninguém — em Node, como sempre foi. Num Worker,
     * `(p) => getCloudflareContext().ctx.waitUntil(p)`: sem isso a promessa morre com a resposta.
     */
    emSegundoPlano?: EmSegundoPlano
  }
}

/** As coleções do núcleo, com o que o site acrescenta a `tenants` e a `pages`, e o gerador de derivados em `midia`. */
function colecoesDoNucleo(opcoes: OpcoesCmsCore): CollectionConfig[] {
  const derivados = opcoes.midia?.derivados
  return [
    { ...Tenants, fields: [...Tenants.fields, ...(opcoes.camposDoTenant ?? [])] },
    Users,
    Posts,
    paginas(opcoes.templatesDePagina),
    Mensagens,
    derivados ? { ...Midia, custom: { ...Midia.custom, derivados } satisfies CustomDaMidia } : Midia,
    Categorias,
    Tags,
    Autores,
    LinkRules,
    LinksGerados,
    QueriesLog,
  ]
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

/** Aplica `muda` a cada coleção que existe naquele ponto da cadeia de plugins. */
const emCadaColecao =
  (muda: (colecao: CollectionConfig) => CollectionConfig): Plugin =>
  (config) => ({ ...config, collections: (config.collections ?? []).map(muda) })

/**
 * Sem `sharp`, o Payload não gera `imageSizes` nem aplica recorte (`createImageSizes` e
 * `generateFileData`, Payload 3.88, pulam sem `config.sharp`); o que sobra é o admin
 * oferecendo recorte e ponto focal que não teriam efeito. Os dois saem de toda coleção de
 * upload, como no template do Payload para a Cloudflare. As colunas `focal_x`/`focal_y`
 * continuam (o Payload as cria enquanto houver `imageSizes`): o schema não muda.
 */
const semRecorteNemPontoFocal = emCadaColecao((c) =>
  c.upload ? { ...c, upload: { ...(typeof c.upload === 'object' ? c.upload : {}), crop: false, focalPoint: false } } : c,
)

/**
 * O quadro de cada operação de escrita, onde as tags de revalidação se acumulam, e o envio
 * delas quando a operação de fora termina (`hooks/revalidate.ts`). Os dois por último: o
 * `beforeOperation` marca os `args` que o `afterOperation` recebe.
 */
const comEnvioDaRevalidacao = emCadaColecao((c) => ({
  ...c,
  hooks: {
    ...c.hooks,
    beforeOperation: [...(c.hooks?.beforeOperation ?? []), revalidateBeforeOperation],
    afterOperation: [...(c.hooks?.afterOperation ?? []), revalidateAfterOperation],
  },
}))

/**
 * O `sharp` da config. Sem a opção, o de sempre — carregado aqui, sob demanda, e não por
 * `import` estático: o módulo nem é avaliado quando o site passa o dele ou `null` (num Worker,
 * avaliar o `sharp` falha, porque ele carrega um binário nativo).
 */
async function sharpDaConfig(opcao: OpcoesCmsCore['sharp']): Promise<Config['sharp']> {
  if (opcao === null) return undefined
  if (opcao) return opcao
  try {
    return (await import('sharp')).default
  } catch (err) {
    throw new Error(
      'cmsCore: o sharp não carregou. Instale `sharp` (gera os derivados da mídia) ou passe `sharp: null` ' +
        'para montar o CMS sem ele (com `midia.derivados` gerando os derivados).',
      { cause: err },
    )
  }
}

export async function cmsCore(opcoes: OpcoesCmsCore): Promise<SanitizedConfig> {
  /*
   * PRD 18 RF1 — a mídia mora no bucket R2 da instância (ADR-0012). Sem as cinco `R2_*`, o
   * CMS NÃO sobe: `configR2DaExecucao` lança com o nome de cada variável que falta. Degradar
   * para o disco em silêncio esconderia um acervo partido entre disco e bucket. A única
   * exceção é o `next build`, onde as variáveis não existem (ver `r2.ts`). Quem passa
   * `midia.r2` (PRD 24 RF1) dispensa as variáveis.
   */
  const r2 = opcoes.midia?.r2 ?? configR2DaExecucao(process.env)
  const sharp = await sharpDaConfig(opcoes.sharp)

  const config = await buildConfig({
    admin: {
      user: 'users',
      importMap: { baseDir: path.resolve(opcoes.raiz) },
    },
    collections: [...colecoesDoNucleo(opcoes), ...(opcoes.colecoes ?? [])],
    // Lista de features em `editor.ts` — os scripts de migração precisam usar a MESMA.
    editor: lexicalEditor({ features: editorFeatures }),
    i18n: { fallbackLanguage: 'pt', supportedLanguages: { pt, en } },
    secret: process.env.PAYLOAD_SECRET || '',
    typescript: { outputFile: path.resolve(opcoes.raiz, 'payload-types.ts') },
    db: postgresAdapter({
      pool: opcoes.db
        ? {
            connectionString: opcoes.db.connectionString,
            ...(opcoes.db.maxUses !== undefined ? { maxUses: opcoes.db.maxUses } : {}),
          }
        : { connectionString: process.env.DATABASE_URL || '' },
      // ADR-0006: push só em dev interativo, e por env explícita. Em CI/staging/produção
      // o schema vem de migration versionada — nunca de push, que além de não-determinístico
      // trava em prompt quando não há TTY.
      push: process.env.PAYLOAD_DB_PUSH === '1',
      ...(opcoes.pastaDeMigracoes ? { migrationDir: opcoes.pastaDeMigracoes } : {}),
    }),
    ...(sharp ? { sharp } : {}),
    ...(opcoes.graphQL ? { graphQL: { disable: opcoes.graphQL.disable } } : {}),
    ...(opcoes.logger ? { logger: opcoes.logger } : {}),
    ...(opcoes.jobs ? { jobs: opcoes.jobs } : {}),
    // `custom` da raiz é só do servidor (não vai à config do admin)
    ...(opcoes.revalidacao?.emSegundoPlano
      ? { custom: { revalidacao: { emSegundoPlano: opcoes.revalidacao.emSegundoPlano } } satisfies CustomDaRevalidacao }
      : {}),
    plugins: [
      ...(opcoes.plugins ?? []),
      /*
       * Cópia de cada coleção, depois dos plugins do site e antes dos do núcleo. As coleções
       * (do núcleo e de um plugin) são objetos de módulo, e o multi-tenant e a sanitização do
       * Payload mexem nelas no lugar: sem a cópia, montar a config uma segunda vez no mesmo
       * processo duplicava o campo `tenant` (PRD 17 RF1d).
       */
      (config) => ({ ...config, collections: (config.collections ?? []).map((c) => copiaProfunda(c)) }),
      // depois dos plugins do site (vale para o que eles acrescentaram) e antes dos do núcleo
      aplicaOrdem(opcoes.ordem),
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
          userHasAccessToAllTenants: isSuperAdmin,
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
      ...(sharp ? [] : [semRecorteNemPontoFocal]),
      // por último: vale para toda coleção, venha do núcleo, de um plugin ou do site
      comEnvioDaRevalidacao,
      ...(opcoes.siteReader ? [preparaPrincipalSiteReader] : []),
    ],
  })
  if (!opcoes.siteReader) return config
  const renderV1 = typeof opcoes.siteReader === 'object' ? opcoes.siteReader.renderV1 : undefined
  if (typeof opcoes.siteReader === 'object' && typeof renderV1 !== 'function') {
    throw new Error('siteReader.renderV1 deve ser um projetor de página.')
  }
  return aplicaPoliticaSiteReader(config, renderV1)
}
