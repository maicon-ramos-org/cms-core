import { ofertaFixture, produtosFixture, variantesFixture } from './dados'

// Respostas deliberadamente sem filtro de tenant/status para exercitar também a
// defesa da leitura real, não só a montagem correta da query REST.
export const cmsFetch = async (path: string) => {
  const url = new URL(path, 'https://cms.example.test')
  if (url.pathname === '/api/produtos_fisicos') return { docs: produtosFixture.filter(p => p.slug === url.searchParams.get('where[and][1][slug][equals]')) }
  if (url.pathname === '/api/variantes_produto') {
    const produto = Number(url.searchParams.get('where[and][1][produto][equals]'))
    return { docs: variantesFixture.map((v, i) => ({ ...v, produto, id: produto === 5 ? v.id : produto * 10 + i })) }
  }
  if (url.pathname === '/api/ofertas_produto') return { docs: [ofertaFixture] }
  return { docs: [] }
}
export const getProdutoBySlug = async (_tenant: unknown, slug: string) => {
  if (['colisao', 'draft-meta'].includes(slug)) throw new Error('O legado não deve ser consultado quando o físico ocupa o slug.')
  return slug === 'legado' ? { id: 90, slug, titulo: 'Produto legado preservado', estado: 'landing', indexavel: false,
    url_afiliado_fonte: 'https://merchant.example.test/', meta: { description: 'Descrição legada original.' } } : null
}
export const getProdutosDaLoja = async () => []
export const PRODUTO_MONETIZAVEL = new Set(['landing', 'indexavel'])
export const caminhoCanonico = (slug: string) => slug
export const urlMidia = (url: string | null | undefined) => url ? new URL(url, 'https://media.example.test').href : undefined
