import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { CollectionBeforeOperationHook, Config, FieldHook } from 'payload'

/** Payload deixa esta flag no req após restore; uma nova escrita não é restore. */
export const preparaOperacaoValorClaim: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if (operation === 'create' || operation === 'update') delete req.context.isRestoringVersion
  return args
}

/** Payload espera texto JSON na entrada, mas fallback/restore já são valores nativos. */
export const preservaValorClaim: FieldHook = ({ operation, req, siblingData, value }) => {
  if (operation === 'update' && typeof value === 'string'
    && (req.context.isRestoringVersion === true || siblingData.valor === undefined)) return JSON.stringify(value)
  return value
}

/**
 * Payload 3.88 salva o resultado nativo em versões; pg 8 já decodifica JSONB.
 * PgJsonb do Drizzle 0.45.2 faria um segundo parse de strings como "12"/"null".
 * Só esta coluna recebe identidade: main guarda o texto de entrada e não muda.
 * Não modifica protótipo, parser pg, escrita, tipo SQL ou outro campo JSONB.
 */
export const preservaLeituraDoValorVersionado: PostgresAdapter['afterSchemaInit'][number] = ({ adapter, schema }) => {
  const nome = adapter.tableNameMap.get(`_claims${adapter.versionsSuffix}`)
  const tabela = nome ? schema.tables[nome] : undefined
  const coluna = tabela && Object.values(tabela).find(c => c && typeof c === 'object' && 'name' in c && c.name === 'version_valor')
  if (!coluna || coluna.columnType !== 'PgJsonb' || coluna.getSQLType?.() !== 'jsonb'
    || typeof coluna.mapFromDriverValue !== 'function') {
    throw new Error('Grafo exige coluna JSONB esperada para preservar claims.valor nas versões.')
  }
  coluna.mapFromDriverValue = (valor: unknown) => valor
  return schema
}

/** Apenas o grafo opt-in: adapter/schema padrão sem grafo permanecem intocados. */
export function bancoComValorClaimPreservado(banco: Config['db']): NonNullable<Config['db']> {
  if (!banco) throw new Error('Grafo exige adapter PostgreSQL para preservar claims.valor.')
  return { ...banco, init: args => {
    const adapter = banco.init(args) as PostgresAdapter
    if (adapter.name !== 'postgres' || !Array.isArray(adapter.afterSchemaInit)) {
      throw new Error('Grafo exige adapter PostgreSQL para preservar claims.valor.')
    }
    adapter.afterSchemaInit = [...adapter.afterSchemaInit, preservaLeituraDoValorVersionado]
    return adapter
  } }
}
