import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OfertaDTO, TenantDTO } from '../src/web/lib/cms'
import type { ProdutoFisico } from '../src/web/lib/catalogo'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), config: { pastaPorOrigem: {} as Record<string, string>, redesDeRastreio: [] } }))
vi.mock('virtual:afiliado/config', () => ({ default: mocks.config }))
vi.mock('../src/web/lib/cms', async importOriginal => ({ ...await importOriginal<typeof import('../src/web/lib/cms')>(), cmsFetch: mocks.fetch }))
import { llms } from '../src/web/extensao'
import { fichasParaLlms } from '../src/web/lib/llms-fichas'

const tenant: TenantDTO = { id: 7, slug: 'a', nome: 'Site A', canonical_host: 'a.example.test' }
const oferta = (extra: Partial<OfertaDTO> = {}): OfertaDTO => ({ id: 1, tenant: 7, _status: 'published',
  titulo: 'Ficha pública', slug: 'ficha', tipo: 'desconto_api', ...extra })
const produto = (extra: Partial<ProdutoFisico> = {}): ProdutoFisico => ({ id: 1, tenant: 7, nome: 'Ficha pública', slug: 'ficha',
  marca: 'Marca', modelo: 'M1', estado: 'published', indexavel: true, ...extra })
function banco(ofertas: OfertaDTO[] = [], produtos: ProdutoFisico[] = []) {
  mocks.fetch.mockImplementation(async (path: string) => {
    const url = new URL(path, 'https://cms.example.test'), page = Number(url.searchParams.get('page'))
    const docs = url.pathname === '/api/ofertas' ? ofertas : produtos
    return { docs: docs.slice((page - 1) * 100, page * 100), page, totalPages: Math.max(1, Math.ceil(docs.length / 100)) }
  })
}
beforeEach(() => { mocks.fetch.mockReset(); mocks.config.pastaPorOrigem = {} })

describe('llms: fichas monetizáveis compartilhadas', () => {
  it('lista oferta publicada e produto físico publicado/indexável numa seção com HTML e Markdown', async () => {
    banco([oferta()], [produto()])
    expect(await llms(tenant, 'https://preview.example.test')).toEqual({ indices: [], secoes: [{ titulo: 'Fichas monetizáveis', linhas: [
      '- [Ficha pública](https://a.example.test/ofertas/ficha/) — [Markdown](https://a.example.test/ofertas/ficha.md)',
      '- [Ficha pública](https://a.example.test/p/ficha/) — [Markdown](https://a.example.test/p/ficha.md)',
    ] }] })
  })
  it('preserva a elegibilidade legada da oferta publicada, sem exigir flag que a collection não tem', async () => {
    banco([oferta(), oferta({ id: 2, slug: 'explicita', indexavel: true }), oferta({ id: 3, slug: 'sem-flag', indexavel: null })])
    expect(await fichasParaLlms(tenant)).toHaveLength(3)
  })
  it('descarta draft e opt-out da oferta, produto não publicado/noindex e versão física draft', async () => {
    banco([oferta({ _status: 'draft' }), oferta({ id: 2, indexavel: false })], [
      produto({ estado: 'draft' }), produto({ id: 2, estado: 'review' }), produto({ id: 3, indexavel: false }),
      produto({ id: 4, indexavel: undefined }), produto({ id: 5, _status: 'draft' }),
    ])
    expect(await fichasParaLlms(tenant)).toEqual([])
  })
  it('lifetime é uma ficha pública, sem expor os campos comerciais específicos', async () => {
    banco([oferta({ tipo: 'lifetime', dados: { preco_antigo: 199, once: 'Pagamento comercial', selos: ['Selo comercial'] } })])
    const out = await llms(tenant, 'https://a.example.test')
    expect(out.secoes![0]!.linhas).toHaveLength(1)
    expect(JSON.stringify(out)).not.toMatch(/199|Pagamento comercial|Selo comercial/)
  })
  it('protege tenant no adapter mesmo se a resposta da REST trouxer documentos cruzados', async () => {
    banco([oferta(), oferta({ id: 8, slug: 'somente-b', titulo: 'Outra oferta', tenant: 8 })], [
      produto(), produto({ id: 8, slug: 'somente-b', nome: 'Outro produto', tenant: { id: 8 } }),
    ])
    const out = await fichasParaLlms(tenant)
    expect(out).toHaveLength(2)
    expect(JSON.stringify(out)).not.toMatch(/Outra oferta|Outro produto|somente-b/)
    for (const [path] of mocks.fetch.mock.calls) expect(new URL(path, 'https://cms.example.test').searchParams.get('where[and][0][tenant][equals]')).toBe('7')
  })
  it('não funde por id, título ou slug; as URLs próprias das duas origens permanecem', async () => {
    banco([oferta()], [produto()])
    const out = await fichasParaLlms(tenant)
    expect(out.map(i => i.html)).toEqual(['https://a.example.test/ofertas/ficha/', 'https://a.example.test/p/ficha/'])
  })
  it('pagina mais de 100 documentos em cada collection, sem buscas comerciais por ficha', async () => {
    banco(Array.from({ length: 137 }, (_, i) => oferta({ id: i + 1, slug: `oferta-${i + 1}` })),
      Array.from({ length: 113 }, (_, i) => produto({ id: i + 1, slug: `produto-${i + 1}` })))
    const out = await fichasParaLlms(tenant)
    expect(out).toHaveLength(250)
    expect(new Set(out.map(i => i.html)).size).toBe(250)
    expect(mocks.fetch).toHaveBeenCalledTimes(4)
    for (const collection of ['ofertas', 'produtos_fisicos']) {
      const urls = mocks.fetch.mock.calls.map(([path]) => new URL(path, 'https://cms.example.test')).filter(url => url.pathname === `/api/${collection}`)
      expect(urls.map(url => url.searchParams.get('page'))).toEqual(['1', '2'])
      for (const url of urls) {
        expect(url.searchParams.get('limit')).toBe('100')
        expect(url.searchParams.get('depth')).toBe('0')
        expect(url.searchParams.get('sort')).toBe('id')
        expect(url.searchParams.get('where[and][0][tenant][equals]')).toBe('7')
      }
    }
    expect(JSON.stringify(out)).toContain('produto-113')
    expect(JSON.stringify(out)).toContain('oferta-137')
  })
  it('consulta só metadados, com publicação/tenant na REST e flag explícita do físico', async () => {
    banco()
    await fichasParaLlms(tenant)
    for (const [path] of mocks.fetch.mock.calls) {
      const url = new URL(path, 'https://cms.example.test')
      expect(url.searchParams.get('select[tenant]')).toBe('true')
      for (const campo of ['preco', 'cupom', 'loja', 'disponibilidade', 'url_afiliado', 'url_afiliado_fonte', 'corpo', 'dados']) {
        expect(url.searchParams.has(`select[${campo}]`)).toBe(false)
      }
      if (url.pathname === '/api/ofertas') expect(url.searchParams.get('where[and][1][_status][equals]')).toBe('published')
      else {
        expect(url.searchParams.get('where[and][1][estado][equals]')).toBe('published')
        expect(url.searchParams.get('where[and][2][indexavel][equals]')).toBe('true')
      }
    }
  })
  it('respeita a pasta canônica configurada da oferta e seu Markdown correspondente', async () => {
    mocks.config.pastaPorOrigem = { app: 'apps' }
    banco([oferta({ wordpress_id: 'app:10', slug: 'software' })])
    expect(await fichasParaLlms(tenant)).toEqual([{ titulo: 'Ficha pública',
      html: 'https://a.example.test/apps/software/', markdown: 'https://a.example.test/apps/software.md' }])
  })
  it('deduplica apenas canonical idêntico, de forma estável, com prioridade física em /p', async () => {
    mocks.config.pastaPorOrigem = { product: 'p' }
    const ofertas = [oferta({ id: 3, titulo: 'Título duplicado', wordpress_id: 'product:3' }),
      oferta({ id: 2, titulo: 'Título anterior', wordpress_id: 'product:2' })]
    banco(ofertas, [produto({ nome: 'Título físico' })])
    const primeira = await fichasParaLlms(tenant)
    banco([...ofertas].reverse(), [produto({ nome: 'Título físico' })])
    expect(await fichasParaLlms(tenant)).toEqual(primeira)
    expect(primeira).toEqual([{ titulo: 'Título físico', html: 'https://a.example.test/p/ficha/', markdown: 'https://a.example.test/p/ficha.md' }])
  })
  it('ordena pela URL canônica sem depender da ordem de retorno ou locale', async () => {
    const ofertas = [oferta({ id: 2, slug: 'zeta' }), oferta({ id: 1, slug: 'alfa' })]
    const produtos = [produto({ id: 2, slug: 'zeta' }), produto({ id: 1, slug: 'alfa' })]
    banco(ofertas, produtos)
    const primeira = await fichasParaLlms(tenant)
    banco([...ofertas].reverse(), [...produtos].reverse())
    expect(await fichasParaLlms(tenant)).toEqual(primeira)
    expect(primeira.map(i => i.html)).toEqual([
      'https://a.example.test/ofertas/alfa/', 'https://a.example.test/ofertas/zeta/',
      'https://a.example.test/p/alfa/', 'https://a.example.test/p/zeta/',
    ])
  })
  it('não expõe campos comerciais mesmo se estiverem presentes na resposta de metadados', async () => {
    banco([oferta({ preco: { valor: 9876, moeda: 'BRL', preco_em: '2026-09-26T10:00:00Z' },
      url_afiliado_fonte: 'https://tracking.example.test/click', disponibilidade: 'disponivel',
      loja: { id: 2, tenant: 7, nome: 'Seller privado', slug: 'seller', programa: 'outro', url_site: 'https://loja.example.test' },
      cupom: { id: 3, tenant: 7, codigo: 'CUPOMSECRETO10', estado: 'publicado', desconto_tipo: 'percentual', desconto_valor: 10 } })], [produto()])
    const out = JSON.stringify(await llms(tenant, 'https://a.example.test'))
    expect(out).not.toMatch(/9876|BRL|2026-09-26|tracking|Seller privado|CUPOMSECRETO|disponivel|\/r\//)
    expect(out).not.toContain('Lojas com catálogo')
  })
  it('não deixa título abrir novas linhas, links ou markup na listagem Markdown', async () => {
    banco([oferta({ titulo: 'Título [editorial]\n<script>extra</script>' })])
    const linhas = (await llms(tenant, 'https://a.example.test')).secoes![0]!.linhas
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).not.toContain('\n')
    expect(linhas[0]).toContain('Título \\[editorial\\] \\<script\\>extra\\</script\\>')
  })
  it('omite slugs sem representação Markdown pública, sem criar aliases ou redirects', async () => {
    banco([oferta({ slug: 'a/b' }), oferta({ id: 2, slug: 'a?cupom=1' })], [produto({ slug: 'a b' })])
    expect(await fichasParaLlms(tenant)).toEqual([])
  })
  it('falha sem consultar o CMS se o host canônico contiver caminho ou credenciais', async () => {
    banco()
    await expect(fichasParaLlms({ ...tenant, canonical_host: 'a.example.test/caminho' })).rejects.toThrow('Host canônico inválido')
    await expect(fichasParaLlms({ ...tenant, canonical_host: 'user@a.example.test' })).rejects.toThrow('Host canônico inválido')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('recusa paginação inconsistente em vez de truncar silenciosamente o índice', async () => {
    mocks.fetch.mockResolvedValue({ docs: [], totalPages: 2, page: 1 })
    await expect(fichasParaLlms(tenant)).rejects.toThrow('Paginação inválida')
  })
  it('não mascara erro de leitura com índice vazio ou parcial', async () => {
    mocks.fetch.mockRejectedValue(new Error('CMS indisponível'))
    await expect(llms(tenant, 'https://a.example.test')).rejects.toThrow('CMS indisponível')
  })
})
