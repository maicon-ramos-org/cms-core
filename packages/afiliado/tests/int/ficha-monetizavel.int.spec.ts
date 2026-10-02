/** Payload/Postgres reais, REST autenticada e rotas Astro do plugin; banco exclusivo descartável. */
import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cmsCore } from '@maicon-ramos-org/cms-core'
import { sql } from '@payloadcms/db-postgres'
import { getPayload, handleEndpoints, type Payload, type SanitizedConfig } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { afiliado } from '../../src/cms'
import type { FichaMonetizavelDTO } from '../../src/conteudo'
import { getOfertaBySlug, urlMidia } from '../../src/web/lib/cms'
import { fichaDoCatalogo, getCatalogoProduto } from '../../src/web/lib/catalogo'
import { fichaDaOfertaPublica } from '../../src/web/lib/oferta-ficha'
import { ofertaPublicaJson, produtoFisicoPublicoJson } from '../../src/web/lib/publico-json'
import { llms } from '../../src/web/extensao'
import { criaCenario, lexical } from '../fixtures/ficha-integracao/dados'
import { servidorPublico } from '../fixtures/servidor-publico'

// Só a configuração virtual do consumidor é isolada; cmsFetch/readers/adapters não são mocks.
vi.mock('virtual:afiliado/config', () => ({ default: { redesDeRastreio: ['tracking.example.test'] } }))
const semBanco = !process.env.DATABASE_URL
it.runIf(semBanco && process.env.CI)('CI exige Postgres para a ficha monetizável', () => expect(process.env.DATABASE_URL).toBeTruthy())

describe.skipIf(semBanco)('ficha monetizável na REST real do Payload/Postgres', () => {
  let payload: Payload, config: SanitizedConfig, cms: Server | undefined
  let web: Awaited<ReturnType<typeof servidorPublico>> | undefined
  let a: Awaited<ReturnType<typeof criaCenario>>, b: typeof a
  let cmsOrigin: string
  let bancoDescartavel: URL | undefined
  const cacheKey = `ficha-int-${randomUUID()}`
  const readerKey = 'ficha-reader-ab-fixture', keyA = 'ficha-reader-a-fixture', keyB = 'ficha-reader-b-fixture'
  const consultas: URL[] = []
  const leitura = { resolveMidia: urlMidia, ehLinkDeAfiliado: (url: string) => new URL(url).hostname === 'tracking.example.test' }
  const request = (path: string, apiKey = readerKey) => fetch(`${cmsOrigin}/api${path}`, {
    headers: { Authorization: `users API-Key ${apiKey}` }, signal: AbortSignal.timeout(20_000) })
  const page = (path: string, tenant = 'a') => fetch(`${web!.origin}${path}`, {
    headers: { 'x-tenant-fixture': tenant }, signal: AbortSignal.timeout(20_000) })
  const ofertaLida = async (cenario = a, slug = 'ficha') => {
    const oferta = await getOfertaBySlug(cenario.tenant.id, slug)
    return { oferta, ficha: oferta ? fichaDaOfertaPublica(oferta, cenario.tenant, leitura) : null }
  }
  const produtoLido = async (cenario = a, slug = 'ficha') => {
    const catalogo = await getCatalogoProduto(cenario.tenant.id, slug)
    return { catalogo, ficha: catalogo ? fichaDoCatalogo(catalogo, cenario.tenant.id) : null }
  }
  const comum = (ficha: FichaMonetizavelDTO) => ({ name: ficha.editorial.name,
    summary: ficha.editorial.content.summary, descriptionMarkdown: ficha.editorial.content.descriptionMarkdown,
    metaTitle: ficha.editorial.content.metaTitle, metaDescription: ficha.editorial.content.metaDescription,
    highlights: ficha.editorial.content.highlights, faq: ficha.editorial.content.faq })
  const estadoDoBanco = async () => {
    const tabelas = await payload.db.drizzle.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)
    const estado: Record<string, unknown> = {}
    for (const { tablename } of tabelas.rows) {
      const dados = await payload.db.drizzle.execute(sql`SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) AS documentos FROM ${sql.identifier(String(tablename))} t`)
      estado[String(tablename)] = dados.rows[0]?.documentos
    }
    return estado
  }

  beforeAll(async () => {
    const banco = new URL(process.env.DATABASE_URL!)
    // Falha fechado ANTES de inicializar o adapter ou habilitar drop. Nunca conectar a VPS/Neon.
    if (!['postgres:', 'postgresql:'].includes(banco.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(banco.hostname)) throw new Error('Integração exige PostgreSQL local descartável.')
    banco.pathname = `/cms_core_teste_ficha_${randomUUID().replaceAll('-', '').slice(0, 12)}`
    banco.search = ''
    bancoDescartavel = banco
    vi.stubEnv('PAYLOAD_DB_PUSH', '1')
    vi.stubEnv('PAYLOAD_DROP_DATABASE', 'true')
    vi.stubEnv('PAYLOAD_SECRET', 'ficha-fixture-sem-segredo-real')
    vi.stubEnv('REVALIDATE_URL', '')
    vi.stubEnv('AMAZON_TAG', 'exemplo-20')
    vi.stubEnv('CMS_SERVICE_REQUIRED', '0')
    const pasta = mkdtempSync(join(tmpdir(), 'cms-ficha-integracao-'))
    config = await cmsCore({ raiz: pasta, pastaDeMigracoes: pasta, db: { connectionString: banco.toString() },
      plugins: [afiliado({ catalogo: { incluirCategoriasPadrao: false, categoriasAdicionais: [
        { slug: 'equipamento', rotulo: 'Equipamento', atributosDeIdentidade: [] },
      ] } })],
      midia: { r2: { bucket: 'nenhum', endpoint: 'https://bucket.invalid', publicBase: 'https://media.invalid',
        credentials: { accessKeyId: 'teste', secretAccessKey: 'teste' } } } })
    payload = await getPayload({ config, key: cacheKey, disableOnInit: true })
    a = await criaCenario(payload, 'A'); b = await criaCenario(payload, 'B')
    for (const [apiKey, tenants] of [[readerKey, [a.tenant, b.tenant]], [keyA, [a.tenant]], [keyB, [b.tenant]]] as const) {
      await payload.create({ collection: 'users', data: { nome: 'Leitor de teste', email: `${apiKey}@example.test`,
        password: 'senha-fixture', roles: ['sistema'], enableAPIKey: true, apiKey,
        tenants: tenants.map(tenant => ({ tenant: tenant.id })) } as never })
    }
    // Servidor HTTP só de leitura, usando o mesmo handleEndpoints da REST do Payload.
    cms = createServer(async (req, res) => {
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return }
      try {
        const url = new URL(req.url!, 'http://127.0.0.1')
        consultas.push(url)
        const headers = new Headers()
        for (const [name, value] of Object.entries(req.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
        const response = await handleEndpoints({ config, payloadInstanceCacheKey: cacheKey,
          request: new Request(url, { method: 'GET', headers }) })
        res.writeHead(response.status, Object.fromEntries(response.headers))
        res.end(Buffer.from(await response.arrayBuffer()))
      } catch { res.writeHead(500); res.end('Falha na REST de teste.') }
    })
    await new Promise<void>(resolve => cms!.listen(0, '127.0.0.1', resolve))
    const endereco = cms.address()
    if (!endereco || typeof endereco === 'string') throw new Error('Servidor REST de teste sem porta.')
    cmsOrigin = `http://127.0.0.1:${endereco.port}`
    vi.stubEnv('CMS_URL', cmsOrigin)
    vi.stubEnv('CMS_PUBLIC_URL', cmsOrigin)
    vi.stubEnv('CMS_API_KEY', readerKey)
    vi.stubEnv('FICHA_TEST_TENANTS', JSON.stringify([a.tenant, b.tenant]))
    const rota = (grupo: string, nome: string) => fileURLToPath(new URL(`../../src/web/rotas/${grupo}/${nome}`, import.meta.url))
    web = await servidorPublico(new URL('../fixtures/ficha-integracao/', import.meta.url), [
      ...['ofertas', 'p'].flatMap(grupo => [
        { pattern: `/${grupo}/[slug]/`, entrypoint: rota(grupo, '[slug].astro') },
        { pattern: `/${grupo}/[slug].md`, entrypoint: rota(grupo, '[slug].md.ts') },
        { pattern: `/${grupo}/[slug].json`, entrypoint: rota(grupo, '[slug].json.ts') },
      ]),
    ], { cmsReal: true })
  }, 120_000)

  afterAll(async () => {
    await web?.server.stop()
    if (cms) await new Promise<void>((resolve, reject) => cms!.close(error => error ? reject(error) : resolve()))
    if (payload) {
      const nome = bancoDescartavel?.pathname ?? ''
      if (!/^\/cms_core_teste_ficha_[a-f0-9]{12}$/.test(nome)) throw new Error('Cleanup recusado: banco não é a fixture descartável.')
      try { await payload.db.dropDatabase({ adapter: payload.db as never }) } finally { await payload.destroy() }
    }
    vi.unstubAllEnvs()
  }, 30_000)

  it('readers reais fazem queries tenant-scoped e normalizam o mesmo núcleo editorial', async () => {
    consultas.length = 0
    const { oferta, ficha: ofertaDTO } = await ofertaLida()
    const { catalogo, ficha: produtoDTO } = await produtoLido()
    expect(oferta!.id).toBe(a.oferta.id)
    expect(catalogo!.produto.id).toBe(a.produto.id)
    for (const dto of [ofertaDTO!, produtoDTO!]) {
      expect(dto.schema).toBe('monetizable_content/v1')
      expect(dto.identity.tenantId).toBe(String(a.tenant.id))
      expect(dto).toHaveProperty('editorial.content')
      expect(dto).toHaveProperty('monetization.listings')
    }
    expect(comum(ofertaDTO!)).toEqual(comum(produtoDTO!))
    expect(ofertaDTO!.editorial.brand).toBeNull() // a collection legada não tem marca/modelo
    expect(produtoDTO!.editorial.brand).toBe('Fabricante')
    for (const collection of ['ofertas', 'produtos_fisicos', 'variantes_produto', 'ofertas_produto']) {
      const query = consultas.find(url => url.pathname === `/api/${collection}`)!
      expect(query.searchParams.get('where[and][0][tenant][equals]')).toBe(String(a.tenant.id))
    }
    expect(consultas.find(url => url.pathname === '/api/ofertas')!.searchParams.get('depth')).toBe('2')
    expect(consultas.find(url => url.pathname === '/api/produtos_fisicos')!.searchParams.get('depth')).toBe('1')
  })

  it('dados comerciais reais ficam fora de editorial, sem duplicar produto com dois listings', async () => {
    const oferta = (await ofertaLida()).ficha!, { catalogo, ficha } = await produtoLido()
    expect(catalogo!.variantes).toHaveLength(1)
    expect(catalogo!.ofertas).toHaveLength(2)
    expect(ficha!.identity.id).toBe(String(a.produto.id))
    expect(ficha!.monetization.listings.map(o => o.id).sort()).toEqual(a.listings.map(o => String(o.id)).sort())
    expect(new Set(ficha!.monetization.listings.map(o => o.variantId))).toEqual(new Set([String(a.variante.id)]))
    expect(oferta.monetization.listings[0]).toMatchObject({ price: { amount: '49.90', currency: 'BRL' },
      seller: { name: 'Loja A' }, coupon: { code: null }, observedAt: '2026-09-26T10:00:00.000Z' })
    for (const dto of [oferta, ficha!]) {
      expect(JSON.stringify(dto.editorial)).not.toMatch(/CUPOM10|seller-|49\.90|2026-09-26|tracking\.example|amazon\.com|coupon|affiliateUrl/)
    }
    const json = produtoFisicoPublicoJson(a.tenant, catalogo!.produto, catalogo!.ofertas, ficha)
    expect(json!.offers).toHaveLength(2)
    expect(json!.price).toBeNull() // este leitor não publica preço físico nem inventa Offer
    const response = await page('/p/ficha/'), html = await response.text()
    expect(response.status).toBe(200)
    expect(html.match(/<h1(?:\s[^>]*)?>/g)).toHaveLength(1)
    for (const listing of a.listings) expect(html).toContain(listing.url_afiliado.replaceAll('&', '&amp;'))
  })

  it('lifetime persiste e preserva campos, apresentação e CTA específicos', async () => {
    const { oferta, ficha } = await ofertaLida(a, 'lifetime')
    expect(oferta!.dados).toMatchObject(a.lifetime.dados)
    expect(ficha!).toMatchObject({ kind: 'software', editorial: { content: {
      subjectName: 'Aplicativo A', introTitle: 'Introdução documentada', tagline: 'Uso do aplicativo',
      features: [{ title: 'Recurso editorial', description: 'Descrição do recurso.' }], verdict: 'Veredito documentado.',
    } }, monetization: { listings: [{ price: { amount: '29.00', currency: 'USD', billingCycle: 'unico' },
      previousPrice: { amount: '144.00', currency: 'USD' }, promotion: { paymentLabel: 'Pagamento único', badges: ['Acesso vitalício'] } }] } })
    const response = await page('/ofertas/lifetime/'), html = await response.text()
    expect(response.status).toBe(200)
    for (const text of ['preco-lifetime', 'Pagamento único', 'Acesso vitalício', 'Recurso editorial', 'Veredito documentado.',
      `/r/o${a.lifetime.id}`]) expect(html).toContain(text)
    expect(await (await page('/ofertas/lifetime.json')).json()).toMatchObject({ offerType: 'lifetime', price: { billingCycle: 'unico' } })
  }, 20_000)

  it('cupom literal permanece no Payload, mas nunca na ficha ou projeção pública', async () => {
    const { oferta, ficha } = await ofertaLida()
    expect(typeof oferta!.cupom).toBe('object')
    expect((oferta!.cupom as { codigo: string }).codigo).toBe(a.codigo)
    const json = ofertaPublicaJson(a.tenant, oferta!, '/ofertas/ficha/', ficha)
    expect(json!.coupon).not.toBeNull()
    expect(JSON.stringify(ficha)).not.toContain(a.codigo)
    expect(JSON.stringify(json)).not.toContain(a.codigo)
    for (const suffix of ['/', '.json', '.md']) {
      const response = await page(`/ofertas/ficha${suffix}`)
      expect(response.status).toBe(200)
      expect(await response.text()).not.toContain(a.codigo)
    }
  })

  it('isola tenants mesmo quando a identidade SSR pode ler A e B', async () => {
    const ofertaA = await ofertaLida(), ofertaB = await ofertaLida(b)
    const produtoA = await produtoLido(), produtoB = await produtoLido(b)
    expect(ofertaA.ficha!.identity.id).not.toBe(ofertaB.ficha!.identity.id)
    expect(produtoA.ficha!.identity.id).not.toBe(produtoB.ficha!.identity.id)
    expect(produtoA.ficha!.monetization.listings.map(o => o.id)).not.toEqual(produtoB.ficha!.monetization.listings.map(o => o.id))
    expect(fichaDaOfertaPublica(ofertaB.oferta!, a.tenant, leitura)).toBeNull()
    expect(fichaDoCatalogo(produtoB.catalogo!, a.tenant.id)).toBeNull()
    for (const grupo of ['ofertas', 'p']) {
      for (const suffix of ['/', '.md', '.json']) {
        const response = await page(`/${grupo}/ficha${suffix}`), text = await response.text()
        expect(response.status).toBe(200)
        expect(text).toContain('Ficha documentada A')
        expect(text).not.toContain('Ficha documentada B')
        for (const listing of b.listings) expect(text).not.toContain(listing.external_listing_id)
      }
    }
    const jsonB = await (await page('/p/ficha.json', 'b')).json()
    expect(jsonB.title).toBe('Ficha documentada B')
    expect(jsonB.offers.map((o: { href: string }) => o.href).sort()).toEqual(b.listings.map(o => o.url_afiliado).sort())
    expect(await getOfertaBySlug(a.tenant.id, 'exclusiva-b')).toBeNull()
  })

  it('a REST recusa IDs de B à identidade A e vice-versa, incluindo listings', async () => {
    for (const [cenario, apiKey] of [[b, keyA], [a, keyB]] as const) {
      for (const [collection, doc] of [['ofertas', cenario.oferta], ['produtos_fisicos', cenario.produto],
        ['variantes_produto', cenario.variante], ['ofertas_produto', cenario.listings[0]]] as const) {
        expect((await request(`/${collection}/${doc.id}`, apiKey)).status).toBe(404)
      }
      const docs = await (await request(`/ofertas_produto?where[tenant][equals]=${cenario.tenant.id}`, apiKey)).json()
      expect(docs.docs).toEqual([])
    }
  })

  it('inexistentes e conteúdo exclusivo do outro tenant retornam null/404 nos três formatos', async () => {
    expect((await ofertaLida(a, 'inexistente')).ficha).toBeNull()
    expect((await produtoLido(a, 'inexistente')).ficha).toBeNull()
    expect((await request('/ofertas/2147483647')).status).toBe(404)
    for (const path of ['/ofertas/inexistente', '/p/inexistente', '/ofertas/exclusiva-b']) {
      for (const suffix of ['/', '.md', '.json']) expect((await page(`${path}${suffix}`)).status).toBe(404)
    }
  })

  it('índice llms usa metadados reais públicos, canonical/Markdown e isolamento sem carregar comércio', async () => {
    await payload.create({ collection: 'ofertas', data: { tenant: a.tenant.id, loja: a.loja.id,
      titulo: 'Oferta draft do índice', slug: 'draft-indice', tipo: 'credito', corpo: lexical('Rascunho'),
      origem: 'fixture:A:draft-indice', _status: 'draft' } as never })
    await payload.create({ collection: 'produtos_fisicos', data: { tenant: a.tenant.id, nome: 'Produto noindex do índice',
      slug: 'noindex-indice', marca: 'Fabricante', modelo: 'M2', categoria: 'equipamento', estado: 'published', indexavel: false } as never })
    consultas.length = 0
    const resultado = await llms(a.tenant, 'https://preview.example.test')
    expect(resultado.secoes).toEqual([{ titulo: 'Fichas monetizáveis', linhas: [
      '- [Ficha documentada A](https://a.example.test/ofertas/ficha/) — [Markdown](https://a.example.test/ofertas/ficha.md)',
      '- [Software vitalício A](https://a.example.test/ofertas/lifetime/) — [Markdown](https://a.example.test/ofertas/lifetime.md)',
      '- [Ficha documentada A](https://a.example.test/p/ficha/) — [Markdown](https://a.example.test/p/ficha.md)',
    ] }])
    const texto = JSON.stringify(resultado)
    expect(texto).not.toMatch(/draft-indice|noindex-indice|documentada B|vitalício B|exclusiva-b|Loja A|amazon\.com|tracking|49\.90|Pagamento único/)
    expect(texto).not.toContain(a.codigo)
    expect(consultas.map(url => url.pathname).sort()).toEqual(['/api/ofertas', '/api/produtos_fisicos'])
    for (const url of consultas) {
      expect(url.searchParams.get('depth')).toBe('0')
      expect(url.searchParams.get('where[and][0][tenant][equals]')).toBe(String(a.tenant.id))
      for (const field of ['preco', 'cupom', 'loja', 'corpo', 'dados']) expect(url.searchParams.has(`select[${field}]`)).toBe(false)
    }
  })

  it('índice llms pagina mais de 100 produtos no Payload real sem truncar ou duplicar entradas', async () => {
    for (let i = 0; i < 101; i++) await payload.create({ collection: 'produtos_fisicos', data: {
      tenant: a.tenant.id, nome: `Produto do índice ${i}`, slug: `indice-${i}`, marca: 'Fabricante', modelo: `Indice-${i}`,
      categoria: 'equipamento', estado: 'published', indexavel: true,
    } as never })
    consultas.length = 0
    const resultado = await llms(a.tenant, 'https://a.example.test'), linhas = resultado.secoes![0]!.linhas
    expect(linhas).toHaveLength(104) // 102 físicos indexáveis + 2 ofertas, sem draft/noindex ou tenant B
    expect(new Set(linhas).size).toBe(104)
    expect(linhas.some(linha => linha.includes('/p/indice-100/'))).toBe(true)
    const paginas = consultas.filter(url => url.pathname === '/api/produtos_fisicos')
    expect(paginas.map(url => url.searchParams.get('page'))).toEqual(['1', '2'])
    for (const url of paginas) expect(url.searchParams.get('where[and][0][tenant][equals]')).toBe(String(a.tenant.id))
    expect(await llms(a.tenant, 'https://a.example.test')).toEqual(resultado)
  }, 30_000)

  it('repetir readers e renderização não cria, duplica ou altera nenhum documento/tabela/versão', async () => {
    const antes = await estadoDoBanco()
    const primeira = { oferta: await ofertaLida(), produto: await produtoLido() }
    const primeiroIndice = await llms(a.tenant, 'https://a.example.test')
    for (let i = 0; i < 2; i++) {
      expect({ oferta: await ofertaLida(), produto: await produtoLido() }).toEqual(primeira)
      expect(await llms(a.tenant, 'https://a.example.test')).toEqual(primeiroIndice)
      for (const grupo of ['ofertas', 'p']) for (const suffix of ['/', '.md', '.json']) {
        expect((await page(`/${grupo}/ficha${suffix}`)).status).toBe(200)
      }
      expect((await page('/ofertas/lifetime/')).status).toBe(200)
    }
    expect(await estadoDoBanco()).toEqual(antes)
  }, 30_000)
})
