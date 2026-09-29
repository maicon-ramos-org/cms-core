import { describe, expect, it } from 'vitest'
import { validaConteudoEditorial } from '../src/cms/catalogo/conteudo'

type Doc = Record<string, any>
const hash = 'a'.repeat(64), outraHash = 'b'.repeat(64)
const conteudo = (extra: Doc = {}): Doc => ({ meta_title: 'Título', meta_description: 'Descrição', resumo: 'Resumo', descricao_markdown: 'Corpo',
  destaques: ['Um'], faq: [{ pergunta: 'P?', resposta: 'R' }], facts_hash: hash, content_generator: 'gerador', prompt_version: 'v1', ...extra })
const usuarios = { editor: { roles: ['editor'] }, admin: { roles: ['super-admin'] }, ingestao: { roles: ['ingestao'] }, agente: { roles: ['agente'] }, script: undefined }
const roda = (quem: keyof typeof usuarios, data: Doc, original?: Doc) => {
  const copia = { ...data }
  const r = (validaConteudoEditorial as any)({ data: copia, originalDoc: original && { id: 1, tenant: 1, ...original }, req: { user: usuarios[quem] }, operation: original ? 'update' : 'create' })
  return r as Doc
}
const erros = (quem: keyof typeof usuarios, data: Doc, original?: Doc) => {
  try { roda(quem, data, original); return [] } catch (e: any) { return e.data.errors.map((x: any) => x.path) as string[] }
}
const aprovado = (extra: Doc = {}) => conteudo({ estado: 'published', editorial_status: 'aprovado', indexavel: true, content_version: 3, ...extra })

describe('draft-first na criação', () => {
  it('produto sem conteúdo continua criável e nasce sem conteúdo, sem versão', () => {
    expect(roda('ingestao', { nome: 'x' })).toEqual({ nome: 'x' })
  })
  it('ingestão cria conteúdo completo como rascunho v1 (nunca aprovado ou indexável)', () => {
    const r = roda('ingestao', conteudo())
    expect(r).toMatchObject({ editorial_status: 'rascunho', content_version: 1 })
    expect(r.indexavel).toBeUndefined()
    expect(erros('ingestao', conteudo({ editorial_status: 'aprovado' }))).toContain('editorial_status')
    expect(erros('ingestao', conteudo({ indexavel: true }))).toContain('indexavel')
    expect(erros('agente', conteudo({ editorial_status: 'aprovado' }))).toContain('editorial_status')
  })
  it('escrita automatizada exige o pacote completo, com hash e gerador', () => {
    expect(erros('ingestao', conteudo({ facts_hash: undefined, content_generator: undefined }))).toEqual(['facts_hash', 'content_generator'])
    expect(erros('ingestao', { resumo: 'só isto' })).toContain('meta_title')
    expect(erros('script', conteudo({ faq: [] }))).toContain('faq')
  })
  it('rejeita tipos inválidos com o path do campo', () => {
    expect(erros('ingestao', conteudo({ meta_title: 'x'.repeat(61) }))).toEqual(['meta_title'])
    expect(erros('ingestao', conteudo({ faq: [{ pergunta: 'P?', resposta: 'R', x: 1 }] }))).toEqual(['faq.0.x'])
    expect(erros('ingestao', conteudo({ destaques: [1] }))).toEqual(['destaques.0'])
  })
  it('editor pode salvar rascunho parcial (sem hash), mas não pode marcar em revisão incompleto', () => {
    expect(roda('editor', { resumo: 'Só o resumo' })).toMatchObject({ editorial_status: 'rascunho', content_version: 1 })
    expect(erros('editor', { resumo: 'Só o resumo', editorial_status: 'em_revisao' })).toEqual(['editorial_status'])
    // o default sem_conteudo que o Payload injeta no create nunca convive com conteúdo estruturado
    expect(roda('editor', { resumo: 'x', editorial_status: 'sem_conteudo' }).editorial_status).toBe('rascunho')
  })
})

describe('sem sobrescrita automática', () => {
  const existente = () => conteudo({ editorial_status: 'rascunho', content_version: 1 })
  it.each(['ingestao', 'agente', 'script'] as const)('%s não altera conteúdo existente sem refresh', quem => {
    expect(erros(quem, { resumo: 'Novo resumo' }, existente())).toEqual(['resumo'])
    expect(erros(quem, conteudo({ resumo: 'Novo', facts_hash: outraHash }), existente()).sort()).toEqual(['facts_hash', 'resumo'])
    expect(erros(quem, { faq: [] }, existente())).toEqual(['faq'])
  })
  it('reenvio idêntico é idempotente: aceita e não muda a versão', () => {
    const r = roda('ingestao', { ...conteudo(), destaques: ['Um'] }, existente())
    expect(r.content_version).toBeUndefined()
    expect(erros('ingestao', conteudo(), existente())).toEqual([])
  })
  it('preenche apenas o que está vazio: legado só com descricao pode receber o pacote, sem tocar a descricao', () => {
    expect(erros('ingestao', conteudo(), { descricao: 'texto antigo' })).toEqual([])
    expect(erros('ingestao', { descricao: 'reescrita' }, { descricao: 'texto antigo' })).toEqual(['descricao'])
  })
  it('editor edita livremente e a versão sobe', () => {
    expect(roda('editor', { resumo: 'Ajuste humano' }, existente())).toMatchObject({ resumo: 'Ajuste humano', content_version: 2 })
    expect(roda('admin', { descricao_markdown: 'Ajuste' }, existente()).content_version).toBe(2)
  })
  it('content_version é do CMS: valor do cliente é ignorado', () => {
    expect(roda('ingestao', conteudo({ content_version: 99 })).content_version).toBe(1)
    expect(roda('ingestao', { content_version: 99 }, existente()).content_version).toBe(1)
  })
})

describe('PATCH com o documento inteiro em data (é o que o Payload entrega no update)', () => {
  it('automação reenviando o doc aprovado/indexável sem mudança não é barrada nem altera nada', () => {
    const doc = aprovado()
    expect(erros('agente', { ...doc, id: 1, tenant: 1 }, doc)).toEqual([])
    expect(roda('agente', { ...doc, id: 1, tenant: 1 }, doc)).toMatchObject({ editorial_status: 'aprovado', indexavel: true })
    expect(erros('agente', { ...doc, id: 1, tenant: 1, resumo: 'Mudou' }, doc)).toEqual(['resumo'])
    expect(erros('agente', { ...doc, id: 1, tenant: 1, editorial_status: 'rascunho' }, doc)).toEqual([])
  })
})

describe('refresh explícito', () => {
  const marcado = () => conteudo({ editorial_status: 'aprovado', indexavel: true, estado: 'published', content_version: 4, editorial_refresh_em: '2026-09-29T10:00:00.000Z', editorial_refresh_motivo: 'fatos novos' })
  it('só editor/super-admin solicita ou limpa o marcador — automação não se autoriza', () => {
    const base = conteudo({ editorial_status: 'rascunho', content_version: 1 })
    expect(erros('ingestao', { editorial_refresh_em: '2026-09-29T10:00:00Z' }, base)).toEqual(['editorial_refresh_em'])
    expect(erros('agente', { editorial_refresh_motivo: 'quero' }, base)).toEqual(['editorial_refresh_motivo'])
    expect(erros('ingestao', { editorial_refresh_em: null }, marcado())).toEqual(['editorial_refresh_em'])
    expect(roda('editor', { editorial_refresh_em: '2026-09-29T10:00:00-03:00' }, base).editorial_refresh_em).toBe('2026-09-29T13:00:00.000Z')
  })
  it('automação não pode pedir o marcador e reescrever na mesma chamada', () => {
    const base = conteudo({ editorial_status: 'rascunho', content_version: 1 })
    expect(erros('ingestao', conteudo({ resumo: 'Novo', editorial_refresh_em: '2026-09-29T10:00:00Z' }), base).sort()).toEqual(['editorial_refresh_em', 'resumo'])
  })
  it('refresh sem conteúdo existente é recusado', () => {
    expect(erros('editor', { editorial_refresh_em: '2026-09-29T10:00:00Z' }, { editorial_status: 'sem_conteudo' })).toEqual(['editorial_refresh_em'])
  })
  it('com marcador, a reescrita automatizada passa uma vez e volta para rascunho, fora do índice, versão +1', () => {
    const r = roda('ingestao', conteudo({ resumo: 'Reescrito', facts_hash: outraHash }), marcado())
    expect(r).toMatchObject({ resumo: 'Reescrito', editorial_refresh_em: null, editorial_refresh_motivo: null,
      editorial_status: 'rascunho', indexavel: false, content_version: 5 })
  })
  it('refresh ainda exige pacote completo e não permite aprovar', () => {
    expect(erros('ingestao', conteudo({ facts_hash: undefined, resumo: 'Reescrito' }), { ...marcado(), facts_hash: null })).toContain('facts_hash')
    expect(erros('ingestao', conteudo({ resumo: 'Reescrito', editorial_status: 'aprovado' }), { ...marcado(), editorial_status: 'rascunho', indexavel: false })).toContain('editorial_status')
  })
})

describe('portão de indexação (default false)', () => {
  const revisado = () => conteudo({ estado: 'published', editorial_status: 'aprovado', content_version: 1 })
  it('só editor liga, com produto publicado, aprovado e completo', () => {
    expect(roda('editor', { indexavel: true }, revisado()).indexavel).toBe(true)
    expect(erros('ingestao', { indexavel: true }, revisado())).toEqual(['indexavel'])
    expect(erros('agente', { indexavel: true }, revisado())).toEqual(['indexavel'])
    expect(erros('editor', { indexavel: true }, { ...revisado(), estado: 'draft' })).toEqual(['indexavel'])
    expect(erros('editor', { indexavel: true }, { ...revisado(), editorial_status: 'rascunho' })).toEqual(['indexavel'])
    expect(erros('editor', { indexavel: true }, { ...revisado(), faq: [] })).toContain('indexavel')
  })
  it('perder aprovação ou completude desliga a indexação automaticamente', () => {
    expect(roda('editor', { editorial_status: 'rascunho' }, aprovado()).indexavel).toBe(false)
    expect(roda('editor', { faq: [], editorial_status: 'rascunho' }, aprovado()).indexavel).toBe(false)
    // aprovado + incompleto é recusado: o editor precisa rebaixar o status junto
    expect(erros('editor', { faq: [] }, aprovado())).toEqual(['editorial_status'])
    expect(roda('editor', { resumo: 'Ajuste que mantém tudo' }, aprovado()).indexavel).toBeUndefined()
  })
  it('automação pode desligar, não ligar', () => {
    expect(roda('ingestao', { indexavel: false }, aprovado()).indexavel).toBe(false)
  })
})
