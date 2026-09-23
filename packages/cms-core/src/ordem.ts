/**
 * A ordem final que o site declara (PRD 17 RF1b; decisão do dono de 2026-09-23).
 *
 * Coleções, campos de `tenants` e opções de `pages.template` chegam intercalados entre
 * núcleo, plugin e site: `lojas` (plugin) fica entre `users` e `posts` (núcleo), o
 * `title_pattern_loja` (plugin) abre o grupo `seo` do tenant (núcleo). A ordem de chegada —
 * núcleo, plugins, site — mudaria o menu do admin, o formulário do tenant e o
 * `payload-types.ts` sem mudar banco nem site; a ordem do site mantém os três como eram.
 *
 * Aplicada por um plugin que roda DEPOIS dos plugins do site e ANTES dos do núcleo: vale
 * para o que um plugin acrescentou, e os do núcleo (multi-tenant, SEO) recebem as coleções
 * já na ordem — como recebiam quando o `payload.config` era escrito à mão.
 */
import type { CollectionConfig, Config, Field, Plugin } from 'payload'

export interface Ordem {
  colecoes?: readonly string[]
  /** campos de topo de `tenants` */
  camposDoTenant?: readonly string[]
  /** campos do grupo `tenants.seo` */
  seoDoTenant?: readonly string[]
  /** opções do select `pages.template` */
  templatesDePagina?: readonly string[]
  /** `destino` de `link_rules` e `links_gerados` */
  destinosDoAutoLinker?: readonly string[]
}

/** Estável: o que não está em `ordem` vai para o fim, na ordem em que chegou. */
export function ordenaPor<T>(itens: readonly T[], ordem: readonly string[] | undefined, chave: (t: T) => string | undefined): T[] {
  if (!ordem) return [...itens]
  const posicao = new Map(ordem.map((k, i) => [k, i]))
  const fim = ordem.length
  return itens
    .map((item, i) => ({ item, i, p: posicao.get(chave(item) ?? '') ?? fim }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.item)
}

const nomeDoCampo = (f: Field) => ('name' in f ? f.name : undefined)
const valorDaOpcao = (o: string | { value: string }) => (typeof o === 'string' ? o : o.value)

/** Troca o campo `nome` da coleção por `troca(campo)`, sem mexer no resto. */
export function comCampo(colecao: CollectionConfig, nome: string, troca: (campo: Field) => Field): CollectionConfig {
  return { ...colecao, fields: colecao.fields.map((f) => (nomeDoCampo(f) === nome ? troca(f) : f)) }
}

/** Troca a coleção `slug` da config por `troca(colecao)`. */
export function comColecao(config: Config, slug: string, troca: (c: CollectionConfig) => CollectionConfig): Config {
  return { ...config, collections: (config.collections ?? []).map((c) => (c.slug === slug ? troca(c) : c)) }
}

export const aplicaOrdem =
  (ordem: Ordem | undefined): Plugin =>
  (config) => {
    if (!ordem) return config
    let c: Config = { ...config, collections: ordenaPor(config.collections ?? [], ordem.colecoes, (x) => x.slug) }
    c = comColecao(c, 'tenants', (t) =>
      comCampo({ ...t, fields: ordenaPor(t.fields, ordem.camposDoTenant, nomeDoCampo) }, 'seo', (seo) =>
        'fields' in seo ? ({ ...seo, fields: ordenaPor(seo.fields, ordem.seoDoTenant, nomeDoCampo) } as Field) : seo,
      ),
    )
    c = comColecao(c, 'pages', (p) =>
      comCampo(p, 'template', (f) =>
        f.type === 'select' ? { ...f, options: ordenaPor(f.options, ordem.templatesDePagina, valorDaOpcao) } : f,
      ),
    )
    for (const slug of ['link_rules', 'links_gerados']) {
      c = comColecao(c, slug, (l) =>
        comCampo(l, 'destino', (f) =>
          f.type === 'relationship' && Array.isArray(f.relationTo)
            ? ({ ...f, relationTo: ordenaPor(f.relationTo, ordem.destinosDoAutoLinker, (x) => x) } as Field)
            : f,
        ),
      )
    }
    return c
  }
