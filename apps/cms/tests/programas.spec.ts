import { describe, expect, it } from 'vitest'
import type { Field } from 'payload'
import type { Programa } from '@runzos/afflinks'

import { Lojas } from '../src/collections/Lojas'
import { Tenants } from '../src/collections/Tenants'

/**
 * `programa` existe em DOIS selects: `lojas.programa` (quem paga esta loja) e
 * `tenants.programas_ativos.programa` (a env que guarda o ID de afiliado). O /r/ cruza os
 * dois — acha a loja pelo primeiro e a env pelo segundo.
 *
 * Adicionar o valor só em `lojas` não quebra nada visível: o redirect continua 302, o
 * usuário chega na loja, e o builder cai no fallback SEM parâmetro de comissão com um
 * warn no log. Foi exatamente o que aconteceu com a Cloudways. Esta trava transforma esse
 * silêncio em CI vermelho.
 */
const opcoesDe = (campos: Field[], caminho: string[]): string[] => {
  const [nome, ...resto] = caminho
  const campo = campos.find((f): f is Extract<Field, { name: string }> => 'name' in f && f.name === nome)
  if (!campo) throw new Error(`campo não encontrado: ${caminho.join('.')}`)
  if (resto.length) return opcoesDe((campo as { fields: Field[] }).fields, resto)
  const { options } = campo as { options: string[] }
  return options
}

describe('enum `programa` — lojas e tenants não podem divergir', () => {
  const daLoja = opcoesDe(Lojas.fields, ['programa'])
  const doTenant = opcoesDe(Tenants.fields, ['programas_ativos', 'programa'])

  it('as duas listas são idênticas, na mesma ordem', () => {
    // mesma ordem de propósito: é a ordem do enum do Postgres, e os dois `ALTER TYPE`
    // usam `BEFORE 'amazon'` — listas fora de ordem escondem migração faltando
    expect(doTenant).toEqual(daLoja)
  })

  it('cloudways está nas duas — o programa que expôs a falha', () => {
    expect(daLoja).toContain('cloudways')
    expect(doTenant).toContain('cloudways')
  })

  it('todo valor é um `Programa` com builder no @runzos/afflinks', () => {
    // trava de TIPO: valor novo no select sem entrada no union do pacote não compila
    const programas = daLoja as Programa[]
    expect(programas.length).toBe(daLoja.length)
  })
})
