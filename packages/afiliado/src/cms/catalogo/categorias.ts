export interface ProblemaCategoria { path: string; message: string }

/** Política do site: só descreve identidade; não substitui as invariantes do catálogo. */
export interface CategoriaCatalogo {
  slug: string
  rotulo: string
  atributosDeIdentidade?: readonly string[]
  versaoIdentidade?: number
  validarVariante?: (variante: Readonly<Record<string, unknown>>, produto: Readonly<Record<string, unknown>>) => ProblemaCategoria[]
}

export interface CategoriaRegistrada extends Readonly<CategoriaCatalogo> {
  readonly atributosDeIdentidade: readonly string[]
  readonly versaoIdentidade: number
  readonly legada: boolean
  readonly exigeAtributos: boolean
  readonly matchPorAtributos: boolean
  readonly erroAtributo?: string
}
export type RegistroCategorias = readonly CategoriaRegistrada[]

export const atributosFilamento = Object.freeze(['material', 'cor', 'peso_g', 'diametro_mm', 'acabamento'] as const)
const padrao = (slug: string, exigeAtributos = false): CategoriaRegistrada => Object.freeze({
  slug, rotulo: slug, atributosDeIdentidade: atributosFilamento, versaoIdentidade: 1, legada: true,
  exigeAtributos, matchPorAtributos: exigeAtributos,
  ...(exigeAtributos ? { erroAtributo: 'Filamento confirmado exige atributo comparável.' } : {}),
})
/** Imutável; os quatro defaults conservam regras e hashes anteriores ao registro. */
export const REGISTRO_CATEGORIAS_PADRAO: RegistroCategorias = Object.freeze([
  padrao('filamento', true), padrao('impressora'), padrao('resina'), padrao('acessorio'),
])

const camposEscalares = new Set(['sku_fabricante', 'gtin', ...atributosFilamento])
const partesProibidas = new Set(['__proto__', 'prototype', 'constructor'])
const caminhoValido = (path: string) => camposEscalares.has(path) ||
  (path.startsWith('especificacoes.') && path.split('.').every(p => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p) && !partesProibidas.has(p)))

export function registrarCategorias(adicionais: readonly CategoriaCatalogo[] = []): RegistroCategorias {
  if (!adicionais.length) return REGISTRO_CATEGORIAS_PADRAO
  const slugs = new Set(REGISTRO_CATEGORIAS_PADRAO.map(c => c.slug))
  const novas = adicionais.map(c => {
    if (typeof c.slug !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(c.slug) || slugs.has(c.slug)) throw new Error(`Categoria inválida ou duplicada: ${c.slug}`)
    if (typeof c.rotulo !== 'string' || !c.rotulo.trim()) throw new Error(`Categoria ${c.slug} exige rótulo.`)
    const versaoIdentidade = c.versaoIdentidade ?? 1
    if (!Number.isSafeInteger(versaoIdentidade) || versaoIdentidade < 1) throw new Error(`Categoria ${c.slug} exige versão de identidade positiva.`)
    const atributos = [...(c.atributosDeIdentidade ?? [])]
    if (atributos.some((p, i) => typeof p !== 'string' || !caminhoValido(p) || atributos.some((outro, j) =>
      i !== j && (outro === p || outro.startsWith(`${p}.`))))) throw new Error(`Atributos inválidos ou ambíguos na categoria ${c.slug}.`)
    if (c.validarVariante != null && typeof c.validarVariante !== 'function') throw new Error(`Validador inválido na categoria ${c.slug}.`)
    slugs.add(c.slug)
    return Object.freeze({ slug: c.slug, rotulo: c.rotulo, versaoIdentidade,
      atributosDeIdentidade: Object.freeze(atributos), validarVariante: c.validarVariante,
      legada: false, exigeAtributos: true, matchPorAtributos: atributos.length > 0 })
  })
  return Object.freeze([...REGISTRO_CATEGORIAS_PADRAO, ...novas])
}

export const categoriaRegistrada = (slug: unknown, registro: RegistroCategorias = REGISTRO_CATEGORIAS_PADRAO) =>
  registro.find(c => c.slug === slug)

/** Nunca percorre prototype ou índices de array vindos de especificacoes. */
export function valorDoAtributo(doc: Record<string, unknown>, path: string): unknown {
  let value: unknown = doc
  for (const part of path.split('.')) {
    if (partesProibidas.has(part) || !value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, part)) return undefined
    value = (value as Record<string, unknown>)[part]
  }
  return value
}

/** Valores genéricos preservam tipo: false não vira a string "false". */
export function valorComparavel(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const normalized = value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
    return normalized ? JSON.stringify(['string', normalized]) : undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(['number', value])
  if (typeof value === 'boolean') return JSON.stringify(['boolean', value])
  return undefined
}
