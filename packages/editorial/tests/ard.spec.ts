import { describe, expect, it, vi } from 'vitest'

vi.mock('virtual:editorial/config', () => ({ default: {
  llms: { tenantsPorHost: {
    'exemplo.test': { slug: 'exemplo', nome: 'Exemplo', canonicalHost: 'exemplo.test' },
  } },
  ard: { recursosPorTenant: {
    exemplo: [{ id: 'busca', nome: 'Busca pública', tipo: 'application/json', caminho: '/search-index.json',
      descricao: 'Índice público.', consultas: ['Onde buscar?', 'Como pesquisar?'] }],
  } },
} }))

const { GET } = await import('../src/rotas/.well-known/ard.json')
const { GET: alias } = await import('../src/rotas/.well-known/ai-catalog.json')

describe('rotas ARD padrão do tema', () => {
  it('dois nomes devolvem o mesmo manifesto sem tenant do CMS', async () => {
    const contexto = { url: new URL('https://exemplo.test/.well-known/ard.json'), locals: {} }
    const a = await GET(contexto as Parameters<typeof GET>[0])
    const b = await alias(contexto as Parameters<typeof alias>[0])
    expect(a.status).toBe(200)
    expect(await a.json()).toEqual(await b.json())
    expect(a.headers.get('cache-control')).toContain('s-maxage=3600')
    const documento = await GET(contexto as Parameters<typeof GET>[0])
    expect((await documento.json()).entries.map((item: { url: string }) => item.url)).toEqual([
      'https://exemplo.test/llms.txt', 'https://exemplo.test/search-index.json',
    ])
  })

  it('host não canônico não anuncia o site de produção', async () => {
    const resposta = await GET({ url: new URL('https://preview.test/.well-known/ard.json'),
      locals: { tenant: { nome: 'Exemplo', slug: 'exemplo', canonical_host: 'exemplo.test' } } } as Parameters<typeof GET>[0])
    expect(resposta.status).toBe(404)
  })
})
