/**
 * Nome de arquivo da mídia sem colisão de derivados (PRD 18 RF5).
 *
 * O Payload nomeia cada derivado pelo nome da original SEM a extensão: `x.png` e `x.webp`
 * geram o mesmo `x-640x336.avif`, e o segundo sobrescreve o primeiro no bucket. Foi o que
 * pôs a imagem do Evolution CRM no cartão da oferta de cupom da HostGator. Estas funções
 * são a regra; o hook da coleção e o `regenera:tamanhos` só a aplicam.
 */
import { describe, expect, it } from 'vitest'

import { nomeBase, nomeLivre, planoDeRenomeacao } from '../src/lib/nome-midia'

describe('nomeBase', () => {
  it('tira só a última extensão — é daí que o Payload tira o nome do derivado', () => {
    expect(nomeBase('hostgator-cover.png')).toBe('hostgator-cover')
    expect(nomeBase('foto.2026.final.webp')).toBe('foto.2026.final')
    expect(nomeBase('sem-extensao')).toBe('sem-extensao')
  })
})

describe('nomeLivre', () => {
  it('mantém o nome quando nenhum OUTRO registro usa o mesmo nome-base', () => {
    expect(nomeLivre('x.webp', new Set(['y', 'x-1']))).toBe('x.webp')
  })

  it('muda de nome quando outro registro tem o mesmo nome-base em OUTRO formato', () => {
    expect(nomeLivre('hostgator-cover.webp', new Set(['hostgator-cover']))).toBe('hostgator-cover-1.webp')
  })

  it('pula os nomes que também estão ocupados', () => {
    expect(nomeLivre('x.webp', new Set(['x', 'x-1', 'x-2']))).toBe('x-3.webp')
  })

  it('acrescenta o número ao nome inteiro — `relatorio-2026` não vira `relatorio-2027`', () => {
    // o Payload soma 1 ao número do fim do nome; aqui isso inventaria um ano
    expect(nomeLivre('relatorio-2026.png', new Set(['relatorio-2026']))).toBe('relatorio-2026-1.png')
    expect(nomeLivre('sem-extensao', new Set(['sem-extensao']))).toBe('sem-extensao-1')
  })

  it('diferença de maiúscula NÃO é colisão: a chave no bucket distingue', () => {
    expect(nomeLivre('X.webp', new Set(['x']))).toBe('X.webp')
  })
})

describe('planoDeRenomeacao', () => {
  const m = (id: number, filename: string, sizes: Record<string, string | null> = {}) => ({
    id,
    filename,
    sizes: Object.fromEntries(Object.entries(sizes).map(([k, f]) => [k, { filename: f }])),
  })

  it('o caso da HostGator: dois registros em uso com o mesmo nome-base — o de menor id fica, o outro muda', () => {
    const acervo = [m(958, 'hostgator-cover.png', { cartao: 'hostgator-cover-640x336.avif' }), m(1453, 'hostgator-cover.webp', { cartao: 'hostgator-cover-640x336.avif' })]
    expect(planoDeRenomeacao({ acervo, rodada: [1453, 958] })).toEqual(new Map([[1453, 'hostgator-cover-1.webp']]))
  })

  it('só um do par é regenerado e o outro não tem capa nem og: ninguém muda de nome', () => {
    // o caso de 64 dos 157 pares do acervo: o de fora da rodada só tem `cartao`, que o da
    // rodada reescreve com a imagem dele — a que aparece no site
    const acervo = [m(55, 'a.jpg', { cartao: 'a-640x336.avif' }), m(62, 'a.avif', { cartao: 'a-640x336.avif' })]
    expect(planoDeRenomeacao({ acervo, rodada: [62] })).toEqual(new Map())
  })

  it('o de fora da rodada JÁ tem capa ou og com o nome-base: quem está na rodada muda, mesmo com id menor', () => {
    const acervo = [m(10, 'b.png'), m(20, 'b.webp', { cartao: 'b-640x360.avif', capa: 'b-1600x900.avif', og: 'b-1200x630.jpg' })]
    expect(planoDeRenomeacao({ acervo, rodada: [10] })).toEqual(new Map([[10, 'b-1.png']]))
  })

  it('o nome novo não colide com nenhum nome-base do acervo', () => {
    const acervo = [m(1, 'c.png'), m(2, 'c.webp'), m(3, 'c-1.jpg')]
    expect(planoDeRenomeacao({ acervo, rodada: [1, 2] })).toEqual(new Map([[2, 'c-2.webp']]))
  })

  it('três registros com o mesmo nome-base na rodada: cada um que não é o menor ganha um nome próprio', () => {
    const acervo = [m(1, 'd.png'), m(2, 'd.webp'), m(3, 'd.avif')]
    expect(planoDeRenomeacao({ acervo, rodada: [3, 2, 1] })).toEqual(
      new Map([
        [2, 'd-1.webp'],
        [3, 'd-2.avif'],
      ]),
    )
  })

  it('registro sem arquivo não participa', () => {
    const acervo = [m(1, 'e.png'), { id: 2, filename: null, sizes: {} }]
    expect(planoDeRenomeacao({ acervo, rodada: [1, 2] })).toEqual(new Map())
  })
})
