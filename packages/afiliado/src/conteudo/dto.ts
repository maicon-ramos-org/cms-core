/**
 * DTO público do produto canônico e as três representações que o SITE renderiza a partir dele
 * (HTML consome o DTO; `.md` e JSON-LD saem das funções abaixo). Puro: não conhece rota, tema,
 * tenant nem loja — o site passa canonical e ofertas. Preço/oferta nunca moram no conteúdo.
 */
import { CAMPOS_EDITORIAIS, CONTEUDO_SCHEMA, type PerguntaFrequente, type StatusEditorial } from './contrato'

export interface ProdutoEditorialFonte {
  nome: string; slug: string; marca: string; modelo: string; categoria?: string | null
  descricao?: string | null
  gtin?: string | null; mpn?: string | null
  /** `especificacoes` é JSON de identidade, nunca publicado automaticamente. */
  especificacoes?: unknown
  especificacoes_editoriais?: Array<{ rotulo?: string | null; valor?: string | null }> | null
  estado?: string | null
  indexavel?: boolean | null
  editorial_status?: string | null
  editorial_refresh_em?: string | null
  meta_title?: string | null; meta_description?: string | null; resumo?: string | null
  descricao_markdown?: string | null; destaques?: string[] | null; faq?: PerguntaFrequente[] | null
  facts_hash?: string | null; content_generator?: string | null
  content_version?: number | null; prompt_version?: string | null
}

export interface ProdutoEditorialDTO {
  schema: typeof CONTEUDO_SCHEMA
  slug: string; name: string; brand: string; model: string; category: string | null
  identifiers: { gtin: string | null; mpn: string | null }
  specifications: Array<{ name: string; value: string }>
  /** `editorial`: campos estruturados; `legado`: só `descricao` antiga; `ausente`: nada a publicar. */
  origin: 'editorial' | 'legado' | 'ausente'
  content: {
    metaTitle: string | null; metaDescription: string | null; summary: string | null
    descriptionMarkdown: string | null; highlights: string[]; faq: Array<{ question: string; answer: string }>
  }
  provenance: { factsHash: string | null; generator: string | null; contentVersion: number | null; promptVersion: string | null }
  editorial: { status: StatusEditorial | 'desconhecido'; refreshRequested: boolean }
  /** Decisão explícita do publicador; a revisão do conteúdo ocorreu fora do CMS. */
  indexable: boolean
}

const STATUS = new Set<string>(['sem_conteudo', 'rascunho', 'em_revisao', 'aprovado'])
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const detalhePublico = (v: unknown, maximo: number): string | null => {
  const valor = texto(v)
  return valor && valor.length <= maximo && !/[\u0000-\u001f]|https?:\/\/|www\./i.test(valor) ? valor : null
}

/**
 * Fallback de compatibilidade: sem conteúdo estruturado, a `descricao` antiga vira o texto.
 * O publicador decide explicitamente a indexação, também no caso legado.
 */
export function produtoEditorialDTO(p: ProdutoEditorialFonte): ProdutoEditorialDTO {
  const estruturado = CAMPOS_EDITORIAIS.some(k => (Array.isArray(p[k]) ? p[k].length > 0 : Boolean(texto(p[k]))))
  const legado = !estruturado ? texto(p.descricao) : null
  const status = STATUS.has(String(p.editorial_status)) ? (p.editorial_status as StatusEditorial) : 'desconhecido'
  return {
    schema: CONTEUDO_SCHEMA, slug: p.slug, name: p.nome, brand: p.marca, model: p.modelo, category: p.categoria ?? null,
    identifiers: {
      gtin: typeof p.gtin === 'string' && /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(p.gtin.trim()) ? p.gtin.trim() : null,
      mpn: detalhePublico(p.mpn, 100),
    },
    specifications: Array.isArray(p.especificacoes_editoriais) ? p.especificacoes_editoriais.slice(0, 30).flatMap(item => {
      const name = detalhePublico(item?.rotulo, 80), value = detalhePublico(item?.valor, 300)
      return name && value ? [{ name, value }] : []
    }) : [],
    origin: estruturado ? 'editorial' : legado ? 'legado' : 'ausente',
    content: {
      metaTitle: texto(p.meta_title), metaDescription: texto(p.meta_description),
      summary: estruturado ? texto(p.resumo) : legado,
      descriptionMarkdown: estruturado ? texto(p.descricao_markdown) : legado,
      highlights: Array.isArray(p.destaques) ? p.destaques.filter(d => texto(d)).map(d => d.trim()) : [],
      faq: Array.isArray(p.faq) ? p.faq.flatMap(f => texto(f?.pergunta) && texto(f?.resposta)
        ? [{ question: f.pergunta.trim(), answer: f.resposta.trim() }] : []) : [],
    },
    provenance: { factsHash: p.facts_hash ?? null, generator: p.content_generator ?? null,
      contentVersion: typeof p.content_version === 'number' ? p.content_version : null, promptVersion: p.prompt_version ?? null },
    editorial: { status, refreshRequested: Boolean(p.editorial_refresh_em) },
    indexable: p.indexavel === true && p.estado === 'published',
  }
}

/** Escapa o mínimo para uma linha de rótulo em Markdown; o corpo editorial é Markdown e sai como está. */
const linha = (v: string) => v.replace(/[\r\n]+/g, ' ').replace(/[<>[\]`]/g, '').trim()

/** Markdown para agentes: conteúdo estável do produto. Ofertas/preço são do site (observação com data). */
export function produtoMarkdown(dto: ProdutoEditorialDTO): string {
  const c = dto.content
  const out = [`# ${linha(dto.name)}`, '']
  if (c.summary) out.push(c.summary, '')
  out.push(`**Marca:** ${linha(dto.brand)}`, `**Modelo:** ${linha(dto.model)}`)
  if (dto.category) out.push(`**Categoria:** ${linha(dto.category)}`)
  if (dto.identifiers.gtin) out.push(`**GTIN:** ${linha(dto.identifiers.gtin)}`)
  if (dto.identifiers.mpn) out.push(`**MPN:** ${linha(dto.identifiers.mpn)}`)
  if (dto.specifications.length) out.push('', '## Ficha técnica', '',
    ...dto.specifications.map(spec => `- ${linha(spec.name)}: ${linha(spec.value)}`))
  if (c.descriptionMarkdown && c.descriptionMarkdown !== c.summary) out.push('', c.descriptionMarkdown)
  if (c.highlights.length) out.push('', '## Destaques', '', ...c.highlights.map(d => `- ${linha(d)}`))
  if (c.faq.length) out.push('', '## Perguntas frequentes', '', ...c.faq.flatMap(f => [`### ${linha(f.question)}`, '', f.answer, '']))
  return `${out.join('\n').trimEnd()}\n`
}

export interface OfertaJsonLd {
  url: string; price: number; priceCurrency: string
  availability?: 'InStock' | 'OutOfStock'; priceValidUntil?: string; seller?: string
}

/**
 * JSON-LD `Product` (+ `FAQPage` quando há FAQ). Só descreve o que existe: sem rating, review,
 * frete ou disponibilidade inventados. `Offer` só nasce de oferta fornecida pelo site com preço.
 */
export function produtoJsonLd(dto: ProdutoEditorialDTO, opcoes: { canonical: string; imagem?: string; ofertas?: readonly OfertaJsonLd[] }) {
  const { canonical } = opcoes
  const ofertas = (opcoes.ofertas ?? []).filter(o => Number.isFinite(o.price) && o.price > 0 && o.priceCurrency && o.url)
  const produto = {
    '@type': 'Product', '@id': `${canonical}#produto`, url: canonical, name: dto.name,
    ...(dto.content.summary ? { description: dto.content.summary } : {}),
    brand: { '@type': 'Brand', name: dto.brand }, model: dto.model,
    ...(dto.category ? { category: dto.category } : {}),
    ...(opcoes.imagem ? { image: opcoes.imagem } : {}),
    ...(dto.identifiers.gtin ? { gtin: dto.identifiers.gtin } : {}),
    ...(dto.identifiers.mpn ? { mpn: dto.identifiers.mpn } : {}),
    ...(dto.specifications.length ? { additionalProperty: dto.specifications.map(spec => ({
      '@type': 'PropertyValue', name: spec.name, value: spec.value,
    })) } : {}),
    ...(ofertas.length ? { offers: ofertas.map(o => ({ '@type': 'Offer', url: o.url, price: o.price, priceCurrency: o.priceCurrency,
      ...(o.availability ? { availability: `https://schema.org/${o.availability}` } : {}),
      ...(o.priceValidUntil ? { priceValidUntil: o.priceValidUntil } : {}),
      ...(o.seller ? { seller: { '@type': 'Organization', name: o.seller } } : {}) })) } : {}),
  }
  const faq = dto.content.faq.length ? [{ '@type': 'FAQPage', '@id': `${canonical}#faq`, mainEntity: dto.content.faq.map(f => ({
    '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) }] : []
  return { '@context': 'https://schema.org', '@graph': [produto, ...faq] }
}
