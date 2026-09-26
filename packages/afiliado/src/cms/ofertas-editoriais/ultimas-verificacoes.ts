import { sql } from '@payloadcms/db-postgres'

/** Uma leitura interna para o futuro DTO de render, nunca um endpoint público. */
export interface UltimaVerificacaoOferta {
  id: number
  ofertaId: number
  verificadoEm: string
  linkAtivo: boolean | null
  disponivel: boolean | null
  precoVisto: string | null
}

type ResultadoSql = { rows: unknown[] }
export type ExecutorVerificacoes = (consulta: ReturnType<typeof sql>) => Promise<ResultadoSql>
const idPostgres = (id: number): boolean => Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647

/**
 * Busca o último check de cada oferta publicada, sem paginar o histórico inteiro.
 * O chamador deve autenticar o site-reader e passar somente o tenant da identidade.
 * IDs e tenant são vinculados como parâmetros SQL; nenhum filtro do request vira SQL.
 */
export async function ultimasVerificacoesOfertas(
  executar: ExecutorVerificacoes,
  tenantId: number,
  ofertaIds: readonly number[],
): Promise<UltimaVerificacaoOferta[]> {
  if (!idPostgres(tenantId)) throw new RangeError('Tenant inválido para leitura de verificações.')
  if (ofertaIds.length > 100 || ofertaIds.some(id => !idPostgres(id))) {
    throw new RangeError('Leitura de verificações exige até 100 IDs válidos.')
  }
  const ids = [...new Set(ofertaIds)]
  if (!ids.length) return []

  const lista = sql.join(ids.map(id => sql`${id}`), sql`, `)
  const resultado = await executar(sql`
    SELECT v.id, v.oferta_id, v.verificado_em, v.link_ativo, v.disponivel, v.preco_visto
    FROM unnest(ARRAY[${lista}]::integer[]) AS alvo(oferta_id)
    JOIN ofertas_editoriais AS o ON o.id = alvo.oferta_id
      AND o.tenant_id = ${tenantId} AND o._status = 'published'
    JOIN LATERAL (
      SELECT c.id, c.oferta_id, c.verificado_em, c.link_ativo, c.disponivel, c.preco_visto
      FROM verificacoes_ofertas_editoriais AS c
      WHERE c.tenant_id = ${tenantId} AND c.oferta_id = alvo.oferta_id
      ORDER BY c.verificado_em DESC, c.id DESC
      LIMIT 1
    ) AS v ON true
    ORDER BY array_position(ARRAY[${lista}]::integer[], v.oferta_id)
  `)
  return resultado.rows.map(raw => {
    const row = raw as Record<string, unknown>
    const data = row.verificado_em instanceof Date ? row.verificado_em : new Date(String(row.verificado_em))
    if (!Number.isSafeInteger(row.id) || !Number.isSafeInteger(row.oferta_id) || Number.isNaN(data.getTime()) ||
      ![null, true, false].includes(row.link_ativo as null | boolean) ||
      ![null, true, false].includes(row.disponivel as null | boolean) ||
      (row.preco_visto !== null && typeof row.preco_visto !== 'string')) {
      throw new Error('Resultado inválido na leitura de verificações.')
    }
    return { id: row.id as number, ofertaId: row.oferta_id as number, verificadoEm: data.toISOString(),
      linkAtivo: row.link_ativo as boolean | null, disponivel: row.disponivel as boolean | null,
      precoVisto: row.preco_visto as string | null }
  })
}
