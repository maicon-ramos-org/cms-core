import type { Listing, ProdutoFisico, Variante } from '../../../src/web/lib/catalogo'
export const tenant = { id: 7, slug: 'site', nome: 'Site', canonical_host: 'site.example.test' }
export const produtoFixture: ProdutoFisico = {
  id: 5, tenant: 7, nome: 'Equipamento exemplo', slug: 'produto', marca: 'Fabricante', modelo: 'M1',
  estado: 'published', indexavel: true, categoria: 'equipamento',
  meta_title: 'Título SEO do equipamento', meta_description: 'Descrição aprovada do equipamento.',
  resumo: 'Resumo editorial estável.', descricao_markdown: '## Detalhes\n\nCorpo aprovado com **formatação**.',
  destaques: ['Uso simples', 'Construção sólida'], faq: [{ pergunta: 'Serve em casa?', resposta: 'Conforme as especificações.' }],
  gtin: '7891234567895', mpn: 'M1-PT', especificacoes_editoriais: [{ rotulo: 'Peso', valor: '500 g' }],
  imagem: { url: '/equipamento.jpg', alt: 'Equipamento em uso', width: 900, height: 600 },
  pros_contras: [{ tipo: 'pro', texto: 'Vantagem editorial' }, { tipo: 'con', texto: 'Limitação editorial' }],
}
export const variantesFixture: Variante[] = [
  { id: 4, tenant: 7, produto: 5, nome: 'Preto', estado: 'confirmada' },
  { id: 6, tenant: 7, produto: 5, nome: 'Branco', estado: 'confirmada' },
]
export const ofertaFixture: Listing = { id: 9, tenant: 7, variante: 4, loja: 2, estado: 'ativa',
  fonte: 'amazon-manual-revisado', external_listing_id: 'B0ABCDEFGH',
  url_origem: 'https://www.amazon.com.br/dp/B0ABCDEFGH',
  url_afiliado: 'https://www.amazon.com.br/dp/B0ABCDEFGH?th=1&tag=exemplo-20', observado_em: '2026-09-26T10:00:00Z' }

export const produtosFixture: ProdutoFisico[] = [
  produtoFixture,
  { ...produtoFixture, id: 10, slug: 'sem-ofertas' },
  { ...produtoFixture, id: 11, slug: 'nao-indexavel', indexavel: false },
  { id: 12, tenant: 7, slug: 'sem-editorial', nome: 'Produto sem editorial', marca: 'Fabricante', modelo: 'M2', estado: 'published' },
  { ...produtoFixture, id: 13, slug: 'outro-tenant', tenant: 8 },
  { ...produtoFixture, id: 14, slug: 'rascunho', estado: 'draft' },
  { ...produtoFixture, id: 15, slug: 'draft-meta', _status: 'draft' },
  { ...produtoFixture, id: 16, slug: 'colisao' },
]
