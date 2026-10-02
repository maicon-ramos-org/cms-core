import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { graph, jsonScript, servidorPublico } from './fixtures/servidor-publico'

const fixture = new URL('./fixtures/oferta/', import.meta.url)
const routePath = (name: string) => fileURLToPath(new URL(`../src/web/rotas/ofertas/${name}`, import.meta.url))
let server: Awaited<ReturnType<typeof servidorPublico>>['server'] | undefined
let origin: string
const page = (path: string) => fetch(`${origin}${path}`, { signal: AbortSignal.timeout(20_000) })

beforeAll(async () => {
  const result = await servidorPublico(fixture, ['ofertas', 'apps'].flatMap(pasta => [
    { pattern: `/${pasta}/[slug]/`, entrypoint: routePath('[slug].astro') },
    { pattern: `/${pasta}/[slug].json`, entrypoint: routePath('[slug].json.ts') },
    { pattern: `/${pasta}/[slug].md`, entrypoint: routePath('[slug].md.ts') },
  ]))
  server = result.server
  origin = result.origin
}, 30_000)
afterAll(async () => { await server?.stop() })

describe('HTML real da oferta com dados isolados', () => {
  it('mantém oferta comum, metadados, ordem do layout e CTAs', async () => {
    const response = await page('/ofertas/normal/'), html = await response.text()
    expect(response.status, html.slice(0, 250)).toBe(200)
    expect(html).toContain('<title>Título SEO original</title>')
    expect(html).toContain('content="Descrição original aprovada."')
    expect(html).toContain('href="https://site.example.test/ofertas/normal/"')
    expect(html).toContain('href="/ofertas/normal.md"')
    expect(html).toContain('href="/ofertas/normal.json"')
    expect(html).toMatch(/href="\/r\/o4\?ref=oferta"[^>]*rel="sponsored nofollow"/)
    expect(html).toContain('href="/r/o4?ref=barra"')
    expect(html).toContain('/mês')
    expect(html).toContain('<strong>Conteúdo com formatação.</strong>')
    expect(html.indexOf('class="topo"')).toBeLessThan(html.indexOf('class="lateral"'))
    expect(html.indexOf('class="lateral"')).toBeLessThan(html.indexOf('class="conteudo"'))
    expect(html).not.toContain('class="grade-destaques"')
    expect(html).not.toContain('class="pros-contras"')
    expect(graph(html)[0]).toMatchObject({ name: 'Software de exemplo', offers: { price: 29, priceCurrency: 'BRL' } })
  }, 20_000)
  it('mantém lifetime, descontos, FAQ, prós/contras e revelação sem o literal do cupom', async () => {
    const response = await page('/apps/lifetime/'), html = await response.text()
    expect(response.status).toBe(200)
    for (const text of ['grade-destaques', 'Veredito editorial.', 'Como funciona?', 'Ponto a favor', 'Limitação',
      'LO10', 'até 27% no total']) expect(html.includes(text), text).toBe(true)
    expect(html).toContain('href="/r/c3?ref=codigo"')
    expect(html).toContain('data-cupom="3"')
    expect(html).toContain('href="/r/c3?ref=revelado"')
    expect(html).toContain('href="/apps/lifetime.md"')
    expect(html).toContain('href="/apps/lifetime.json"')
    expect(jsonScript(html, 'ferramentas-fixture')).toMatchObject({ md: '/apps/lifetime.md', ofertaId: '4', cupomId: '3' })
    for (const forbidden of ['EXEMPLO10', 'tracking.example.test', 'merchant.example.test', 'availabilityStarts', 'InStock']) expect(html).not.toContain(forbidden)
    expect(graph(html)[0]).toMatchObject({ offers: { price: 29, priceCurrency: 'USD' } })
  })
  it('lifetime sem cupom conserva preço anterior, pagamento, selos e CTA da oferta', async () => {
    const response = await page('/apps/lifetime-sem-cupom/'), html = await response.text()
    expect(response.status).toBe(200)
    for (const text of ['Pagamento único', 'Acesso vitalício', '144,00', 'Pegar o Software por',
      'href="/r/o4?ref=oferta"', 'href="/r/o4?ref=barra"']) expect(html.includes(text), text).toBe(true)
    expect(html).not.toContain('data-cupom=')
  })
  it('sem preço conserva o conteúdo e o CTA, mas não inventa Offer', async () => {
    const response = await page('/ofertas/sem-preco/'), html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain('Análise editorial aprovada.')
    expect(html).toContain('href="/r/c3?ref=codigo"')
    expect(graph(html)[0]).not.toHaveProperty('offers')
    expect(jsonScript(html, 'ferramentas-fixture').oferta.preco).toBeNull()
  })
  it('oferta sem editorial mantém o fallback, sem fabricar corpo ou impor FAQ', async () => {
    const response = await page('/ofertas/vazia/'), html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain('Oferta vazia — oferta verificada no Site.')
    expect(html).not.toContain('Análise editorial aprovada.')
    expect(html).not.toContain('class="faq-lt"')
    expect(graph(html)[0]).not.toHaveProperty('offers')
  })
  it('JSON e Markdown da mesma oferta preservam caminhos e proteção comercial', async () => {
    const json = await (await page('/apps/lifetime.json')).json()
    const md = await (await page('/apps/lifetime.md')).text()
    expect(json).toMatchObject({ url: 'https://site.example.test/apps/lifetime/', title: 'Software de exemplo',
      price: { value: 29, currency: 'USD' }, action: { href: '/r/o4?ref=json' } })
    expect(md).toContain('https://site.example.test/r/o4?ref=md')
    expect(md).toContain('Análise editorial aprovada.')
    expect(md).toContain('Prós e contras')
    expect(`${JSON.stringify(json)}${md}`).not.toMatch(/EXEMPLO10|tracking\.example\.test|merchant\.example\.test/)
  })
  it.each(['outro-tenant', 'rascunho'])('HTML/JSON/Markdown recusam %s', async slug => {
    for (const suffix of ['/', '.json', '.md']) {
      const response = await page(`/ofertas/${slug}${suffix}`)
      expect(response.status).toBe(404)
      expect(await response.text()).not.toContain('Análise editorial aprovada.')
    }
  })
})
