import { describe, expect, it } from 'vitest'

import { TEXTOS_PADRAO, texto } from '../src/textos'

describe('texto', () => {
  it('sem frase do site, usa o padrão do tema com as marcas preenchidas', () => {
    expect(texto(undefined, 'tituloDoBlog', { total: 12, nome: 'Exemplo' })).toBe('Blog: 12 artigos')
    expect(texto({}, 'descricaoDoManifest', { nome: 'Exemplo', nicho: ' de impressão 3D' })).toBe('Exemplo de impressão 3D')
  })

  it('a frase do site ganha do padrão', () => {
    const textos = { descricaoDoFeed: 'Achados verificados — {nome}' }
    expect(texto(textos, 'descricaoDoFeed', { nome: 'Exemplo' })).toBe('Achados verificados — Exemplo')
    expect(texto(textos, 'descricaoDoBlog', { total: 3, nome: 'Exemplo' })).toBe('3 artigos de Exemplo.')
  })

  it('marca sem valor fica visível, para aparecer na revisão em vez de sumir', () => {
    expect(texto({ tituloDoBlog: 'Blog {nada}' }, 'tituloDoBlog', { total: 1 })).toBe('Blog {nada}')
  })

  it('nicho vazio não deixa espaço sobrando', () => {
    expect(texto(undefined, 'descricaoDoManifest', { nome: 'Exemplo', nicho: '' })).toBe('Exemplo')
    expect(Object.keys(TEXTOS_PADRAO)).toHaveLength(6)
  })
})
