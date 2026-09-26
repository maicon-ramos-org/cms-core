import { describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'
import { pesquisaMaisRecente } from '../src/grafo/pesquisas'

const monta = (editorial?: Record<string, unknown>, legado?: Record<string, unknown>) => {
  const find = vi.fn().mockResolvedValueOnce({ docs: editorial ? [editorial] : [] }).mockResolvedValueOnce({ docs: legado ? [legado] : [] })
  const req = { payload: { find } } as unknown as PayloadRequest
  return { find, req }
}
describe('seleção limitada por data editorial efetiva', () => {
  it('duas consultas têm tenant+entidade, limite um e acesso explícito', async () => {
    const f = monta()
    expect(await pesquisaMaisRecente(f.req, 10, 20)).toBeUndefined()
    expect(f.find).toHaveBeenCalledTimes(2)
    for (const [opcoes] of f.find.mock.calls) {
      expect(opcoes).toMatchObject({ req: f.req, overrideAccess: false, collection: 'pesquisas', limit: 1, depth: 0 })
      expect(opcoes.where.and).toEqual(expect.arrayContaining([{ tenant: { equals: 10 } }, { entidade: { equals: 20 } }]))
    }
    expect(f.find.mock.calls[0]![0]).toMatchObject({ sort: ['-revisado_em', '-id'], where: { and: expect.arrayContaining([{ revisado_em: { exists: true } }]) } })
    expect(f.find.mock.calls[1]![0]).toMatchObject({ sort: ['-updatedAt', '-id'], where: { and: expect.arrayContaining([{ revisado_em: { exists: false } }]) } })
  })
  it.each([
    ['2026-01-01', '2025-01-01', 1],
    ['2025-01-01', '2026-01-01', 2],
    ['2026-01-01', '2026-01-01', 2],
    ['inválida', '2026-01-01', 1],
    ['2026-01-01', 'inválida', 2],
  ])('compara editorial %s versus fallback %s de modo determinístico', async (editorial, tecnico, esperado) => {
    const f = monta({ id: 1, revisado_em: editorial, updatedAt: '2099-01-01' }, { id: 2, revisado_em: null, updatedAt: tecnico })
    expect((await pesquisaMaisRecente(f.req, 10, 20, true))!.id).toBe(esperado)
    for (const [opcoes] of f.find.mock.calls) expect(opcoes.overrideAccess).toBe(true)
  })
})
