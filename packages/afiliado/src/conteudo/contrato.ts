/**
 * Contrato `product_content/v1`: o conteúdo editorial pertence ao produto canônico
 * (nunca à variante, ao listing ou à oferta). Este módulo é puro — sem Payload, sem Node —
 * para servir ao hook do CMS, ao DTO do site e ao JSON Schema que os consumidores leem.
 */

export const CONTEUDO_SCHEMA = 'product_content/v1'

export const LIMITES_CONTEUDO = Object.freeze({
  metaTitle: 60,
  metaDescription: 155,
  resumo: 1000,
  descricaoMarkdown: 20000,
  destaque: 200,
  generator: 100,
  promptVersion: 60,
})

export const STATUS_EDITORIAL = ['sem_conteudo', 'rascunho', 'em_revisao', 'aprovado'] as const
export type StatusEditorial = (typeof STATUS_EDITORIAL)[number]

/** O status é informativo: a revisão acontece no pipeline externo, não no CMS. */
export const STATUS_AUTOMACAO: readonly StatusEditorial[] = STATUS_EDITORIAL

export interface PerguntaFrequente { pergunta: string; resposta: string }

/** Campos que compõem o conteúdo editorial estruturado (sem proveniência). */
export const CAMPOS_EDITORIAIS = ['meta_title', 'meta_description', 'resumo', 'descricao_markdown', 'destaques', 'faq'] as const
/** Proveniência: idempotência (facts_hash) e rastreio do gerador. */
export const CAMPOS_PROVENIENCIA = ['facts_hash', 'content_generator', 'prompt_version'] as const

export interface ConteudoEditorial {
  meta_title?: string | null
  meta_description?: string | null
  resumo?: string | null
  descricao_markdown?: string | null
  destaques?: string[] | null
  faq?: PerguntaFrequente[] | null
  facts_hash?: string | null
  content_generator?: string | null
  prompt_version?: string | null
}

export interface ProblemaConteudo { path: string; message: string }

const tamanho = (valor: string) => Array.from(valor).length
const texto = (valor: unknown): valor is string => typeof valor === 'string'
/** Não enviado: null, lista vazia ou texto vazio. */
const naoEnviado = (valor: unknown) => valor == null || valor === '' || (Array.isArray(valor) && valor.length === 0)
/** Sem conteúdo útil: como `naoEnviado`, mas texto em branco também não conta como conteúdo existente. */
export const ausente = (valor: unknown) => naoEnviado(valor) || (typeof valor === 'string' && !valor.trim())
const HASH = /^[a-f0-9]{64}$/

function textoLimitado(problemas: ProblemaConteudo[], path: string, valor: unknown, max: number) {
  if (!texto(valor)) return problemas.push({ path, message: 'Texto obrigatório.' })
  if (tamanho(valor) > max) problemas.push({ path, message: `No máximo ${max} caracteres.` })
}

/** Só forma e tamanho: veracidade, repetição e preço no texto são responsabilidade do Hermes. */
export function validarConteudo(entrada: object): ProblemaConteudo[] {
  const c = entrada as Record<string, unknown>
  const p: ProblemaConteudo[] = []
  const L = LIMITES_CONTEUDO
  if (!naoEnviado(c.meta_title)) textoLimitado(p, 'meta_title', c.meta_title, L.metaTitle)
  if (!naoEnviado(c.meta_description)) textoLimitado(p, 'meta_description', c.meta_description, L.metaDescription)
  if (!naoEnviado(c.resumo)) textoLimitado(p, 'resumo', c.resumo, L.resumo)
  if (!naoEnviado(c.descricao_markdown)) textoLimitado(p, 'descricao_markdown', c.descricao_markdown, L.descricaoMarkdown)
  if (!naoEnviado(c.destaques)) {
    if (!Array.isArray(c.destaques)) p.push({ path: 'destaques', message: 'Lista de textos obrigatória.' })
    else {
      c.destaques.forEach((d, i) => textoLimitado(p, `destaques.${i}`, d, L.destaque))
    }
  }
  if (!naoEnviado(c.faq)) {
    if (!Array.isArray(c.faq)) p.push({ path: 'faq', message: 'Lista de {pergunta, resposta} obrigatória.' })
    else {
      c.faq.forEach((item, i) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return void p.push({ path: `faq.${i}`, message: 'Objeto {pergunta, resposta} obrigatório.' })
        for (const chave of Object.keys(item)) if (chave !== 'pergunta' && chave !== 'resposta') p.push({ path: `faq.${i}.${chave}`, message: 'Campo desconhecido.' })
        const { pergunta, resposta } = item as Record<string, unknown>
        if (!texto(pergunta)) p.push({ path: `faq.${i}.pergunta`, message: 'Texto obrigatório.' })
        if (!texto(resposta)) p.push({ path: `faq.${i}.resposta`, message: 'Texto obrigatório.' })
      })
    }
  }
  if (!naoEnviado(c.facts_hash) && !(typeof c.facts_hash === 'string' && HASH.test(c.facts_hash))) {
    p.push({ path: 'facts_hash', message: 'SHA-256 em hexadecimal minúsculo (64 caracteres).' })
  }
  if (!naoEnviado(c.content_generator)) textoLimitado(p, 'content_generator', c.content_generator, L.generator)
  if (!naoEnviado(c.prompt_version)) textoLimitado(p, 'prompt_version', c.prompt_version, L.promptVersion)
  return p
}

export const temConteudoEditorial = (c: object) =>
  [...CAMPOS_EDITORIAIS, 'descricao'].some(k => !ausente((c as Record<string, unknown>)[k]))

/** Igualdade estrutural, independente da ordem das chaves — a comparação de "mudou?" do hook. */
export function iguais(a: unknown, b: unknown): boolean {
  if (ausente(a) && ausente(b)) return true
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => iguais(x, b[i]))
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b)
    return ka.length === kb.length && ka.every(k => Object.hasOwn(b, k) && iguais((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return false
}

export type DecisaoConteudo =
  | { acao: 'gerar'; motivo: 'produto_novo' | 'sem_conteudo' }
  | { acao: 'reutilizar'; motivo: 'mesmos_fatos' }
  | { acao: 'atualizar'; motivo: 'fatos_diferentes_ou_desconhecidos' }

export interface ProdutoParaPlano extends ConteudoEditorial {
  descricao?: string | null
}

/**
 * Preflight puro para poupar geração idêntica, não para autorizar publicação. O Hermes decide
 * se precisa atualizar: conteúdo existente nunca fica bloqueado por um marcador no CMS.
 */
export function planoDeConteudo(produto: ProdutoParaPlano | null, entrada: { facts_hash?: string } = {}): DecisaoConteudo {
  if (!produto) return { acao: 'gerar', motivo: 'produto_novo' }
  if (!temConteudoEditorial(produto)) return { acao: 'gerar', motivo: 'sem_conteudo' }
  if (entrada.facts_hash && entrada.facts_hash === produto.facts_hash) return { acao: 'reutilizar', motivo: 'mesmos_fatos' }
  return { acao: 'atualizar', motivo: 'fatos_diferentes_ou_desconhecidos' }
}

/**
 * Informações que um schema de forma não prova. Pesquisa e revisão são feitas pelo Hermes.
 */
export const REGRAS_FORA_DO_JSON_SCHEMA = Object.freeze([
  { id: 'facts_hash_is_provenance', path: 'facts_hash',
    description: 'O schema confere só o formato; que a hash corresponda aos fatos usados é responsabilidade do gerador.' },
  { id: 'review_is_external', path: '(documento)',
    description: 'Veracidade, qualidade, preço no texto e perguntas repetidas são revisados pelo pipeline editorial externo, não pelo CMS.' },
] as const)

const textoSchema = (max: number) => ({ type: 'string', maxLength: max })

/**
 * JSON Schema (2020-12) estrutural. Os campos são opcionais; o CMS não decide se o texto está pronto.
 */
export const JSON_SCHEMA_CONTEUDO_V1 = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'product_content/v1',
  type: 'object',
  additionalProperties: false,
  properties: {
    meta_title: textoSchema(LIMITES_CONTEUDO.metaTitle),
    meta_description: textoSchema(LIMITES_CONTEUDO.metaDescription),
    resumo: textoSchema(LIMITES_CONTEUDO.resumo),
    descricao_markdown: textoSchema(LIMITES_CONTEUDO.descricaoMarkdown),
    destaques: { type: 'array', items: textoSchema(LIMITES_CONTEUDO.destaque) },
    faq: { type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['pergunta', 'resposta'], properties: {
        pergunta: { type: 'string' }, resposta: { type: 'string' } } } },
    facts_hash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    content_generator: textoSchema(LIMITES_CONTEUDO.generator),
    prompt_version: textoSchema(LIMITES_CONTEUDO.promptVersion),
  },
})
