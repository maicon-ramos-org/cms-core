import { describe, expect, it } from 'vitest'
import { validaConteudoEditorial } from '../src/cms/catalogo/conteudo'
import { validaProduto } from '../src/cms/catalogo/hooks'

type Doc = Record<string, any>
const users = { editor: { roles: ['editor'] }, ingestao: { roles: ['ingestao'] }, agente: { roles: ['agente'] }, script: undefined }
const roda = (role: keyof typeof users, data: Doc, original?: Doc): Doc =>
  (validaConteudoEditorial as any)({ data: { ...data }, originalDoc: original && { id: 1, ...original }, req: { user: users[role] }, operation: original ? 'update' : 'create' })
const paths = (role: keyof typeof users, data: Doc, original?: Doc): string[] => {
  try { roda(role, data, original); return [] } catch (e: any) { return e.data.errors.map((x: any) => x.path) }
}

describe('CMS guarda estrutura sem revisar conteúdo do Hermes', () => {
  it('aceita conteúdo parcial, FAQ repetida e preço, com versão controlada pelo CMS', () => {
    expect(roda('agente', { resumo: 'R$ 99,90', faq: [{ pergunta: 'P?', resposta: 'R' }, { pergunta: 'P?', resposta: 'R' }], content_version: 100 }))
      .toMatchObject({ editorial_status: 'rascunho', content_version: 1 })
    expect(roda('ingestao', { resumo: 'Só resumo' })).toMatchObject({ editorial_status: 'rascunho', content_version: 1 })
    expect(roda('agente', { resumo: 'Texto', editorial_status: 'aprovado' }).editorial_status).toBe('aprovado')
  })
  it('recusa apenas formato inválido e preserva path do erro', () => {
    expect(paths('agente', { meta_title: 'x'.repeat(61) })).toEqual(['meta_title'])
    expect(paths('agente', { faq: [{ pergunta: 'P?', resposta: 'R', extra: 1 }] })).toEqual(['faq.0.extra'])
    expect(paths('agente', { destaques: [1] })).toEqual(['destaques.0'])
  })
  it('agente atualiza produto existente sem marcador e incrementa versão só quando muda', () => {
    const base = { resumo: 'Antigo', content_version: 2, editorial_status: 'aprovado' }
    expect(roda('agente', { resumo: 'Novo' }, base)).toMatchObject({ resumo: 'Novo', content_version: 3 })
    expect(roda('agente', { resumo: 'Antigo' }, base).content_version).toBeUndefined()
    expect(roda('agente', { descricao: 'Novo legado', resumo: 'Novo' }, { ...base, descricao: 'Legado' }).resumo).toBe('Novo')
  })
  it('marcador de refresh é opcional e não restringe atualizações', () => {
    const base = { resumo: 'Antigo', content_version: 2 }
    expect(roda('agente', { resumo: 'Novo' }, base).content_version).toBe(3)
    expect(roda('agente', { editorial_refresh_motivo: 'Fatos novos', resumo: 'Novo' }, base).content_version).toBe(3)
  })
})

describe('publicação e indexação explícitas', () => {
  it('publicador final cria produto aprovado já publicado; ingestão continua draft-only', () => {
    const base = { categoria: 'filamento', estado: 'published' }
    const run = (role: keyof typeof users) => (validaProduto as any)({ data: { ...base }, req: { user: users[role] } })
    expect(run('agente')).toMatchObject(base)
    expect(() => run('ingestao')).toThrow(expect.objectContaining({ data: {
      errors: [expect.objectContaining({ path: 'estado' })],
    } }))
    expect(roda('agente', { estado: 'published', indexavel: true, resumo: 'Aprovado antes do CMS' }))
      .toMatchObject({ indexavel: true, content_version: 1 })
  })
  it('ingestão não liga indexação, agente pode após publicação mesmo sem aprovação ou FAQ', () => {
    const base = { estado: 'published', editorial_status: 'rascunho', faq: [], indexavel: false }
    expect(paths('ingestao', { indexavel: true }, base)).toEqual(['indexavel'])
    expect(roda('agente', { indexavel: true }, base).indexavel).toBe(true)
    expect(roda('editor', { indexavel: true }, base).indexavel).toBe(true)
    expect(paths('agente', { indexavel: true }, { ...base, estado: 'draft' })).toEqual(['indexavel'])
  })
  it('ao retirar publicação, desliga indexação automaticamente', () => {
    expect(roda('agente', { estado: 'draft' }, { estado: 'published', indexavel: true }).indexavel).toBe(false)
    expect(roda('agente', { editorial_status: 'rascunho' }, { estado: 'published', indexavel: true }).indexavel).toBeUndefined()
  })
})
