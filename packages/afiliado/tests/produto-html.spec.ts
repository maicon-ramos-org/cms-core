import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fileURLToPath } from 'node:url'
import { graph, servidorPublico } from './fixtures/servidor-publico'
import { ofertaFixture } from './fixtures/produto/dados'

let server: Awaited<ReturnType<typeof servidorPublico>>['server'] | undefined
let origin: string
const page = (path: string) => fetch(`${origin}${path}`, { signal: AbortSignal.timeout(20_000) })
beforeAll(async () => {
  vi.stubEnv('AMAZON_TAG', 'exemplo-20')
  const routePath = (name: string) => fileURLToPath(new URL(`../src/web/rotas/p/${name}`, import.meta.url))
  const result = await servidorPublico(new URL('./fixtures/produto/', import.meta.url), [
    { pattern: '/p/[slug]/', entrypoint: routePath('[slug].astro') },
    { pattern: '/p/[slug].json', entrypoint: routePath('[slug].json.ts') },
    { pattern: '/p/[slug].md', entrypoint: routePath('[slug].md.ts') },
  ])
  server = result.server; origin = result.origin
}, 30_000)
afterAll(async () => { await server?.stop(); vi.unstubAllEnvs() })

describe('produto físico: HTML real, Markdown e JSON', () => {
  it('mantém layout, imagem, seções, disclosure e links finais com tag/variante', async () => {
    const response = await page('/p/produto/'), html = await response.text()
    expect(response.status, html.slice(0, 250)).toBe(200)
    expect(response.headers.get('x-robots-tag')).toBeNull()
    for (const text of ['class="ficha"', 'Equipamento exemplo', 'Fabricante · M1', 'Resumo editorial estável.',
      'class="produto-imagem"', 'https://media.example.test/equipamento.jpg', 'Destaques', 'Ficha técnica',
      '7891234567895', '500 g', 'Serve em casa?', 'Vantagem editorial', 'Limitação editorial',
      'Como associado da Amazon', 'Preto', 'Branco', 'Ver preço na Amazon']) expect(html.includes(text), text).toBe(true)
    expect(html).toContain('<strong>formatação</strong>')
    expect(html).toContain(`href="${ofertaFixture.url_afiliado!.replace(/&/g, '&amp;')}"`)
    expect(html).toContain('rel="sponsored noopener noreferrer" target="_blank"')
    expect(html).not.toContain('href="/r/')
    expect(html.indexOf('class="resumo"')).toBeLessThan(html.indexOf('class="corpo"'))
    expect(html.indexOf('class="corpo"')).toBeLessThan(html.indexOf('aria-label="Ficha técnica"'))
    expect(graph(html)[0]).not.toHaveProperty('offers')
  }, 20_000)
  it('as três representações compartilham conteúdo, identidade, SEO e ação comercial', async () => {
    const html = await (await page('/p/produto/')).text()
    const json = await (await page('/p/produto.json')).json()
    const mdResponse = await page('/p/produto.md'), md = await mdResponse.text()
    expect(json).toMatchObject({ url: 'https://site.example.test/p/produto/', title: 'Equipamento exemplo',
      price: null, indexable: true, offers: [{ href: ofertaFixture.url_afiliado }] })
    for (const text of [json.title, json.summary, ...json.highlights, json.faq[0].question,
      json.specifications[0].value, json.prosCons[0].text]) {
      expect(html.includes(text), text).toBe(true)
      expect(md.includes(text), text).toBe(true)
    }
    expect(html).toContain('<title>Título SEO do equipamento</title>')
    expect(html).toContain('content="Descrição aprovada do equipamento."')
    for (const path of ['https://site.example.test/p/produto/', '/p/produto.md', '/p/produto.json']) expect(html).toContain(`href="${path}"`)
    expect(md).toContain(ofertaFixture.url_afiliado!)
    expect(mdResponse.headers.get('link')).toBe('<https://site.example.test/p/produto/>; rel="canonical"')
    expect(graph(html)[0]).toMatchObject({ name: json.title, image: json.image.url, gtin: json.identifiers.gtin })
    expect(`${JSON.stringify(json)}${md}`).not.toMatch(/url_origem|external_listing_id|amazon-manual|\/r\/f/)
  })
  it('sem oferta comercial mantém conteúdo/variantes e não fabrica preço ou Offer', async () => {
    const html = await (await page('/p/sem-ofertas/')).text()
    const json = await (await page('/p/sem-ofertas.json')).json()
    const md = await (await page('/p/sem-ofertas.md')).text()
    expect(html).toContain('Nenhuma oferta revisada disponível para consulta.')
    expect(html).toContain('Resumo editorial estável.')
    expect(json).toMatchObject({ price: null, offers: [], indexable: true })
    expect(md).toContain('Corpo aprovado')
    expect(md).not.toContain('tag=exemplo-20')
    expect(graph(html)[0]).not.toHaveProperty('offers')
  })
  it('produto publicado não indexável continua acessível sem gate editorial', async () => {
    const response = await page('/p/nao-indexavel/'), html = await response.text()
    expect(response.status).toBe(200)
    expect(response.headers.get('x-robots-tag')).toBe('noindex, follow')
    expect(html).toContain('name="robots" content="noindex, follow"')
    expect(await (await page('/p/nao-indexavel.json')).json()).toMatchObject({ indexable: false })
    expect((await page('/p/nao-indexavel.md')).status).toBe(200)
  })
  it('sem editorial não cria texto, FAQ ou requisitos de revisão', async () => {
    const response = await page('/p/sem-editorial/'), html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain('Produto sem editorial')
    expect(html).not.toContain('aria-label="Perguntas frequentes"')
    expect(html).not.toContain('Resumo editorial estável.')
    expect(await (await page('/p/sem-editorial.json')).json()).toMatchObject({ descriptionMarkdown: null, faq: [], indexable: false })
  })
  it.each(['outro-tenant', 'rascunho', 'draft-meta'])('recusa %s nos três formatos', async slug => {
    for (const suffix of ['/', '.json', '.md']) {
      const response = await page(`/p/${slug}${suffix}`)
      expect(response.status).toBe(404)
      expect(await response.text()).not.toContain('Equipamento exemplo')
    }
  })
  it('colisão de slug continua priorizando o físico, sem consultar o legado', async () => {
    expect((await page('/p/colisao/')).status).toBe(200)
    expect(await (await page('/p/colisao.json')).json()).toMatchObject({ contentType: 'physical-product' })
    expect(await (await page('/p/colisao.md')).text()).toContain('# Equipamento exemplo')
  })
  it('fallback legado mantém layout, canonical, CTA e leitura anterior nos três formatos', async () => {
    const response = await page('/p/legado/'), html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain('class="produto"')
    expect(html).toContain('href="/r/p90?ref=produto"')
    expect(html).toContain('href="https://site.example.test/p/legado/"')
    expect(html).toContain('content="Descrição legada original."')
    expect(await (await page('/p/legado.json')).json()).toMatchObject({ contentType: 'product',
      action: { href: '/r/p90?ref=json' }, indexable: false })
    expect(await (await page('/p/legado.md')).text()).toContain('https://site.example.test/r/p90?ref=md')
  })
})
