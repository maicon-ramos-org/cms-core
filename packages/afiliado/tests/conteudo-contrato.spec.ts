import { describe, expect, it } from 'vitest'
import {
  camposFaltantes, conteudoCompleto, JSON_SCHEMA_CONTEUDO_V1, LIMITES_CONTEUDO, planoDeConteudo, validarConteudo,
} from '../src/conteudo'
import { hashDeFatos } from '../src/cms/catalogo/conteudo'

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
})

describe('facts_hash: idempotência da geração', () => {
  it('é estável para a mesma informação, mesmo com outra ordem de chaves', () => {
    const a = hashDeFatos({ marca: 'M', specs: { b: 2, a: [1, { y: 1, x: 2 }] }, ignorado: undefined })
    const b = hashDeFatos({ specs: { a: [1, { x: 2, y: 1 }], b: 2 }, marca: 'M' })
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{64}$/)
    expect(hashDeFatos({ marca: 'M', specs: { a: [1, { x: 2, y: 2 }], b: 2 } })).not.toBe(a)
    expect(hashDeFatos({ n: 1 })).not.toBe(hashDeFatos({ n: '1' }))
  })
  it('recusa o que não é JSON (evita hash ambíguo)', () => {
    expect(() => hashDeFatos({ n: Number.NaN })).toThrow()
    expect(() => hashDeFatos({ f: () => 1 })).toThrow()
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
