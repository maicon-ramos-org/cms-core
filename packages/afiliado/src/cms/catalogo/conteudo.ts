import { createHash } from 'node:crypto'
import { hasRole, isSuperAdmin } from '@maicon-ramos-org/cms-core'
import { ValidationError, type CollectionBeforeChangeHook, type Field } from 'payload'
import {
  ausente, CAMPOS_EDITORIAIS, CAMPOS_PROVENIENCIA, iguais,
  LIMITES_CONTEUDO, STATUS_EDITORIAL, validarConteudo, type ProblemaConteudo,
} from '../../conteudo/contrato'

type Doc = Record<string, any>

/**
 * Campos do conteúdo editorial em `produtos_fisicos` (contrato `product_content/v1`). O JSON
 * (`destaques`, `faq`) é validado apenas por forma em `validaConteudoEditorial`.
 * `descricao` continua existindo para compatibilidade com os produtos legados.
 */
export const camposConteudoEditorial: Field[] = [
  { name: 'meta_title', type: 'text', maxLength: LIMITES_CONTEUDO.metaTitle },
  { name: 'meta_description', type: 'text', maxLength: LIMITES_CONTEUDO.metaDescription },
  { name: 'resumo', type: 'textarea', maxLength: LIMITES_CONTEUDO.resumo },
  { name: 'descricao_markdown', type: 'textarea', maxLength: LIMITES_CONTEUDO.descricaoMarkdown },
  { name: 'destaques', type: 'json', admin: { description: 'Lista de textos; revisão editorial feita fora do CMS.' } },
  { name: 'faq', type: 'json', admin: { description: 'Lista de { pergunta, resposta }; revisão feita pelo Hermes.' } },
  { name: 'facts_hash', type: 'text', admin: { description: 'SHA-256 do pacote factual que gerou o texto; mesma hash = mesma geração.' } },
  { name: 'content_generator', type: 'text', maxLength: LIMITES_CONTEUDO.generator },
  { name: 'prompt_version', type: 'text', maxLength: LIMITES_CONTEUDO.promptVersion },
  { name: 'content_version', type: 'number', min: 1, admin: { readOnly: true, description: 'Edição do conteúdo; o CMS incrementa a cada mudança aceita.' } },
  { name: 'editorial_status', type: 'select', options: [...STATUS_EDITORIAL], required: true, defaultValue: 'sem_conteudo',
    admin: { description: 'Estado informativo do pipeline externo; não bloqueia publicação no CMS.' } },
  { name: 'editorial_refresh_em', type: 'date', admin: { description: 'Marcador informativo; não é necessário para atualizar conteúdo.' } },
  { name: 'editorial_refresh_motivo', type: 'text', maxLength: 300 },
  { name: 'indexavel', type: 'checkbox', defaultValue: false, admin: { description: 'O agente publicador ou editor pode ligar ao publicar o produto.' } },
]

const recusa = (problemas: ProblemaConteudo[]): never => { throw new ValidationError({ errors: problemas }) }
const podePublicar = (user: unknown) => !user || isSuperAdmin(user) || hasRole(user, 'editor') || hasRole(user, 'agente')

/**
 * O CMS confere só o formato persistido. O Hermes pesquisa e revisa antes de o publicador
 * gravar; ele pode criar já publicado/indexável. O CMS não repete avaliação editorial.
 */
export const validaConteudoEditorial: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  const atual: Doc = originalDoc?.id ? originalDoc : {}
  const efetivo: Doc = { ...atual, ...data }
  const problemas: ProblemaConteudo[] = []
  const tocados = [...CAMPOS_EDITORIAIS, ...CAMPOS_PROVENIENCIA].filter(k => k in data)
  const mudou = (k: string) => k in data && !iguais(data[k], atual[k])

  problemas.push(...validarConteudo(Object.fromEntries(tocados.map(k => [k, data[k]]))))

  const status: string = efetivo.editorial_status ?? 'sem_conteudo'
  const temEstruturado = CAMPOS_EDITORIAIS.some(k => !ausente(efetivo[k]))
  // O status é um registro do pipeline; sem valor explícito, conteúdo novo nasce como rascunho.
  if (status === 'sem_conteudo' && temEstruturado) data.editorial_status = 'rascunho'
  if (data.indexavel === true && atual.indexavel !== true) {
    if (!podePublicar(req.user)) problemas.push({ path: 'indexavel', message: 'A credencial de ingestão não indexa produtos.' })
    else if (efetivo.estado !== 'published') problemas.push({ path: 'indexavel', message: 'Indexar exige produto publicado.' })
  }
  if (problemas.length) return recusa(problemas)

  if (efetivo.estado !== 'published' && atual.indexavel === true) data.indexavel = false

  // content_version é do CMS: o cliente não o escolhe
  if (tocados.some(mudou)) data.content_version = (Number(atual.content_version) || 0) + 1
  else if ('content_version' in data) data.content_version = atual.content_version ?? null
  return data
}

/** Pacote factual que não é JSON puro; a mensagem nunca carrega valores (fatos podem ter dado sensível). */
export class PacoteFactualInvalidoError extends Error {
  constructor(readonly caminho: string, readonly motivo: string) {
    super(`Pacote factual inválido em ${caminho}: ${motivo}.`)
    this.name = 'PacoteFactualInvalidoError'
  }
}
const PROFUNDIDADE_MAXIMA = 100
/** Só nomes de campo simples entram no caminho; qualquer outra chave vira `[chave]`. */
const segmento = (chave: string) => (/^[\w.-]{1,40}$/.test(chave) ? chave : '[chave]')

/**
 * JSON canônico (chaves ordenadas): a mesma entrada dá sempre o mesmo hash. Aceita SÓ valores JSON
 * reais — null, boolean, número finito, string, arrays e objetos planos (protótipo `Object.prototype`
 * ou `null`). Nada é descartado nem convertido em silêncio (undefined, Date, Map, Set, instância de
 * classe, função, símbolo, bigint, NaN/Infinity, buraco em array, chave símbolo, getter, ciclo):
 * conversão silenciosa faria fatos diferentes colidirem na mesma hash.
 */
function canonico(valor: unknown, caminho = '$', ancestrais: object[] = []): string {
  const recusa = (motivo: string): never => { throw new PacoteFactualInvalidoError(caminho, motivo) }
  if (valor === null || typeof valor === 'string' || typeof valor === 'boolean') return JSON.stringify(valor)
  if (typeof valor === 'number') return Number.isFinite(valor) ? JSON.stringify(valor) : recusa('número não finito')
  if (typeof valor !== 'object') return recusa(`tipo ${typeof valor} não é JSON`)
  if (ancestrais.includes(valor)) return recusa('referência circular')
  if (ancestrais.length >= PROFUNDIDADE_MAXIMA) return recusa('aninhamento profundo demais')
  const proximos = [...ancestrais, valor]
  if (Array.isArray(valor)) {
    if (Object.getPrototypeOf(valor) !== Array.prototype) return recusa('array não plano')
    const chaves = Reflect.ownKeys(valor)
    if (chaves.length !== valor.length + 1) return recusa('array com buraco ou propriedade extra')
    return `[${Array.from({ length: valor.length }, (_, i) => canonico(valor[i], `${caminho}[${i}]`, proximos)).join(',')}]`
  }
  const proto = Object.getPrototypeOf(valor)
  if (proto !== Object.prototype && proto !== null) return recusa('objeto não plano (Date, Map, Set ou instância de classe)')
  if (Object.getOwnPropertySymbols(valor).length) return recusa('chave símbolo')
  const chaves = Object.getOwnPropertyNames(valor).sort()
  const partes = chaves.map(chave => {
    const filho = `${caminho}.${segmento(chave)}`
    const d = Object.getOwnPropertyDescriptor(valor, chave)!
    if (!('value' in d) || !d.enumerable) return recusa(`propriedade ${segmento(chave)} não é um dado enumerável`)
    return `${JSON.stringify(chave)}:${canonico(d.value, filho, proximos)}`
  })
  return `{${partes.join(',')}}`
}
/** `facts_hash` de um pacote factual (sem preço, estoque ou link): base da idempotência da geração. */
export const hashDeFatos = (pacote: unknown): string => {
  let json: string
  try { json = canonico(pacote) } catch (erro) {
    if (erro instanceof PacoteFactualInvalidoError) throw erro
    throw new PacoteFactualInvalidoError('$', 'estrutura não serializável') // ex.: Proxy hostil, estouro de pilha
  }
  return createHash('sha256').update(json).digest('hex')
}

/**
 * Migração opt-in da `descricao` legada: copia para `descricao_markdown` como RASCUNHO, só onde
 * o conteúdo estruturado está vazio e o status ainda é `sem_conteudo`. Idempotente, nunca
 * sobrescreve, não toca `indexavel` (default false). Rode dentro da migration do site, se e
 * quando o editor quiser promover o texto antigo (acrescente `AND tenant_id = <id>` para um tenant).
 */
export const SQL_BACKFILL_DESCRICAO_LEGADA = `UPDATE produtos_fisicos
   SET descricao_markdown = descricao, editorial_status = 'rascunho', content_version = 1
 WHERE descricao IS NOT NULL AND btrim(descricao) <> ''
   AND (descricao_markdown IS NULL OR btrim(descricao_markdown) = '')
   AND editorial_status = 'sem_conteudo'`
