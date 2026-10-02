import { describe, expect, it } from 'vitest'
import { produtoEditorialDTO, produtoJsonLd, produtoMarkdown, produtoMarkdownHtml, type ProdutoEditorialFonte } from '../src/conteudo'

const base: ProdutoEditorialFonte = { nome: 'Produto Exemplo', slug: 'produto-exemplo', marca: 'Marca', modelo: 'M-1', categoria: 'equipamento' }
const editorial: ProdutoEditorialFonte = { ...base, estado: 'published', indexavel: true, editorial_status: 'aprovado',
  meta_title: 'Produto Exemplo M-1', meta_description: 'Descrição.', resumo: 'Resumo direto.', descricao_markdown: '## O que é\n\nCorpo.',
  destaques: ['Fato um', 'Fato dois'], faq: [{ pergunta: 'Serve?', resposta: 'Serve.' }], facts_hash: 'c'.repeat(64),
  content_generator: 'gerador', content_version: 2, prompt_version: 'v1' }

describe('DTO público do produto canônico', () => {
  it('conteúdo estruturado completo, aprovado e publicado é indexável', () => {
    const dto = produtoEditorialDTO(editorial)
    expect(dto).toMatchObject({ schema: 'product_content/v1', origin: 'editorial', indexable: true,
      content: { summary: 'Resumo direto.', highlights: ['Fato um', 'Fato dois'], faq: [{ question: 'Serve?', answer: 'Serve.' }] },
      provenance: { factsHash: 'c'.repeat(64), contentVersion: 2 }, editorial: { status: 'aprovado', refreshRequested: false } })
  })
  it.each([
    ['flag desligada', { indexavel: false }], ['não publicado', { estado: 'draft' }], ['flag ausente', { indexavel: undefined }],
  ])('indexação exige publicação e flag explícita: %s', (_n, mudanca) => {
    expect(produtoEditorialDTO({ ...editorial, ...mudanca }).indexable).toBe(false)
  })
  it('revisão, FAQ e hash não são portões de indexação do CMS', () => {
    expect(produtoEditorialDTO({ ...editorial, editorial_status: 'em_revisao', faq: [], facts_hash: null }).indexable).toBe(true)
  })
  it('descrição legada aparece como texto e respeita a flag explícita', () => {
    const dto = produtoEditorialDTO({ ...base, estado: 'published', indexavel: true, editorial_status: 'aprovado', descricao: ' Texto antigo. ' })
    expect(dto.origin).toBe('legado')
    expect(dto.content.summary).toBe('Texto antigo.')
    expect(dto.content.descriptionMarkdown).toBe('Texto antigo.')
    expect(dto.indexable).toBe(true)
  })
  it('sem nada: origem ausente, sem inventar texto', () => {
    const dto = produtoEditorialDTO(base)
    expect(dto).toMatchObject({ origin: 'ausente', indexable: false, editorial: { status: 'desconhecido' } })
    expect(dto.content.summary).toBeNull()
  })
  it('conteúdo estruturado tem precedência sobre o legado', () => {
    expect(produtoEditorialDTO({ ...editorial, descricao: 'antigo' }).content.summary).toBe('Resumo direto.')
  })
  it('expõe somente identificadores e especificações editoriais explícitas, sem JSON de identidade bruto', () => {
    const dto = produtoEditorialDTO({ ...editorial, gtin: '7891234567895', mpn: 'FAB-123',
      especificacoes: { token_interno: 'não público' },
      especificacoes_editoriais: [{ rotulo: 'Material', valor: 'PLA' },
        { rotulo: 'Destino', valor: 'https://afiliado.example/?key=secreta' }] })
    expect(dto.identifiers).toEqual({ gtin: '7891234567895', mpn: 'FAB-123' })
    expect(dto.specifications).toEqual([{ name: 'Material', value: 'PLA' }])
    expect(JSON.stringify(dto)).not.toContain('token_interno')
    expect(JSON.stringify(dto)).not.toContain('secreta')
  })
})

describe('.md e JSON-LD gerados do mesmo DTO', () => {
  const dto = produtoEditorialDTO(editorial)
  it('Markdown traz conteúdo estável e nenhuma oferta/preço', () => {
    const md = produtoMarkdown(dto)
    expect(md).toContain('# Produto Exemplo')
    expect(md).toContain('## Destaques')
    expect(md).toContain('### Serve?')
    expect(md).not.toMatch(/R\$|preço/i)
    expect(md.endsWith('\n')).toBe(true)
  })
  it('Markdown neutraliza quebra de linha e marcação nos rótulos', () => {
    const md = produtoMarkdown(produtoEditorialDTO({ ...editorial, nome: 'Nome\n## injetado [x](y)' }))
    expect(md.split('\n')[0]).toBe('# Nome ## injetado x(y)')
  })
  it('HTML público interpreta Markdown, mas não executa HTML ou protocolo perigoso', () => {
    const html = produtoMarkdownHtml('## Características\n\n<script>alert(1)</script> [ruim](javascript:alert(1))')
    expect(html).toContain('<h2>Características</h2>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('href="javascript:')
  })
  it('JSON-LD: Product + FAQPage, sem Offer quando o site não passa oferta', () => {
    const ld = produtoJsonLd(dto, { canonical: 'https://exemplo.test/p/produto-exemplo/' })
    expect(ld['@graph'].map(n => n['@type'])).toEqual(['Product', 'FAQPage'])
    const produto = ld['@graph'][0] as Record<string, unknown>
    expect(produto).not.toHaveProperty('offers')
    expect(produto).not.toHaveProperty('aggregateRating')
    expect(produto.description).toBe('Resumo direto.')
  })
  it('JSON-LD usa imagem, GTIN, MPN e especificações reais sem criar Offer ou rating', () => {
    const enriched = produtoEditorialDTO({ ...editorial, gtin: '7891234567895', mpn: 'FAB-123',
      especificacoes_editoriais: [{ rotulo: 'Material', valor: 'PLA' }] })
    const ld = produtoJsonLd(enriched, { canonical: 'https://exemplo.test/p/produto-exemplo/',
      imagem: 'https://media.exemplo.test/produto.jpg' })
    const product = ld['@graph'][0] as Record<string, unknown>
    expect(product).toMatchObject({ image: 'https://media.exemplo.test/produto.jpg',
      gtin: '7891234567895', mpn: 'FAB-123',
      additionalProperty: [{ '@type': 'PropertyValue', name: 'Material', value: 'PLA' }] })
    expect(product).not.toHaveProperty('offers')
    expect(product).not.toHaveProperty('aggregateRating')
    expect(produtoMarkdown(enriched)).toContain('**GTIN:** 7891234567895')
    expect(produtoMarkdown(enriched)).toContain('- Material: PLA')
  })
  it('Offer só nasce de oferta com preço válido fornecida pelo site; sem FAQ não há FAQPage', () => {
    const semFaq = produtoEditorialDTO({ ...editorial, faq: [] })
    const ld = produtoJsonLd(semFaq, { canonical: 'https://exemplo.test/p/x/', ofertas: [
      { url: 'https://exemplo.test/r/f1', price: 10, priceCurrency: 'BRL', availability: 'InStock', priceValidUntil: '2026-10-01', seller: 'Loja' },
      { url: 'https://exemplo.test/r/f2', price: 0, priceCurrency: 'BRL' },
    ] })
    expect(ld['@graph']).toHaveLength(1)
    const offers = (ld['@graph'][0] as any).offers
    expect(offers).toHaveLength(1)
    expect(offers[0]).toMatchObject({ '@type': 'Offer', price: 10, availability: 'https://schema.org/InStock', seller: { name: 'Loja' } })
  })
})
