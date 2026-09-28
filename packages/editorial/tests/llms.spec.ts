import { describe, expect, it, vi } from 'vitest'

const listarParaSitemap = vi.fn(() => {
  throw new Error('llms.txt não deve consultar o catálogo')
})
const llmsDaExtensao = vi.fn(() => {
  throw new Error('llms.txt não deve consultar extensões dinâmicas')
})

vi.mock('virtual:editorial/config', () => ({
  default: {
    llms: {
      intro: ['Índice público de leitura.'],
      indices: [{ titulo: 'Ofertas', caminho: '/ofertas/' }],
      indicesPorTenant: {
        principal: [{ titulo: 'Apps', caminho: '/apps/', descricao: 'Fichas de apps' }],
      },
    },
  },
}))
vi.mock('virtual:editorial/extensoes', () => ({ default: [{ llms: llmsDaExtensao }] }))
vi.mock('../src/lib/cms', () => ({ listarParaSitemap }))

const { GET } = await import('../src/rotas/llms.txt')

const contexto = (slug: string, host: string) => ({
  locals: { tenant: { id: slug, slug, nome: slug, canonical_host: host } },
  cache: { enabled: false },
})

describe('llms.txt sem leituras de catálogo', () => {
  it('usa links estáveis do tenant principal sem consultar posts ou extensões', async () => {
    const resposta = await GET(contexto('principal', 'exemplo.test') as Parameters<typeof GET>[0])
    const corpo = await resposta.text()
    expect(corpo).toContain('[Blog](https://exemplo.test/blog/)')
    expect(corpo).toContain('[Ofertas](https://exemplo.test/ofertas/)')
    expect(corpo).toContain('[Apps](https://exemplo.test/apps/) — Fichas de apps')
    expect(corpo).toContain('[Sitemap](https://exemplo.test/sitemap_index.xml)')
    expect(corpo).toContain('[Busca](https://exemplo.test/busca/)')
    expect(corpo).not.toMatch(/\d+ (artigos|ofertas|fichas)/)
    expect(listarParaSitemap).not.toHaveBeenCalled()
    expect(llmsDaExtensao).not.toHaveBeenCalled()
  })

  it('não mistura host nem vertical exclusiva com outro tenant', async () => {
    const resposta = await GET(contexto('outro', 'outro.exemplo.test') as Parameters<typeof GET>[0])
    const corpo = await resposta.text()
    expect(corpo).toContain('[Ofertas](https://outro.exemplo.test/ofertas/)')
    expect(corpo).not.toContain('/apps/')
    expect(corpo).not.toContain('https://exemplo.test/')
  })
})
