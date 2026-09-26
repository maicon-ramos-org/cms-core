import { jsonb, pgTable, text } from '@payloadcms/db-postgres/drizzle/pg-core'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Config } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { bancoComValorClaimPreservado, preparaOperacaoValorClaim, preservaLeituraDoValorVersionado, preservaValorClaim } from '../src/grafo/valor-claim'
import { VALORES_CLAIM, valorNoWire } from './fixtures/claims-valores'

describe('fronteira JSON de claims', () => {
  const roda = (value: unknown, siblingData: object, operation = 'update', context = {}) =>
    preservaValorClaim({ value, siblingData, operation, req: { context }, previousValue: 'NUNCA USAR ESTE VALOR' } as never)
  it.each(VALORES_CLAIM)('omissão e restore preservam valor nativo: %s', (_nome, valor) => {
    expect(roda(valor, {})).toEqual(valorNoWire(valor))
    expect(roda(valor, { valor }, 'update', { isRestoringVersion: true })).toEqual(valorNoWire(valor))
    expect(roda(valor, { valor })).toEqual(valor)
    expect(roda(valor, {}, 'create')).toEqual(valor)
    expect(roda(valor, { valor }, 'update', { isRestoringVersion: 'true' })).toEqual(valor)
  })
  it('restore sem valor não repõe o documento atual, nem serializa undefined', () => {
    expect(roda(undefined, {}, 'update', { isRestoringVersion: true })).toBeUndefined()
  })
  it.each(['create', 'update', 'restoreVersion', 'read'])('flag pertence à operação atual: %s', operation => {
    const req = { context: { isRestoringVersion: true } }, args = {}
    expect(preparaOperacaoValorClaim({ args, operation, req } as never)).toBe(args)
    expect(req.context.isRestoringVersion).toBe(['create', 'update'].includes(operation) ? undefined : true)
  })
})

describe('mapper somente da coluna versionada, sem parser/protótipo global', () => {
  const contexto = (tipo = 'jsonb', nome = 'version_valor') => {
    const tabela = pgTable('_claims_v', { version_valor: tipo === 'jsonb' ? jsonb(nome) : text(nome), outro: jsonb('outro') })
    const main = pgTable('claims', { valor: jsonb('valor') })
    const schema = { tables: { _claims_v: tabela, claims: main }, enums: {}, relations: {} }
    const adapter = { tableNameMap: new Map([['_claims_v', '_claims_v']]), versionsSuffix: '_v' }
    return { tabela, main, schema, adapter }
  }
  it('JSONB real: não altera escrita, main, outro campo ou outra instância', () => {
    const c = contexto(), outraInstancia = contexto()
    const original = c.tabela.version_valor.mapFromDriverValue
    const escrita = c.tabela.version_valor.mapToDriverValue
    expect(preservaLeituraDoValorVersionado(c as never)).toBe(c.schema)
    for (const [, valor] of VALORES_CLAIM) expect(c.tabela.version_valor.mapFromDriverValue(valor)).toEqual(valor)
    expect(c.main.valor.mapFromDriverValue).toBe(original)
    expect(c.tabela.outro.mapFromDriverValue).toBe(original)
    expect(outraInstancia.tabela.version_valor.mapFromDriverValue).toBe(original)
    expect(c.tabela.version_valor.mapToDriverValue).toBe(escrita)
    expect(c.tabela.version_valor.getSQLType()).toBe('jsonb')
  })
  it.each(['tipo', 'tabela', 'coluna'])('schema inesperado falha fechado: %s', caso => {
    const c = contexto(caso === 'tipo' ? 'text' : 'jsonb', caso === 'coluna' ? 'nome_inesperado' : 'version_valor')
    if (caso === 'tabela') c.adapter.tableNameMap.clear()
    expect(() => preservaLeituraDoValorVersionado(c as never)).toThrow(/coluna JSONB/)
  })
  it('plugin compõe hooks anteriores sem modificar a fábrica original', () => {
    const primeiro = vi.fn(), hooks = [primeiro]
    const init = vi.fn(() => ({ name: 'postgres', afterSchemaInit: hooks }))
    const original = { init } as unknown as Config['db']
    const nova = bancoComValorClaimPreservado(original)
    const adapter = nova.init({ payload: {} as never }) as PostgresAdapter
    expect(adapter.afterSchemaInit).toEqual([primeiro, preservaLeituraDoValorVersionado])
    expect(hooks).toEqual([primeiro])
    expect(original!.init).toBe(init)
  })
  it('adapter ausente/incompatível não segue sem proteção', () => {
    expect(() => bancoComValorClaimPreservado(undefined as never)).toThrow(/PostgreSQL/)
    const banco = { init: () => ({ name: 'sqlite' }) } as unknown as Config['db']
    expect(() => bancoComValorClaimPreservado(banco).init({ payload: {} as never })).toThrow(/PostgreSQL/)
  })
})
