/**
 * TDD (regra do repo pros packages): o teste vem antes da implementação.
 *
 * O caso que dá nome a este arquivo: o mockup dizia "até 77%" para 70% + 10%, e 77% é
 * matematicamente impossível. Os dois resultados válidos são 73% (cupom sobre o preço
 * já descontado) e 80% (sobre o preço cheio) — por isso o modo é DADO, não suposição.
 */
import { describe, expect, it } from 'vitest'

import { compor } from '../src/index'

const loja = (valor: number, tipo: 'percentual' | 'valor' = 'percentual') => ({
  valor,
  tipo,
  verificado_em: '2026-08-28T10:00:00.000Z',
})

describe('compor(descontoLoja, cupom)', () => {
  it('cupom sobre o preço JÁ DESCONTADO: 70% + 10% = 73%, nunca 77%', () => {
    expect(compor(loja(70), { desconto_valor: 10, desconto_tipo: 'percentual', aplica_sobre: 'preco_ja_descontado' })).toEqual({
      total_pct: 73,
      parcelas: [
        { rotulo: 'da loja', valor_pct: 70 },
        { rotulo: 'nosso cupom', valor_pct: 10 },
      ],
    })
  })

  it('cupom sobre o preço CHEIO: 70% + 10% = 80%', () => {
    expect(compor(loja(70), { desconto_valor: 10, desconto_tipo: 'percentual', aplica_sobre: 'preco_cheio' })?.total_pct).toBe(80)
  })

  it('nunca devolve 77% pra 70+10 — o número do mockup era inventado', () => {
    for (const modo of ['preco_cheio', 'preco_ja_descontado'] as const) {
      expect(compor(loja(70), { desconto_valor: 10, desconto_tipo: 'percentual', aplica_sobre: modo })?.total_pct).not.toBe(77)
    }
  })

  it('arredonda SEMPRE pra baixo: 33% + 33% sobre já descontado dá 55%, não 56%', () => {
    // 1 - 0,67*0,67 = 0,5511 → 55
    expect(compor(loja(33), { desconto_valor: 33, desconto_tipo: 'percentual', aplica_sobre: 'preco_ja_descontado' })?.total_pct).toBe(55)
  })

  it('respeita o cap de 95% na soma direta', () => {
    expect(compor(loja(90), { desconto_valor: 30, desconto_tipo: 'percentual', aplica_sobre: 'preco_cheio' })?.total_pct).toBe(95)
  })

  it('modo desconhecido → null (mostra os dois separados, nunca um total inventado)', () => {
    expect(compor(loja(70), { desconto_valor: 10, desconto_tipo: 'percentual', aplica_sobre: 'desconhecido' })).toBeNull()
  })

  it('sem desconto da loja → null', () => {
    expect(compor(null, { desconto_valor: 10, desconto_tipo: 'percentual', aplica_sobre: 'preco_cheio' })).toBeNull()
  })

  it('sem cupom → null', () => {
    expect(compor(loja(70), null)).toBeNull()
  })

  it('desconto em VALOR não compõe sem preço base → null', () => {
    expect(compor(loja(50, 'valor'), { desconto_valor: 10, desconto_tipo: 'percentual', aplica_sobre: 'preco_cheio' })).toBeNull()
    expect(compor(loja(70), { desconto_valor: 10, desconto_tipo: 'valor', aplica_sobre: 'preco_cheio' })).toBeNull()
  })

  it('desconto da loja SEM verificado_em → null (desconto sem timestamp não existe)', () => {
    expect(
      compor({ valor: 70, tipo: 'percentual', verificado_em: null }, { desconto_valor: 10, desconto_tipo: 'percentual', aplica_sobre: 'preco_cheio' }),
    ).toBeNull()
  })

  it('valores fora da faixa não geram total', () => {
    expect(compor(loja(0), { desconto_valor: 10, desconto_tipo: 'percentual', aplica_sobre: 'preco_cheio' })).toBeNull()
    expect(compor(loja(99), { desconto_valor: 10, desconto_tipo: 'percentual', aplica_sobre: 'preco_cheio' })).toBeNull()
  })
})
