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
  destaquesMin: 1,
  destaquesMax: 12,
  destaque: 200,
  faqMin: 1,
  faqMax: 12,
  pergunta: 200,
  resposta: 1000,
  generator: 100,
  promptVersion: 60,
})

export const STATUS_EDITORIAL = ['sem_conteudo', 'rascunho', 'em_revisao', 'aprovado'] as const
export type StatusEditorial = (typeof STATUS_EDITORIAL)[number]

/** Status que uma escrita automatizada pode gravar; aprovação é decisão humana. */
export const STATUS_AUTOMACAO: readonly StatusEditorial[] = ['sem_conteudo', 'rascunho', 'em_revisao']

export interface PerguntaFrequente { pergunta: string; resposta: string }

/** Campos que compõem o conteúdo editorial estruturado (sem proveniência). */
export const CAMPOS_EDITORIAIS = ['meta_title', 'meta_description', 'resumo', 'descricao_markdown', 'destaques', 'faq'] as const
/** Proveniência: idempotência (facts_hash) e rastreio do gerador. */
export const CAMPOS_PROVENIENCIA = ['facts_hash', 'content_generator', 'prompt_version'] as const
/** `prompt_version` é rastreio opcional; sem hash e gerador não há idempotência nem auditoria. */
const CAMPOS_OBRIGATORIOS_PROVENIENCIA = ['facts_hash', 'content_generator'] as const
/** Tudo o que uma escrita automatizada não pode alterar sem refresh explícito. `descricao` é o campo legado. */
export const CAMPOS_PROTEGIDOS = [...CAMPOS_EDITORIAIS, ...CAMPOS_PROVENIENCIA, 'descricao'] as const

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
const texto = (valor: unknown): valor is string => typeof valor === 'string' && valor.trim().length > 0
/** Não enviado: null, lista vazia ou texto vazio. Texto só com espaços É enviado — e inválido. */
const naoEnviado = (valor: unknown) => valor == null || valor === '' || (Array.isArray(valor) && valor.length === 0)
/** Sem conteúdo útil: como `naoEnviado`, mas texto em branco também não conta como conteúdo existente. */
export const ausente = (valor: unknown) => naoEnviado(valor) || (typeof valor === 'string' && !valor.trim())
/**
 * Preço é dado comercial da oferta: nunca entra no texto editorial (heurística deliberadamente simples).
 * Uma fonte só, sem flags: o validador a compila e o JSON Schema a publica (`not.pattern`). Por isso o
 * padrão não usa `/i` nem `\\d` — `[Rr]` e `[0-9]` valem igual em ECMA-262, Python, Java e Go.
 */
export const PADRAO_PRECO = String.raw`[Rr]\$\s*[0-9]|\b[0-9]+(?:[.,][0-9]+)?\s*[Rr][Ee][Aa][Ii][Ss]\b`
const PRECO = new RegExp(PADRAO_PRECO)
/** `texto()` = `trim()` não vazio; `\S` (ECMA-262) usa o mesmo conjunto de espaços que `String.prototype.trim`. */
export const PADRAO_TEXTO_NAO_EM_BRANCO = String.raw`\S`
const HASH = /^[a-f0-9]{64}$/

function textoLimitado(problemas: ProblemaConteudo[], path: string, valor: unknown, max: number, opcoes: { semPreco?: boolean } = {}) {
  if (!texto(valor)) return problemas.push({ path, message: 'Texto não vazio obrigatório.' })
  if (tamanho(valor) > max) problemas.push({ path, message: `No máximo ${max} caracteres.` })
  if (opcoes.semPreco && PRECO.test(valor)) problemas.push({ path, message: 'Preço pertence à oferta, não ao conteúdo editorial.' })
}

/** Valida somente o que está presente (null/''/[] contam como ausente); completude é `camposFaltantes`. */
export function validarConteudo(entrada: object): ProblemaConteudo[] {
  const c = entrada as Record<string, unknown>
  const p: ProblemaConteudo[] = []
  const L = LIMITES_CONTEUDO
  if (!naoEnviado(c.meta_title)) textoLimitado(p, 'meta_title', c.meta_title, L.metaTitle, { semPreco: true })
  if (!naoEnviado(c.meta_description)) textoLimitado(p, 'meta_description', c.meta_description, L.metaDescription, { semPreco: true })
  if (!naoEnviado(c.resumo)) textoLimitado(p, 'resumo', c.resumo, L.resumo, { semPreco: true })
  if (!naoEnviado(c.descricao_markdown)) textoLimitado(p, 'descricao_markdown', c.descricao_markdown, L.descricaoMarkdown, { semPreco: true })
  if (!naoEnviado(c.destaques)) {
    if (!Array.isArray(c.destaques)) p.push({ path: 'destaques', message: 'Lista de textos obrigatória.' })
    else {
      if (c.destaques.length > L.destaquesMax) p.push({ path: 'destaques', message: `No máximo ${L.destaquesMax} destaques.` })
      c.destaques.forEach((d, i) => textoLimitado(p, `destaques.${i}`, d, L.destaque, { semPreco: true }))
    }
  }
  if (!naoEnviado(c.faq)) {
    if (!Array.isArray(c.faq)) p.push({ path: 'faq', message: 'Lista de {pergunta, resposta} obrigatória.' })
    else {
      if (c.faq.length > L.faqMax) p.push({ path: 'faq', message: `No máximo ${L.faqMax} perguntas.` })
      const vistas = new Set<string>()
      c.faq.forEach((item, i) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return void p.push({ path: `faq.${i}`, message: 'Objeto {pergunta, resposta} obrigatório.' })
        for (const chave of Object.keys(item)) if (chave !== 'pergunta' && chave !== 'resposta') p.push({ path: `faq.${i}.${chave}`, message: 'Campo desconhecido.' })
        const { pergunta, resposta } = item as Record<string, unknown>
        textoLimitado(p, `faq.${i}.pergunta`, pergunta, L.pergunta)
        textoLimitado(p, `faq.${i}.resposta`, resposta, L.resposta, { semPreco: true })
        if (texto(pergunta)) {
          const chave = pergunta.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
          if (vistas.has(chave)) p.push({ path: `faq.${i}.pergunta`, message: 'Pergunta repetida.' })
          vistas.add(chave)
        }
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

/** Campos exigidos para o conteúdo ser considerado completo (revisão, aprovação, indexação). */
export function camposFaltantes(c: object): string[] {
  return [...CAMPOS_EDITORIAIS, ...CAMPOS_OBRIGATORIOS_PROVENIENCIA].filter(k => ausente((c as Record<string, unknown>)[k]))
}
export const conteudoCompleto = (c: object) =>
  camposFaltantes(c).length === 0 && validarConteudo(c).length === 0

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
  | { acao: 'nao_gerar'; motivo: 'conteudo_existente' | 'refresh_pendente_sem_hash' }
  | { acao: 'refresh'; motivo: 'refresh_solicitado' }

export interface ProdutoParaPlano extends ConteudoEditorial {
  descricao?: string | null
  editorial_status?: string | null
  editorial_refresh_em?: string | null
}

/**
 * Preflight editorial (`affiliate.preflight` 1.0): a decisão que o consumidor toma ANTES de
 * gerar conteúdo, só com campos legíveis. Função pura e sem efeitos — o CMS revalida tudo na
 * escrita. `null` = produto inexistente no tenant.
 * - produto novo ou sem conteúdo (nem `descricao` legada) → gerar;
 * - conteúdo existente: nunca gerar de novo, salvo refresh explícito (marcador humano);
 * - com refresh pendente, os mesmos `facts_hash` já gravados → nada a fazer (idempotência).
 */
export function planoDeConteudo(produto: ProdutoParaPlano | null, entrada: { facts_hash?: string } = {}): DecisaoConteudo {
  if (!produto) return { acao: 'gerar', motivo: 'produto_novo' }
  if (!temConteudoEditorial(produto)) return { acao: 'gerar', motivo: 'sem_conteudo' }
  if (!ausente(produto.editorial_refresh_em)) {
    if (!entrada.facts_hash) return { acao: 'nao_gerar', motivo: 'refresh_pendente_sem_hash' }
    return entrada.facts_hash === produto.facts_hash ? { acao: 'reutilizar', motivo: 'mesmos_fatos' } : { acao: 'refresh', motivo: 'refresh_solicitado' }
  }
  if (entrada.facts_hash && entrada.facts_hash === produto.facts_hash) return { acao: 'reutilizar', motivo: 'mesmos_fatos' }
  return { acao: 'nao_gerar', motivo: 'conteudo_existente' }
}

/**
 * Regras normativas do `product_content/v1` que o JSON Schema NÃO consegue expressar. Quem valida só
 * com o schema aceita entradas que o CMS recusa: use `validarConteudo` (ou deixe o CMS decidir na escrita).
 * Publicadas em `capabilities.content.rulesOutsideJsonSchema`.
 */
export const REGRAS_FORA_DO_JSON_SCHEMA = Object.freeze([
  { id: 'faq_question_unique_after_normalization', path: 'faq',
    description: 'Perguntas repetidas são recusadas depois de normalizar: Unicode NFKC, trim, minúsculas e espaços internos colapsados ("Quanto pesa?" == " quanto  PESA? "). `uniqueItems` só pega itens idênticos.' },
  { id: 'price_heuristic_is_approximate', path: 'meta_title|meta_description|resumo|descricao_markdown|destaques.*|faq.*.resposta',
    description: 'A exclusão de preço (`not.pattern` = PADRAO_PRECO) é a mesma heurística do validador, mas depende do dialeto de regex do validador de schema; `\\s` e `\\b` seguem ECMA-262.' },
  { id: 'facts_hash_is_provenance', path: 'facts_hash',
    description: 'O schema confere só o formato (SHA-256 hexadecimal minúsculo); que a hash seja a do pacote factual usado na geração é responsabilidade do gerador.' },
  { id: 'editorial_workflow', path: '(documento)',
    description: 'Draft-first, sem sobrescrita automática, refresh só por editor, aprovação e `indexavel` humanos, `content_version` do CMS e completude para revisão/aprovação são regras da escrita no CMS, não do formato.' },
  { id: 'schema_describes_complete_content', path: '(documento)',
    description: 'O schema descreve o conteúdo COMPLETO (`required`, `minItems`, sem `null`). O validador aceita rascunho parcial e trata null, "" e [] como ausente.' },
] as const)

const textoNaoVazio = (max: number, semPreco: boolean) => ({
  type: 'string', minLength: 1, maxLength: max, pattern: PADRAO_TEXTO_NAO_EM_BRANCO,
  ...(semPreco ? { not: { pattern: PADRAO_PRECO } } : {}),
})

/**
 * JSON Schema (2020-12) do `product_content/v1` para consumidores de qualquer linguagem. Reproduz o que
 * o schema consegue expressar de `validarConteudo` (texto não só em branco, sem preço, limites, campos
 * estritos); o restante está em `REGRAS_FORA_DO_JSON_SCHEMA`.
 */
export const JSON_SCHEMA_CONTEUDO_V1 = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'product_content/v1',
  type: 'object',
  additionalProperties: false,
  required: ['meta_title', 'meta_description', 'resumo', 'descricao_markdown', 'destaques', 'faq', 'facts_hash', 'content_generator'],
  properties: {
    meta_title: textoNaoVazio(LIMITES_CONTEUDO.metaTitle, true),
    meta_description: textoNaoVazio(LIMITES_CONTEUDO.metaDescription, true),
    resumo: textoNaoVazio(LIMITES_CONTEUDO.resumo, true),
    descricao_markdown: textoNaoVazio(LIMITES_CONTEUDO.descricaoMarkdown, true),
    destaques: { type: 'array', minItems: LIMITES_CONTEUDO.destaquesMin, maxItems: LIMITES_CONTEUDO.destaquesMax,
      items: textoNaoVazio(LIMITES_CONTEUDO.destaque, true) },
    faq: { type: 'array', minItems: LIMITES_CONTEUDO.faqMin, maxItems: LIMITES_CONTEUDO.faqMax, uniqueItems: true,
      $comment: 'Perguntas repetidas após normalização (NFKC, trim, minúsculas, espaços colapsados) também são recusadas; o schema não expressa isso — ver rulesOutsideJsonSchema.',
      items: { type: 'object', additionalProperties: false, required: ['pergunta', 'resposta'], properties: {
        pergunta: textoNaoVazio(LIMITES_CONTEUDO.pergunta, false),
        resposta: textoNaoVazio(LIMITES_CONTEUDO.resposta, true) } } },
    facts_hash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    content_generator: textoNaoVazio(LIMITES_CONTEUDO.generator, false),
    prompt_version: textoNaoVazio(LIMITES_CONTEUDO.promptVersion, false),
  },
})
