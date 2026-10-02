import type { OfertaDTO } from '../../../src/web/lib/cms'

export const tenant = { id: 7, slug: 'site', nome: 'Site', canonical_host: 'site.example.test' }
export const ofertaFixture: OfertaDTO = {
  id: 4, tenant: 7, _status: 'published', titulo: 'Software de exemplo', slug: 'software-exemplo', tipo: 'lifetime',
  corpo: { root: { type: 'root', children: [
    { type: 'paragraph', children: [{ type: 'text', text: 'Análise editorial aprovada.' }] },
    { type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'Características' }] },
    { type: 'paragraph', children: [{ type: 'text', text: 'Conteúdo com formatação.', format: 1 }] },
  ] } },
  meta: { title: 'Título SEO original', description: 'Descrição original aprovada.' }, resumo: 'Resumo editorial estável.',
  preco: { valor: 29, moeda: 'USD', preco_em: '2026-10-01T12:00:00Z', ciclo: 'unico' },
  loja: { id: 2, tenant: 7, nome: 'Loja Exemplo', slug: 'loja', programa: 'outro', url_site: 'https://merchant.example.test/' },
  cupom: { id: 3, tenant: 7, codigo: 'EXEMPLO10', estado: 'publicado', desconto_tipo: 'percentual', desconto_valor: 10,
    verificado_em: '2026-10-01T12:00:00Z', aplica_sobre: 'preco_ja_descontado', condicoes: 'Condições comerciais.' },
  desconto_loja: { valor: 20, tipo: 'percentual', verificado_em: '2026-10-01T12:00:00Z' },
  url_afiliado_fonte: 'https://tracking.example.test/click?aff_id=4',
  beneficios: [{ texto: 'Benefício editorial' }],
  dados: { nome: 'Software', intro_titulo: 'Introdução', features: [{ t: 'Recurso', d: 'Descrição do recurso' }],
    veredito: 'Veredito editorial.', faq: [{ q: 'Como funciona?', a: 'Conforme a descrição.' }],
    preco_antigo: 144, once: 'Pagamento único', sumo: 'Loja · Lifetime', selos: ['Acesso vitalício'] },
  pros_contras: [{ tipo: 'pro', texto: 'Ponto a favor' }, { tipo: 'con', texto: 'Limitação' }],
}

export function ofertaPorSlug(slug: string): OfertaDTO | null {
  const oferta = structuredClone(ofertaFixture)
  oferta.slug = slug
  if (slug === 'lifetime') return { ...oferta, wordpress_id: 'app:4' }
  if (slug === 'lifetime-sem-cupom') return { ...oferta, wordpress_id: 'app:4', cupom: null }
  if (slug === 'normal') return { ...oferta, tipo: 'desconto_api', dados: null, cupom: null,
    preco: { ...oferta.preco, moeda: 'BRL', ciclo: 'mensal' }, pros_contras: [] }
  if (slug === 'sem-preco') return { ...oferta, tipo: 'desconto_api', dados: null, preco: null }
  if (slug === 'vazia') return { id: 1, tenant: 7, _status: 'published', titulo: 'Oferta vazia', slug }
  if (slug === 'outro-tenant') return { ...oferta, tenant: 8 }
  if (slug === 'rascunho') return { ...oferta, _status: 'draft' }
  return null
}
