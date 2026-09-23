/**
 * O que um plugin (a entrada `cms` do afiliado, PRD 17 RF1c) usa para acrescentar ao que é
 * do núcleo — como o `plugin-seo` acrescenta o `meta`. Cada ajudante devolve uma config
 * NOVA: plugin do Payload é `(config) => config`, e mutar a que chegou esconde de onde veio
 * cada campo.
 *
 * Acrescentam no FIM; quem decide a posição final é a `ordem` do site (`ordem.ts`).
 */
import type { Config, Field } from 'payload'

import { comCampo, comColecao } from './ordem'

/** Campos de topo em `tenants` (ex.: `programas_ativos`, do afiliado). */
export function acrescentaCamposAoTenant(config: Config, campos: Field[]): Config {
  return comColecao(config, 'tenants', (t) => ({ ...t, fields: [...t.fields, ...campos] }))
}

/** Campos dentro de um grupo de `tenants` (ex.: `title_pattern_loja` no grupo `seo`). */
export function acrescentaAoGrupoDoTenant(config: Config, grupo: string, campos: Field[]): Config {
  return comColecao(config, 'tenants', (t) =>
    comCampo(t, grupo, (g) => ('fields' in g ? ({ ...g, fields: [...g.fields, ...campos] } as Field) : g)),
  )
}

/** Coleções que podem ser destino de link do auto-linker (`link_rules` e `links_gerados`). */
export function acrescentaDestinosDoAutoLinker(config: Config, slugs: string[]): Config {
  let c = config
  for (const slug of ['link_rules', 'links_gerados']) {
    c = comColecao(c, slug, (l) =>
      comCampo(l, 'destino', (f) =>
        f.type === 'relationship' && Array.isArray(f.relationTo)
          ? ({ ...f, relationTo: [...f.relationTo, ...slugs] } as Field)
          : f,
      ),
    )
  }
  return c
}

/**
 * Troca um campo de uma coleção pelo caminho (`['tema', 'favicon']`), para o site ajustar o
 * que é dele num campo do núcleo — o texto de ajuda do admin, por exemplo, que sai também no
 * `payload-types.ts`. Caminho que não casa é erro: ajuste que some calado é regressão que
 * ninguém vê.
 */
export function ajustaCampo(config: Config, slug: string, caminho: readonly string[], troca: (campo: Field) => Field): Config {
  const [nome, ...resto] = caminho
  if (!nome) return config
  let achou = false
  const c = comColecao(config, slug, (col) => {
    const aplica = (campos: Field[], [n, ...r]: readonly string[]): Field[] =>
      campos.map((f) => {
        if (!('name' in f) || f.name !== n) return f
        if (r.length === 0) {
          achou = true
          return troca(f)
        }
        return 'fields' in f ? ({ ...f, fields: aplica(f.fields, r) } as Field) : f
      })
    return { ...col, fields: aplica(col.fields, caminho) }
  })
  if (!achou) throw new Error(`ajustaCampo: ${slug}.${caminho.join('.')} não existe`)
  return c
}
