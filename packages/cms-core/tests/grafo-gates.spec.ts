import { describe, expect, it } from 'vitest'
import { avaliarGates, type EntradaGates } from '../src/grafo/gates'

const fonte = 'https://pesquisa.example/estudo'
const entrada = (): EntradaGates => ({
  agora: new Date('2026-09-25T12:00:00Z'),
  config: { ativo: true },
  post: {
    titulo: 'Uma análise cuidadosa da evidência atual',
    meta: { description: 'Uma explicação detalhada das fontes, dos limites e das conclusões sustentadas pela pesquisa publicada.' },
    corpo_md: `A prática foi estudada em 2026, com redução de 12% na amostra [descrita na pesquisa](${fonte}).\n\n${'O contexto exige atenção aos limites documentados. '.repeat(45)}`,
    capa: 1,
  },
  pesquisa: { qualidade: 80, validade_dias: 30, updatedAt: '2026-09-24T12:00:00Z' },
  claims: [{ id: 1, texto: 'redução de 12% na amostra', ano_ancora: 2026, status: 'vigente', fonte: { url: fonte } }],
})

describe('gates determinísticos do grafo', () => {
  it('aprova entrega com pesquisa e evidência ancorada no mesmo parágrafo', () => {
    expect(avaliarGates(entrada())).toEqual([])
  })
  it('desligado não bloqueia acervo anterior', () => {
    const e = entrada(); e.config.ativo = false; e.post = {}; e.claims = []
    expect(avaliarGates(e)).toEqual([])
  })
  it.each([undefined, 'inválida', '2026-09-26T12:00:00Z', '2026-07-24T12:00:00Z'])('pesquisa com data %s reprova', (data) => {
    const e = entrada(); e.pesquisa!.updatedAt = data
    expect(avaliarGates(e)).toContainEqual(expect.objectContaining({ gate: 'G1', path: 'entidades', severidade: 'P0' }))
  })
  it('qualidade abaixo do limiar reprova', () => {
    const e = entrada(); e.pesquisa!.qualidade = 69
    expect(avaliarGates(e)).toContainEqual(expect.objectContaining({ gate: 'G1' }))
  })
  it('pesquisa ainda sem avaliação de qualidade permanece bloqueada para publicação', () => {
    const e = entrada(); delete e.pesquisa!.qualidade
    expect(avaliarGates(e)).toContainEqual(expect.objectContaining({ gate: 'G1' }))
  })
  it.each([
    ['texto', 'conclusão não citada'], ['ano_ancora', 2025], ['status', 'refutada'],
  ])('claim sem %s correspondente reprova em claims', (campo, valor) => {
    const e = entrada(); Object.assign(e.claims[0]!, { [campo]: valor })
    expect(avaliarGates(e)).toContainEqual(expect.objectContaining({ gate: 'G2', path: 'claims' }))
  })
  it('ano e link em outro parágrafo não justificam a claim', () => {
    const e = entrada(); e.post.corpo_md = `redução de 12% na amostra.\n\n2026 [Fonte](${fonte})`
    expect(avaliarGates(e)).toContainEqual(expect.objectContaining({ gate: 'G2', path: 'claims' }))
  })
  it('percentual seguido por pontuação é estatística órfã', () => {
    const e = entrada(); e.post.corpo_md += '\n\nA melhora foi de 90%.'
    expect(avaliarGates(e)).toContainEqual(expect.objectContaining({ gate: 'G2', path: 'corpo' }))
  })
  it('G2 desligado por configuração não é executado', () => {
    const e = entrada(); e.config.g2 = false; e.claims = []
    expect(avaliarGates(e)).toEqual([])
  })
  it.each([
    [{ meta: { description: 'curta' } }, 'meta.description'],
    [{ titulo: 'curto' }, 'meta.title'],
    [{ capa: null }, 'capa'],
    [{ corpo_md: '# Corpo indevido' }, 'corpo'],
  ])('entrega inválida aponta path %s', (patch, path) => {
    const e = entrada(); Object.assign(e.post, patch)
    expect(avaliarGates(e)).toContainEqual(expect.objectContaining({ gate: 'G4', path }))
  })
  it('blocklist e H2 em pergunta reprovam', () => {
    const e = entrada(); e.post.corpo_md += '\n\nVamos explorar o tema.\n\n## Por quê?\n\n## Como?\n\n## Quando?'
    expect(avaliarGates(e).filter(p => p.gate === 'G3')).toHaveLength(2)
  })
})
