import type { PayloadRequest, Where } from 'payload'
import { dataFrescorPesquisa, type PesquisaGate } from './gates'

type Pesquisa = PesquisaGate & Record<string, any>

/** Dois candidatos limitados: editorial explícito e compatibilidade legada, sempre no tenant. */
export async function pesquisaMaisRecente(req: PayloadRequest, tenant: string | number, entidade: string | number, overrideAccess = false): Promise<Pesquisa | undefined> {
  const escopo: Where[] = [{ tenant: { equals: tenant } }, { entidade: { equals: entidade } }]
  const base = { collection: 'pesquisas' as never, req, overrideAccess, depth: 0, limit: 1 }
  const [editorial, legado] = await Promise.all([
    req.payload.find({ ...base, sort: ['-revisado_em', '-id'], where: { and: [...escopo, { revisado_em: { exists: true } }] } }),
    req.payload.find({ ...base, sort: ['-updatedAt', '-id'], where: { and: [...escopo, { revisado_em: { exists: false } }] } }),
  ])
  const a = editorial.docs[0] as Pesquisa | undefined
  const b = legado.docs[0] as Pesquisa | undefined
  if (!a || !b) return a ?? b
  // Se um adapter devolver data inválida, selecioná-la faz G1 falhar fechado.
  const dataA = Date.parse(dataFrescorPesquisa(a) ?? ''), dataB = Date.parse(dataFrescorPesquisa(b) ?? '')
  if (!Number.isFinite(dataA)) return a
  if (!Number.isFinite(dataB)) return b
  if (dataA !== dataB) return dataA > dataB ? a : b
  return typeof a.id === 'number' && typeof b.id === 'number' ? (a.id > b.id ? a : b)
    : (String(a.id) > String(b.id) ? a : b)
}
