import type { Payload } from 'payload'

export const observadoEm = '2026-09-26T10:00:00.000Z'
export const lexical = (text: string) => ({ root: { type: 'root', version: 1, format: '', indent: 0, direction: null,
  children: [{ type: 'paragraph', version: 1, format: '', indent: 0, direction: null,
    children: [{ type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' }] }] } })

/** Collections reais, sem extensões de campo da fixture nem migrations de teste. */
export async function criaCenario(payload: Payload, label: 'A' | 'B') {
  const create = (collection: string, data: Record<string, unknown>) =>
    payload.create({ collection: collection as never, data: data as never, depth: 0 }) as Promise<any>
  const slug = label.toLowerCase()
  const tenant = await create('tenants', { nome: `Tenant ${label}`, slug, canonical_host: `${slug}.example.test` })
  const loja = await create('lojas', { tenant: tenant.id, nome: `Loja ${label}`, slug: 'loja', programa: 'amazon',
    url_site: 'https://www.amazon.com.br/', _status: 'published' })
  const codigo = `INTEGRACAO-${label}-CUPOM10`
  const cupom = await create('cupons', { tenant: tenant.id, loja: loja.id, codigo,
    desconto_tipo: 'percentual', desconto_valor: 10, estado: 'publicado', metodo: 'manual',
    verificado_em: observadoEm, origem: 'manual', condicoes: 'Condições comerciais da fixture.',
    url_afiliado_fonte: 'https://tracking.example.test/coupon', _status: 'published' })
  const nome = `Ficha documentada ${label}`, corpo = `Texto editorial aprovado ${label}.`
  const resumo = `Resumo editorial estável ${label}.`
  const meta = { title: `Título editorial ${label}`, description: `Descrição editorial ${label}.` }
  const faq = [{ pergunta: 'Qual o uso?', resposta: 'Conforme a documentação.' }]
  const oferta = await create('ofertas', { tenant: tenant.id, loja: loja.id, cupom: cupom.id,
    titulo: nome, slug: 'ficha', tipo: 'desconto_api', corpo: lexical(corpo), resumo, meta, faq,
    beneficios: [{ texto: 'Uso documentado' }], origem: `fixture:${label}:comum`,
    preco: { valor: 49.9, moeda: 'BRL', ciclo: 'mensal', preco_em: observadoEm },
    url_afiliado_fonte: 'https://tracking.example.test/click', _status: 'published' })
  const lifetime = await create('ofertas', { tenant: tenant.id, loja: loja.id,
    titulo: `Software vitalício ${label}`, slug: 'lifetime', tipo: 'lifetime', corpo: lexical(corpo), resumo, meta,
    origem: `fixture:${label}:lifetime`, preco: { valor: 29, moeda: 'USD', ciclo: 'unico', preco_em: observadoEm },
    url_afiliado_fonte: 'https://tracking.example.test/lifetime', _status: 'published',
    dados: { nome: `Aplicativo ${label}`, intro_titulo: 'Introdução documentada', tagline: 'Uso do aplicativo',
      features: [{ t: 'Recurso editorial', d: 'Descrição do recurso.' }], veredito: 'Veredito documentado.',
      faq: [{ q: 'Como funciona?', a: 'Conforme a documentação.' }], preco_antigo: 144,
      once: 'Pagamento único', sumo: 'Loja · Lifetime', selos: ['Acesso vitalício'] } })
  const produto = await create('produtos_fisicos', { tenant: tenant.id, nome, slug: 'ficha', marca: 'Fabricante',
    modelo: 'M1', categoria: 'equipamento', estado: 'published', indexavel: true,
    descricao_markdown: corpo, resumo, destaques: ['Uso documentado'], faq,
    meta_title: meta.title, meta_description: meta.description,
    especificacoes_editoriais: [{ rotulo: 'Peso', valor: '500 g' }] })
  const variante = await create('variantes_produto', { tenant: tenant.id, produto: produto.id,
    nome: `Acabamento ${label}`, sku_fabricante: 'M1-PRETO', estado: 'confirmada' })
  const listings = []
  for (const [index, asin] of (label === 'A' ? ['B0ABCDEFGH', 'B0ABCDEFGI'] : ['B0ABCDEFGJ', 'B0ABCDEFGK']).entries()) {
    listings.push(await create('ofertas_produto', { tenant: tenant.id, variante: variante.id, loja: loja.id,
      seller_normalizado: `seller-${label}-${index}`, external_listing_id: asin,
      url_origem: `https://www.amazon.com.br/dp/${asin}`,
      url_afiliado: `https://www.amazon.com.br/dp/${asin}?${index ? `linkCode=ll2&linkId=fixture${label}${index}&ref_=as_li_ss_tl&` : ''}th=1&tag=exemplo-20`,
      estado: 'ativa', preco: 99 + index * 100, disponibilidade: 'desconhecida',
      fonte: index ? 'amazon-manual-sitestripe' : 'amazon-manual-revisado', observado_em: observadoEm }))
  }
  if (label === 'B') await create('ofertas', { tenant: tenant.id, loja: loja.id, titulo: 'Somente B', slug: 'exclusiva-b',
    tipo: 'credito', corpo: lexical('Conteúdo exclusivo B.'), origem: 'fixture:B:exclusiva', _status: 'published' })
  return { tenant, loja, cupom, codigo, oferta, lifetime, produto, variante, listings }
}
