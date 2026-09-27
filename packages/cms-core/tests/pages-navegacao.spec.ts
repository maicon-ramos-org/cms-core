import { describe, expect, it } from 'vitest'
import { paginas } from '../src/collections/Pages'

const collection = paginas()
const menu = collection.fields.find(field => 'name' in field && field.name === 'navegacao')
const field = (name: string) => menu && 'fields' in menu ? menu.fields.find(f => 'name' in f && f.name === name) : undefined
const validate = collection.hooks!.beforeValidate!.at(-1)!

describe('navegação opcional das páginas do núcleo', () => {
  it('não altera a navegação sem escolha explícita do publicador', () => {
    expect(menu?.type).toBe('group')
    expect(field('cabecalho')).toMatchObject({ type: 'checkbox', defaultValue: false })
    expect(field('rodape')).toMatchObject({ type: 'checkbox', defaultValue: false })
    expect(field('ordem')).toMatchObject({ type: 'number', defaultValue: 100 })
  })

  it('exige rótulo apenas quando há exposição no menu, inclusive em PATCH parcial', async () => {
    const run = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) =>
      validate({ data, originalDoc } as never)
    expect(() => run({ navegacao: { cabecalho: false, rodape: false } })).not.toThrow()
    expect(() => run({ navegacao: { cabecalho: true } })).toThrow('navegacao.rotulo')
    expect(() => run({ navegacao: { rotulo: 'Sobre', cabecalho: true } })).not.toThrow()
    expect(() => run({ navegacao: { rotulo: null } }, { navegacao: { cabecalho: true, rotulo: 'Sobre' } })).toThrow()
  })
})
