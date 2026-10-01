import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import { descritorCapacidades, JSON_SCHEMA_CONTEUDO_V1, planoDeConteudo, validarConteudo } from '../src/conteudo'
import { hashDeFatos, PacoteFactualInvalidoError } from '../src/cms/catalogo/conteudo'

const hash = 'a'.repeat(64)
const paths = (c: object) => validarConteudo(c).map(p => p.path)

describe('product_content/v1 valida estrutura, não decisão editorial', () => {
  it('aceita conteúdo parcial, FAQ repetida, preço em texto e FAQ vazia', () => {
    expect(paths({})).toEqual([])
    expect(paths({ resumo: 'R$ 99,90', faq: [{ pergunta: 'P?', resposta: '50 reais' }, { pergunta: 'P?', resposta: '50 reais' }] })).toEqual([])
    expect(paths({ faq: [] })).toEqual([])
    expect(paths({ faq: Array.from({ length: 30 }, () => ({ pergunta: 'P?', resposta: 'R' })) })).toEqual([])
  })
  it('rejeita tipo ou tamanho inválido com path preciso', () => {
    expect(paths({ meta_title: 'á'.repeat(60) })).toEqual([])
    expect(paths({ meta_title: 'á'.repeat(61) })).toEqual(['meta_title'])
    expect(paths({ meta_description: 'ã'.repeat(156) })).toEqual(['meta_description'])
    expect(paths({ destaques: [3, 'x'.repeat(201)] })).toEqual(['destaques.0', 'destaques.1'])
    expect(paths({ faq: {} })).toEqual(['faq'])
    expect(paths({ faq: [{ pergunta: 'P?' }] })).toEqual(['faq.0.resposta'])
    expect(paths({ faq: [{ pergunta: 'P?', resposta: 'R', extra: true }] })).toEqual(['faq.0.extra'])
    expect(paths({ facts_hash: 'A'.repeat(64) })).toEqual(['facts_hash'])
  })
})

describe('JSON Schema e capabilities', () => {
  const schema = new Ajv2020({ strict: true, allErrors: true }).compile(JSON_SCHEMA_CONTEUDO_V1)
  const casos: object[] = [{}, { resumo: 'R$ 99,90', faq: [] },
    { faq: [{ pergunta: 'P?', resposta: 'R' }, { pergunta: 'P?', resposta: 'R' }] },
    { faq: Array.from({ length: 30 }, () => ({ pergunta: 'P?', resposta: 'R' })) },
    { meta_title: '😀'.repeat(60) }, { meta_title: '😀'.repeat(61) }, { destaques: [3] },
    { faq: [{ pergunta: 'P?' }] }, { faq: [{ pergunta: 'P?', resposta: 'R', extra: true }] },
    { facts_hash: hash }, { facts_hash: 'A'.repeat(64) }]
  it.each(casos)('schema e validador concordam sobre forma', c => {
    expect(schema(c), JSON.stringify(schema.errors)).toBe(paths(c).length === 0)
  })
  it('descreve responsabilidades externas sem bloqueio editorial', () => {
    const d = descritorCapacidades([])
    expect(d.content.jsonSchema).toBe(JSON_SCHEMA_CONTEUDO_V1)
    expect(d.content.rulesOutsideJsonSchema.map(r => r.id)).toContain('review_is_external')
    expect(d.content.rules).toContain('agent_may_publish_and_index_explicitly')
    expect(d.content.rules).not.toContain('no_automatic_overwrite')
  })
})

describe('facts_hash: idempotência sem perda silenciosa de dados', () => {
  it('é estável para objetos equivalentes e distingue fatos diferentes', () => {
    expect(hashDeFatos({ b: 2, a: [1, { y: 1, x: 2 }] })).toBe(hashDeFatos({ a: [1, { x: 2, y: 1 }], b: 2 }))
    expect(hashDeFatos({ n: 1 })).not.toBe(hashDeFatos({ n: '1' }))
    expect(hashDeFatos([1, 2])).not.toBe(hashDeFatos([2, 1]))
  })
  it('recusa estruturas não JSON sem expor valores em erros', () => {
    const segredo = 'segredo com espaço/123'
    for (const ruim of [{ a: undefined }, { a: Number.NaN }, { [segredo]: new Date(0) }]) expect(() => hashDeFatos(ruim)).toThrow(PacoteFactualInvalidoError)
    try { hashDeFatos({ [segredo]: new Date(0) }) } catch (e) { expect((e as Error).message).not.toContain(segredo) }
  })
  it('preserva distinções de tipo, array e null sem colisões por descarte', () => {
    const entradas: unknown[] = [[1, 2], [2, 1], [1, '2'], ['1', '2'], [null], [], [0], [false], [''],
      { a: null }, { a: 0 }, {}, { a: {} }, { a: [] }, { a: 1, b: 1 }]
    expect(new Set(entradas.map(hashDeFatos)).size).toBe(entradas.length)
  })
  it('recusa objetos hostis, ciclos e tipos que JSON.stringify descartaria', () => {
    const ciclo: any = {}; ciclo.self = ciclo
    const comGetter = Object.defineProperty({}, 'g', { enumerable: true, get: () => 1 })
    const comSimbolo = { [Symbol('s')]: 1 }
    const comBuraco = [1, , 3] // eslint-disable-line no-sparse-arrays
    const hostil = new Proxy({}, { ownKeys() { throw new Error('segredo interno') } })
    for (const entrada of [ciclo, comGetter, comSimbolo, comBuraco, hostil, { n: Infinity }, { n: 10n },
      { f: () => 1 }, { r: /x/ }, { set: new Set() }, { a: [undefined] }]) {
      expect(() => hashDeFatos(entrada)).toThrow(PacoteFactualInvalidoError)
    }
    try { hashDeFatos(hostil) } catch (e) { expect((e as Error).message).not.toContain('segredo') }
  })
})

describe('preflight é conselho, não autorização de atualização', () => {
  it('gera sem conteúdo, reutiliza hash igual e permite atualizar o restante', () => {
    expect(planoDeConteudo(null)).toEqual({ acao: 'gerar', motivo: 'produto_novo' })
    expect(planoDeConteudo({})).toEqual({ acao: 'gerar', motivo: 'sem_conteudo' })
    expect(planoDeConteudo({ resumo: 'Antigo', facts_hash: hash }, { facts_hash: hash })).toEqual({ acao: 'reutilizar', motivo: 'mesmos_fatos' })
    expect(planoDeConteudo({ resumo: 'Antigo', facts_hash: hash }, { facts_hash: 'b'.repeat(64) })).toEqual({ acao: 'atualizar', motivo: 'fatos_diferentes_ou_desconhecidos' })
    expect(planoDeConteudo({ resumo: 'Antigo' })).toEqual({ acao: 'atualizar', motivo: 'fatos_diferentes_ou_desconhecidos' })
  })
})
