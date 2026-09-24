/** Contrato do nicho por tenant (PRD 14 D4) — a frase do nicho vem do tenant, ou não sai. */
import { describe, expect, it } from 'vitest'

import { deNicho } from '../../src/lib/nicho'

describe('deNicho', () => {
  it('vem do tenant, com o espaço já embutido', () => {
    expect(deNicho({ nome: 'Exemplo', nicho: 'software e hospedagem' })).toBe(' de software e hospedagem')
    expect(deNicho({ nome: 'Exemplo 3D', nicho: 'impressão 3D' })).toBe(' de impressão 3D')
  })

  it('tenant sem nicho não herda o nicho de ninguém', () => {
    expect(deNicho({ nome: 'Sem nicho' })).toBe('')
    expect(deNicho({ nome: 'Nulo', nicho: null })).toBe('')
    expect(deNicho({ nome: 'Vazio', nicho: '' })).toBe('')
    expect(deNicho({ nome: 'Branco', nicho: '   ' })).toBe('')
  })
})
