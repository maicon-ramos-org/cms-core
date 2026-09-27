import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { auditarPaginaPublica } from '../src/index.mjs'

const canonical = 'https://site.example/artigo/'
const responses = () => new Map([
  [canonical, new Response(`<!doctype html><html><head>
    <link rel="canonical" href="${canonical}">
    <link rel="alternate" type="text/markdown" href="/artigo.md">
    <link rel="alternate" type="application/json" href="/artigo.json">
    <script type="application/ld+json">{"@context":"https://schema.org"}</script>
    </head><body><main><h1><span>Artigo</span></h1><p>Conteúdo.</p></main></body></html>`,
  { headers: { 'content-type': 'text/html; charset=utf-8' } })],
  ['https://site.example/artigo.md', new Response(`# Artigo\n\nCanonical: ${canonical}\n\nConteúdo.`,
    { headers: { 'content-type': 'text/markdown; charset=utf-8',
      'x-robots-tag': 'noindex', link: `<${canonical}>; rel="canonical"` } })],
  ['https://site.example/artigo.json', Response.json({ url: canonical, slug: 'artigo',
    contentType: 'artigo', title: 'Artigo' }, { headers: { 'x-robots-tag': 'noindex',
      link: `<${canonical}>; rel="canonical"` } })],
  ['https://site.example/llms.txt', new Response('# Site\n\n> Publicações.',
    { headers: { 'content-type': 'text/plain; charset=utf-8' } })],
])

/** @param {Map<string, Response>} mapa */
const fetcher = mapa => async (entrada, init) => {
  assert.equal(init?.method, 'GET')
  assert.equal(init?.redirect, 'manual')
  assert.equal(init?.credentials, 'omit')
  const url = String(entrada)
  assert.ok(!url.includes('/ofertas/') && !url.includes('/r/'), 'nunca segue redirect comercial')
  return mapa.get(url)?.clone() ?? new Response(null, { status: 404 })
}

describe('contrato público compartilhado', () => {
  it('aceita HTML, Markdown, JSON e llms.txt da mesma publicação', async () => {
    assert.deepEqual(await auditarPaginaPublica(canonical, { fetcher: fetcher(responses()) }),
      { url: canonical, ok: true, falhas: [] })
  })

  it('recusa URLs comerciais ou não canônicas antes de fazer GET', async () => {
    let chamadas = 0
    const simula = async () => { chamadas++; return new Response(null) }
    for (const url of ['https://site.example/ofertas/x/', 'https://site.example/r/o3/',
      'http://site.example/artigo/', 'https://site.example/artigo/?utm=x',
      'https://user:secret@site.example/artigo/']) {
      const resultado = await auditarPaginaPublica(url, { fetcher: simula })
      assert.equal(resultado.ok, false)
      assert.equal(resultado.falhas[0]?.codigo, 'URL_INVALIDA')
      assert.equal(resultado.url, '[URL_INVALIDA]')
    }
    assert.equal(chamadas, 0)
  })

  it('aponta divergências sem expor corpo, URL de afiliado ou credencial', async () => {
    const mapa = responses()
    mapa.set('https://site.example/artigo.json', Response.json({ url: canonical,
      slug: 'artigo', contentType: 'artigo', title: 'Artigo',
      dados: { oferta: { url_afiliado: 'https://loja.example/segredo' } } }))
    mapa.set('https://site.example/llms.txt', new Response(null, { status: 503 }))
    const resultado = await auditarPaginaPublica(canonical, { fetcher: fetcher(mapa) })
    assert.equal(resultado.ok, false)
    assert.deepEqual(resultado.falhas.map(f => f.codigo),
      ['NOINDEX_AUSENTE', 'HEADER_CANONICAL_INVALIDO', 'CAMPO_PRIVADO_EXPOSTO', 'HTTP_503'])
    assert.ok(!JSON.stringify(resultado).includes('loja.example'))
  })

  it('reprova alternate quebrado, canonical divergente e corpo grande', async () => {
    const mapa = responses()
    mapa.set(canonical, new Response('<main><h1>Artigo</h1></main>',
      { headers: { 'content-type': 'text/html' } }))
    mapa.set('https://site.example/artigo.md', new Response('x'.repeat(30),
      { headers: { 'content-type': 'text/markdown' } }))
    const resultado = await auditarPaginaPublica(canonical, { fetcher: fetcher(mapa), maxBytes: 25 })
    assert.equal(resultado.ok, false)
    assert.ok(resultado.falhas.some(f => f.codigo === 'CORPO_INVALIDO_OU_GRANDE'))
  })

  it('reprova 404, MIME errado, JSON-LD inválido e ausência de noindex', async () => {
    const mapa = responses()
    mapa.set(canonical, new Response(`<!doctype html><main><h1>Artigo</h1></main>
      <link rel="canonical" href="${canonical}">
      <link rel="alternate" type="text/markdown" href="/artigo.md">
      <link rel="alternate" type="application/json" href="/artigo.json">
      <script type="application/ld+json">{quebrado}</script>`,
    { headers: { 'content-type': 'text/html', 'x-robots-tag': 'noindex' } }))
    mapa.set('https://site.example/artigo.md', new Response('# Artigo',
      { headers: { 'content-type': 'text/plain', link: `<${canonical}>; rel="canonical"` } }))
    mapa.set('https://site.example/artigo.json', new Response(null, { status: 404 }))
    const resultado = await auditarPaginaPublica(canonical, { fetcher: fetcher(mapa) })
    assert.deepEqual(resultado.falhas.map(f => f.codigo), [
      'JSON_LD_INVALIDO', 'HTML_NOINDEX', 'MIME_INVALIDO', 'NOINDEX_AUSENTE',
      'HTTP_404', 'TEXTO_OU_CANONICAL_AUSENTE',
    ])
  })
})
