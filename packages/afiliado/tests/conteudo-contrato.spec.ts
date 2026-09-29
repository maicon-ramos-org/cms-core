import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import {
  camposFaltantes, conteudoCompleto, descritorCapacidades, JSON_SCHEMA_CONTEUDO_V1, LIMITES_CONTEUDO, PADRAO_PRECO,
  PADRAO_TEXTO_NAO_EM_BRANCO, planoDeConteudo, REGRAS_FORA_DO_JSON_SCHEMA, validarConteudo,
} from '../src/conteudo'
import { hashDeFatos, PacoteFactualInvalidoError } from '../src/cms/catalogo/conteudo'

const hash = 'a'.repeat(64)
const completo = {
  meta_title: 'Título com até sessenta caracteres', meta_description: 'Descrição curta e factual do produto.',
  resumo: 'Resumo em um parágrafo.', descricao_markdown: '## O que é\n\nTexto factual.',
  destaques: ['Primeiro fato', 'Segundo fato'], faq: [{ pergunta: 'Serve para quê?', resposta: 'Para o uso descrito.' }],
  facts_hash: hash, content_generator: 'gerador-de-teste', prompt_version: 'v3',
}
const paths = (c: object) => validarConteudo(c).map(p => p.path)

describe('validação tipada de product_content/v1', () => {
  it('aceita conteúdo completo e vazio (ausente não é inválido; completude é outra pergunta)', () => {
    expect(validarConteudo(completo)).toEqual([])
    expect(validarConteudo({})).toEqual([])
    expect(conteudoCompleto(completo)).toBe(true)
    expect(camposFaltantes({})).toEqual(['meta_title', 'meta_description', 'resumo', 'descricao_markdown', 'destaques', 'faq', 'facts_hash', 'content_generator'])
  })
  it('limites exatos: meta_title 60 e meta_description 155, contando caracteres e não bytes', () => {
    expect(paths({ meta_title: 'á'.repeat(60) })).toEqual([])
    expect(paths({ meta_title: 'á'.repeat(61) })).toEqual(['meta_title'])
    expect(paths({ meta_description: 'ã'.repeat(155) })).toEqual([])
    expect(paths({ meta_description: 'ã'.repeat(156) })).toEqual(['meta_description'])
    expect(LIMITES_CONTEUDO.metaTitle).toBe(60)
    expect(LIMITES_CONTEUDO.metaDescription).toBe(155)
  })
  it('destaques: só textos, limite de itens e de tamanho', () => {
    expect(paths({ destaques: 'texto' })).toEqual(['destaques'])
    expect(paths({ destaques: ['ok', 3] })).toEqual(['destaques.1'])
    expect(paths({ destaques: [' '] })).toEqual(['destaques.0'])
    expect(paths({ destaques: Array(13).fill('x') })).toContain('destaques')
    expect(paths({ destaques: ['x'.repeat(201)] })).toEqual(['destaques.0'])
  })
  it('faq: objeto estrito, sem campo extra, sem pergunta repetida', () => {
    expect(paths({ faq: {} })).toEqual(['faq'])
    expect(paths({ faq: ['texto'] })).toEqual(['faq.0'])
    expect(paths({ faq: [{ pergunta: 'A?', resposta: 'B', extra: 1 }] })).toEqual(['faq.0.extra'])
    expect(paths({ faq: [{ pergunta: 'A?' }] })).toEqual(['faq.0.resposta'])
    expect(paths({ faq: [{ pergunta: 'Quanto pesa?', resposta: '1 kg' }, { pergunta: ' quanto  PESA? ', resposta: '2 kg' }] })).toEqual(['faq.1.pergunta'])
    expect(paths({ faq: Array.from({ length: 13 }, (_, i) => ({ pergunta: `p${i}`, resposta: 'r' })) })).toContain('faq')
  })
  it('facts_hash é SHA-256 hexadecimal minúsculo', () => {
    expect(paths({ facts_hash: 'ABC' })).toEqual(['facts_hash'])
    expect(paths({ facts_hash: 'A'.repeat(64) })).toEqual(['facts_hash'])
  })
  it('preço pertence à oferta: rejeitado nos textos editoriais', () => {
    expect(paths({ resumo: 'Sai por R$ 99,90 hoje' })).toEqual(['resumo'])
    expect(paths({ faq: [{ pergunta: 'Quanto custa?', resposta: 'Custa 50 reais' }] })).toEqual(['faq.0.resposta'])
    expect(paths({ meta_description: 'Modelo de 1,5 kg com 220 V' })).toEqual([])
  })
})

describe('JSON Schema publicado', () => {
  it('usa os mesmos limites do validador e exige os mesmos campos da completude', () => {
    const s = JSON_SCHEMA_CONTEUDO_V1 as any
    expect(s.properties.meta_title.maxLength).toBe(60)
    expect(s.properties.meta_description.maxLength).toBe(155)
    expect(s.required).toEqual(camposFaltantes({}))
    expect(s.additionalProperties).toBe(false)
    expect(s.properties.faq.items.additionalProperties).toBe(false)
  })

  // Paridade: para entrada REPRESENTÁVEL em JSON Schema, schema e validador (mais completude) concordam.
  const validaSchema = new Ajv2020({ strict: true, allErrors: true }).compile(JSON_SCHEMA_CONTEUDO_V1)
  const pelaValidacao = (c: object) => validarConteudo(c).length === 0 && camposFaltantes(c).length === 0
  const com = (extra: Record<string, unknown>) => ({ ...completo, ...extra })
  const semCampo = (k: string) => Object.fromEntries(Object.entries(completo).filter(([n]) => n !== k))
  const faq = (...itens: Array<[string, string]>) => itens.map(([pergunta, resposta]) => ({ pergunta, resposta }))
  const brancos = ['   ', '\n\t', '\u00a0', '\u3000', '\ufeff', '\u2028']
  const casos: Array<[string, object]> = [
    ['completo', completo],
    ['sem prompt_version (opcional)', semCampo('prompt_version')],
    ...['meta_title', 'meta_description', 'resumo', 'descricao_markdown', 'facts_hash', 'content_generator'].map(k => [`sem ${k}`, semCampo(k)] as [string, object]),
    ...['meta_title', 'meta_description', 'resumo', 'descricao_markdown', 'content_generator', 'prompt_version'].flatMap(k =>
      brancos.map(b => [`${k} só em branco ${JSON.stringify(b)}`, com({ [k]: b })] as [string, object])),
    ...brancos.map(b => [`destaque só em branco ${JSON.stringify(b)}`, com({ destaques: ['ok', b] })] as [string, object]),
    ...brancos.map(b => [`faq pergunta só em branco ${JSON.stringify(b)}`, com({ faq: faq([b, 'r']) })] as [string, object]),
    ...brancos.map(b => [`faq resposta só em branco ${JSON.stringify(b)}`, com({ faq: faq(['p?', b]) })] as [string, object]),
    ['texto com espaço nas pontas', com({ resumo: '  útil  ' })],
    ...['Sai por R$ 99,90', 'r$99', 'R$\t5', '50 reais', '1,5 REAIS', 'só 2.5 Reais!', 'de 10reais'].flatMap(preco => [
      ...['meta_title', 'meta_description', 'resumo', 'descricao_markdown'].map(k => [`preço "${preco}" em ${k}`, com({ [k]: preco })] as [string, object]),
      [`preço "${preco}" em destaque`, com({ destaques: [preco] })] as [string, object],
      [`preço "${preco}" na resposta`, com({ faq: faq(['Custa?', preco]) })] as [string, object],
      [`preço "${preco}" na PERGUNTA (permitido)`, com({ faq: faq([preco, 'Ver a oferta.']) })] as [string, object],
    ]),
    ...['Modelo de 1,5 kg com 220 V', 'R$ sem número', 'reais sem número', 'terreais 5', 'Compre 3 reaiss', 'BRL 5'].map(t => [`não é preço: ${t}`, com({ resumo: t })] as [string, object]),
    ['meta_title 60', com({ meta_title: 'á'.repeat(60) })], ['meta_title 61', com({ meta_title: 'á'.repeat(61) })],
    ['meta_title 60 pontos de código (emoji)', com({ meta_title: '😀'.repeat(60) })], ['meta_title 61 emojis', com({ meta_title: '😀'.repeat(61) })],
    ['meta_description 155', com({ meta_description: 'ã'.repeat(155) })], ['meta_description 156', com({ meta_description: 'ã'.repeat(156) })],
    ['resumo 1000', com({ resumo: 'x'.repeat(1000) })], ['resumo 1001', com({ resumo: 'x'.repeat(1001) })],
    ['descricao 20000', com({ descricao_markdown: 'x'.repeat(20000) })], ['descricao 20001', com({ descricao_markdown: 'x'.repeat(20001) })],
    ['generator 100', com({ content_generator: 'g'.repeat(100) })], ['generator 101', com({ content_generator: 'g'.repeat(101) })],
    ['prompt_version 60', com({ prompt_version: 'v'.repeat(60) })], ['prompt_version 61', com({ prompt_version: 'v'.repeat(61) })],
    ['destaques 12', com({ destaques: Array(12).fill('x') })], ['destaques 13', com({ destaques: Array(13).fill('x') })], ['destaques vazio', com({ destaques: [] })],
    ['destaque 200', com({ destaques: ['x'.repeat(200)] })], ['destaque 201', com({ destaques: ['x'.repeat(201)] })],
    ['destaque não texto', com({ destaques: ['ok', 3] })], ['destaques não lista', com({ destaques: 'texto' })],
    ['faq 12', com({ faq: Array.from({ length: 12 }, (_, i) => ({ pergunta: `p${i}`, resposta: 'r' })) })],
    ['faq 13', com({ faq: Array.from({ length: 13 }, (_, i) => ({ pergunta: `p${i}`, resposta: 'r' })) })], ['faq vazio', com({ faq: [] })],
    ['faq pergunta 200', com({ faq: faq(['p'.repeat(200), 'r']) })], ['faq pergunta 201', com({ faq: faq(['p'.repeat(201), 'r']) })],
    ['faq resposta 1000', com({ faq: faq(['p', 'r'.repeat(1000)]) })], ['faq resposta 1001', com({ faq: faq(['p', 'r'.repeat(1001)]) })],
    ['faq campo extra', com({ faq: [{ pergunta: 'A?', resposta: 'B', extra: 1 }] })], ['faq sem resposta', com({ faq: [{ pergunta: 'A?' }] })],
    ['faq item não objeto', com({ faq: ['texto'] })], ['faq não lista', com({ faq: {} })],
    ['faq itens idênticos', com({ faq: faq(['Igual?', 'a'], ['Igual?', 'a']) })],
    ['facts_hash maiúsculo', com({ facts_hash: 'A'.repeat(64) })], ['facts_hash curto', com({ facts_hash: 'a'.repeat(63) })],
    ['facts_hash longo', com({ facts_hash: 'a'.repeat(65) })], ['facts_hash com quebra final', com({ facts_hash: `${'a'.repeat(64)}\n` })],
    ['facts_hash não texto', com({ facts_hash: 5 })],
  ]
  it.each(casos)('paridade schema × validador: %s', (_nome, c) => {
    expect(validaSchema(c), JSON.stringify(validaSchema.errors)).toBe(pelaValidacao(c))
  })
  it('a lista de casos exercita aceitação e recusa (a paridade não é vacuosa)', () => {
    const aceitos = casos.filter(([, c]) => pelaValidacao(c)).length
    expect(aceitos).toBeGreaterThan(10)
    expect(casos.length - aceitos).toBeGreaterThan(100)
  })

  it('texto em branco: `\\S` coincide com `trim()` em todo o plano básico', () => {
    const re = new RegExp(PADRAO_TEXTO_NAO_EM_BRANCO, 'u')
    const reSemFlag = new RegExp(PADRAO_TEXTO_NAO_EM_BRANCO)
    const divergentes: number[] = []
    for (let cp = 0; cp <= 0xffff; cp++) {
      const ch = String.fromCharCode(cp)
      const enviado = ch.trim().length > 0
      if (re.test(ch) !== enviado || reSemFlag.test(ch) !== enviado) divergentes.push(cp)
    }
    expect(divergentes).toEqual([])
  })
  it('preço: o padrão publicado é o do validador, sem depender de flags', () => {
    const s = JSON_SCHEMA_CONTEUDO_V1 as any
    for (const campo of ['meta_title', 'meta_description', 'resumo', 'descricao_markdown']) expect(s.properties[campo].not.pattern).toBe(PADRAO_PRECO)
    expect(s.properties.destaques.items.not.pattern).toBe(PADRAO_PRECO)
    expect(s.properties.faq.items.properties.resposta.not.pattern).toBe(PADRAO_PRECO)
    expect(s.properties.faq.items.properties.pergunta.not).toBeUndefined()
    expect(PADRAO_PRECO).not.toMatch(/\\d|\(\?i/)
  })

  it('o que o JSON Schema não expressa fica documentado — FAQ duplicada após normalização passa no schema e é recusada pelo validador', () => {
    const duplicada = com({ faq: faq(['Quanto pesa?', '1 kg'], [' quanto  PESA? ', '2 kg']) })
    expect(validaSchema(duplicada)).toBe(true)
    // mesma pergunta com respostas diferentes: itens distintos para `uniqueItems`, repetida para o validador
    expect(validaSchema(com({ faq: faq(['Igual?', 'a'], ['Igual?', 'b']) }))).toBe(true)
    expect(paths(com({ faq: faq(['Igual?', 'a'], ['Igual?', 'b']) }))).toEqual(['faq.1.pergunta'])
    expect(paths(duplicada)).toEqual(['faq.1.pergunta'])
    expect(pelaValidacao(duplicada)).toBe(false)
    // NFKC: "ＰＥＳＡ" (largura total) == "pesa"
    expect(validaSchema(com({ faq: faq(['pesa?', 'a'], ['ＰＥＳＡ?', 'b']) }))).toBe(true)
    expect(paths(com({ faq: faq(['pesa?', 'a'], ['ＰＥＳＡ?', 'b']) }))).toEqual(['faq.1.pergunta'])
    expect(REGRAS_FORA_DO_JSON_SCHEMA.map(r => r.id)).toContain('faq_question_unique_after_normalization')
    expect((JSON_SCHEMA_CONTEUDO_V1 as any).properties.faq.$comment).toMatch(/normaliza/)
  })
  it('capabilities publica o schema junto com as regras que ele não cobre', () => {
    const d = descritorCapacidades([])
    expect(d.content.jsonSchema).toBe(JSON_SCHEMA_CONTEUDO_V1)
    expect(d.content.rulesOutsideJsonSchema.map(r => r.id)).toEqual(expect.arrayContaining(['faq_question_unique_after_normalization', 'price_heuristic_is_approximate', 'editorial_workflow']))
    expect(JSON.parse(JSON.stringify(d)).content.rulesOutsideJsonSchema.every((r: any) => r.id && r.path && r.description)).toBe(true)
  })
})

describe('facts_hash: idempotência da geração', () => {
  it('é estável para a mesma informação, mesmo com outra ordem de chaves', () => {
    const a = hashDeFatos({ marca: 'M', specs: { b: 2, a: [1, { y: 1, x: 2 }] } })
    const b = hashDeFatos({ specs: { a: [1, { x: 2, y: 1 }], b: 2 }, marca: 'M' })
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{64}$/)
    expect(hashDeFatos({ marca: 'M', specs: { a: [1, { x: 2, y: 2 }], b: 2 } })).not.toBe(a)
    expect(hashDeFatos({ n: 1 })).not.toBe(hashDeFatos({ n: '1' }))
  })
  it('valores JSON de verdade: null, boolean, número finito, string, arrays e objetos planos', () => {
    expect(() => hashDeFatos({ a: null, b: true, c: false, d: 0, e: -1.5, f: 'x', g: [], h: {}, i: [null, [1]], j: { k: {} } })).not.toThrow()
    for (const v of [null, true, 1, 'texto', [], {}]) expect(hashDeFatos(v)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashDeFatos(Object.assign(Object.create(null), { b: 1, a: 2 }))).toBe(hashDeFatos({ a: 2, b: 1 }))
    const parseado = JSON.parse('{"__proto__":{"x":1},"y":2}')
    expect(hashDeFatos(parseado)).toMatch(/^[a-f0-9]{64}$/)
    const compartilhado = { x: 1 }
    expect(hashDeFatos({ a: compartilhado, b: compartilhado })).toBe(hashDeFatos({ a: { x: 1 }, b: { x: 1 } }))
  })
  it('ordem de array e tipo importam: sem colisão entre fatos diferentes', () => {
    const hashes = [[1, 2], [2, 1], [1, '2'], ['1', '2'], [[1], 2], [null], [], [0], [false], [''], { a: null }, { a: 0 }, {}, { a: {} }, { a: [] }, { 'a,b': 1 }, { a: { b: 1 } }, { a: 1, b: 1 }]
      .map(v => hashDeFatos(v))
    expect(new Set(hashes).size).toBe(hashes.length)
  })
  it('recusa o que não é JSON, em vez de descartar ou converter em silêncio', () => {
    class Fato { x = 1 }
    const ciclo: any = { a: 1 }; ciclo.self = ciclo
    const cicloIndireto: any = { a: { b: [] } }; cicloIndireto.a.b.push(cicloIndireto.a)
    const arrayCiclico: any[] = []; arrayCiclico.push(arrayCiclico)
    const comGetter = Object.defineProperty({}, 'g', { enumerable: true, get: () => 1 })
    const oculto = Object.defineProperty({}, 'h', { enumerable: false, value: 1 })
    const buraco = [1, , 3] // eslint-disable-line no-sparse-arrays
    const arrayExtra = Object.assign([1], { extra: true })
    class Lista extends Array {}
    let fundo: any = {}; const raiz = fundo
    for (let i = 0; i < 150; i++) fundo = fundo.n = {}
    const ruins: Array<[string, unknown]> = [
      ['undefined na raiz', undefined], ['undefined em objeto', { a: undefined }], ['undefined em array', [1, undefined]],
      ['NaN', { n: Number.NaN }], ['Infinity', { n: Infinity }], ['-Infinity', [-Infinity]],
      ['função', { f: () => 1 }], ['símbolo', { s: Symbol('x') }], ['bigint', { b: 10n }],
      ['Date', { d: new Date(0) }], ['Map', { m: new Map([['a', 1]]) }], ['Set', { s: new Set([1]) }],
      ['instância de classe', { c: new Fato() }], ['RegExp', { r: /x/ }], ['Uint8Array', { u: new Uint8Array(2) }],
      ['Number objeto', { n: new Number(1) }], ['String objeto', { s: new String('x') }], ['Error', { e: new Error('x') }],
      ['Object.create(proto próprio)', Object.create({ herdado: 1 })], ['subclasse de Array', Lista.from([1])],
      ['Date na raiz', new Date(0)], ['função na raiz', () => 1],
      ['ciclo em objeto', ciclo], ['ciclo indireto', cicloIndireto], ['ciclo em array', arrayCiclico],
      ['chave símbolo', { [Symbol('k')]: 1 }], ['getter', comGetter], ['propriedade não enumerável', oculto],
      ['array com buraco', buraco], ['array com propriedade extra', arrayExtra], ['aninhamento profundo demais', raiz],
    ]
    for (const [nome, valor] of ruins) {
      expect(() => hashDeFatos(valor), nome).toThrow(PacoteFactualInvalidoError)
    }
  })
  it('sem colisão por descarte: undefined/Date/Map/Set não viram {} ou null', () => {
    expect(() => hashDeFatos({ a: undefined })).toThrow(PacoteFactualInvalidoError) // antes colidia com {}
    expect(() => hashDeFatos({ d: new Date(0) })).toThrow(PacoteFactualInvalidoError) // antes colidia com {d:{}}
    expect(() => hashDeFatos({ m: new Map([['a', 1]]) })).toThrow(PacoteFactualInvalidoError)
    expect(() => hashDeFatos([undefined])).toThrow(PacoteFactualInvalidoError) // antes colidia com [null]
    expect(hashDeFatos({})).not.toBe(hashDeFatos({ a: null }))
  })
  it('erro sanitizado: mensagem com caminho e motivo, nunca com o valor nem chave arbitrária', () => {
    const segredo = 'segredo com espaço/123'
    const captura = (v: unknown) => { try { hashDeFatos(v) } catch (e) { return e as PacoteFactualInvalidoError } throw new Error('não lançou') }
    const e1 = captura({ specs: { [segredo]: { d: new Date(0) } }, nota: segredo })
    expect(e1.message).not.toContain(segredo)
    expect(e1.message).toBe('Pacote factual inválido em $.specs.[chave].d: objeto não plano (Date, Map, Set ou instância de classe).')
    expect(e1.caminho).toBe('$.specs.[chave].d')
    const e2 = captura({ lista: [1, Number.NaN] })
    expect(e2.message).toBe('Pacote factual inválido em $.lista[1]: número não finito.')
    const e3 = captura({ a: { [Symbol(segredo)]: 1 } })
    expect(e3.message).not.toContain(segredo)
    const e4 = captura({ fn: function segredoNoNome() { return segredo } })
    expect(e4.message).toBe('Pacote factual inválido em $.fn: tipo function não é JSON.')
    expect(e4).toBeInstanceOf(Error)
    expect(e4.name).toBe('PacoteFactualInvalidoError')
  })
  it('estrutura hostil vira o mesmo erro sanitizado (Proxy que lança)', () => {
    const hostil = new Proxy({}, { ownKeys() { throw new Error('token-super-secreto-123') } })
    let erro: unknown
    try { hashDeFatos({ p: hostil }) } catch (e) { erro = e }
    expect(erro).toBeInstanceOf(PacoteFactualInvalidoError)
    expect((erro as Error).message).not.toContain('secreto')
  })
})

describe('preflight editorial (affiliate.preflight 1.0)', () => {
  it('gera só para produto novo ou sem nenhum conteúdo', () => {
    expect(planoDeConteudo(null)).toEqual({ acao: 'gerar', motivo: 'produto_novo' })
    expect(planoDeConteudo({})).toEqual({ acao: 'gerar', motivo: 'sem_conteudo' })
    expect(planoDeConteudo({ descricao: '   ' })).toEqual({ acao: 'gerar', motivo: 'sem_conteudo' })
  })
  it('conteúdo existente nunca é regenerado — nem o legado, nem "fraco"', () => {
    expect(planoDeConteudo({ descricao: 'texto antigo' }, { facts_hash: hash })).toEqual({ acao: 'nao_gerar', motivo: 'conteudo_existente' })
    expect(planoDeConteudo(completo, { facts_hash: 'b'.repeat(64) })).toEqual({ acao: 'nao_gerar', motivo: 'conteudo_existente' })
  })
  it('mesmos fatos reutilizam a saída', () => {
    expect(planoDeConteudo(completo, { facts_hash: hash })).toEqual({ acao: 'reutilizar', motivo: 'mesmos_fatos' })
  })
  it('refresh só com marcador do editor; mesmos fatos continuam idempotentes', () => {
    const marcado = { ...completo, editorial_refresh_em: '2026-09-29T12:00:00.000Z' }
    expect(planoDeConteudo(marcado, { facts_hash: 'b'.repeat(64) })).toEqual({ acao: 'refresh', motivo: 'refresh_solicitado' })
    expect(planoDeConteudo(marcado, { facts_hash: hash })).toEqual({ acao: 'reutilizar', motivo: 'mesmos_fatos' })
    expect(planoDeConteudo(marcado)).toEqual({ acao: 'nao_gerar', motivo: 'refresh_pendente_sem_hash' })
  })
})
