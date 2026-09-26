import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => {
  const nomes = ['REST_GET', 'REST_POST', 'REST_DELETE', 'REST_PATCH', 'REST_PUT', 'REST_OPTIONS', 'GRAPHQL_POST', 'GRAPHQL_PLAYGROUND_GET']
  return {
    config: { custom: { siteReader: { ativo: true } }, cookiePrefix: 'payload', routes: { api: '/api' } },
    getPayload: vi.fn(),
    auth: vi.fn(),
    headers: vi.fn(),
    notFound: vi.fn(() => { throw new Error('NEXT_HTTP_ERROR_FALLBACK;404') }),
    layout: vi.fn(({ children }: { children: unknown }) => children),
    page: vi.fn(async () => 'pagina nativa'),
    metadata: vi.fn(async () => ({ title: 'metadata nativa' })),
    serverFunction: vi.fn(async () => 'resultado nativo'),
    nativos: Object.fromEntries(nomes.map(nome => [nome, vi.fn(async (_request: Request, ..._args: unknown[]) => new Response(nome))])),
  }
})

vi.mock('@payload-config', () => ({ default: mock.config }))
// O export público e o transporte são reais; só auth e os limites Next/Payload são simulados.
vi.mock('payload', () => ({ getPayload: mock.getPayload, executeAuthStrategies: mock.auth }))
vi.mock('@payloadcms/next/routes', () => Object.fromEntries(Object.entries(mock.nativos).map(([nome, handler]) => [nome, () => handler])))
vi.mock('@payloadcms/next/layouts', () => ({ RootLayout: mock.layout, handleServerFunctions: mock.serverFunction }))
vi.mock('@payloadcms/next/views', () => ({ RootPage: mock.page, generatePageMetadata: mock.metadata }))
vi.mock('@payloadcms/next/css', () => ({}))
vi.mock('../src/app/(payload)/custom.scss', () => ({}))
vi.mock('../src/app/(payload)/admin/importMap.js', () => ({ importMap: {} }))
vi.mock('next/headers', () => ({ headers: mock.headers }))
vi.mock('next/navigation', () => ({ notFound: mock.notFound }))

import * as rest from '../src/app/(payload)/api/[...slug]/route'
import * as graphql from '../src/app/(payload)/api/graphql/route'
import * as playground from '../src/app/(payload)/api/graphql-playground/route'
import Layout from '../src/app/(payload)/layout'
import Page, { generateMetadata } from '../src/app/(payload)/admin/[[...segments]]/page'

const reader = { id: 1, collection: 'users', roles: ['site-reader'], tenants: [{ tenant: 1 }], _strategy: 'api-key', enableAPIKey: true }
const credencial = { authorization: 'users API-Key fixture-nao-real' }
const contexto = (slug: string[]) => ({ params: Promise.resolve({ slug }) })
const metodos = ['GET', 'POST', 'DELETE', 'PATCH', 'PUT', 'OPTIONS'] as const

beforeEach(() => {
  vi.clearAllMocks()
  mock.config.custom.siteReader.ativo = true
  mock.getPayload.mockResolvedValue({})
  mock.auth.mockResolvedValue({ user: reader })
  mock.headers.mockResolvedValue(new Headers(credencial))
})

describe('integração das rotas Next com o guard site-reader', () => {
  it('REST_GET/POST nativos mantêm o override do editor e bloqueiam reader antes dele, sem DB', async () => {
    // Processo ESM separado: usa Payload/Next reais, sem os mocks de wiring deste arquivo.
    const { stdout } = await promisify(execFile)(process.execPath, ['--import', 'tsx/esm', '--input-type=module', '--eval', `
      import assert from 'node:assert/strict'
      import { buildConfig, getPayload } from 'payload'
      import { postgresAdapter } from '@payloadcms/db-postgres'
      import { REST_GET, REST_POST } from '@payloadcms/next/routes'
      import { protegerTransporteSiteReader } from '@maicon-ramos-org/cms-core/site-reader'
      let chamadas = 0
      const config = await buildConfig({
        secret: 'fixture-only-sem-credencial-real', telemetry: false,
        db: postgresAdapter({ pool: { connectionString: 'postgres://fixture:fixture@127.0.0.1:1/fixture' }, push: false }),
        admin: { disable: true },
        collections: [{ slug: 'users', auth: { useAPIKey: true }, fields: [] }],
        custom: { siteReader: { ativo: true } },
        endpoints: [{ path: '/native-smoke', method: 'get', handler: async req => {
          chamadas += 1
          return Response.json({ method: req.method, role: req.user?.roles?.[0] })
        } }],
      })
      const payload = await getPayload({ config, disableDBConnect: true, disableOnInit: true })
      let papel = 'site-reader'
      payload.find = async () => ({ docs: [{ id: 1, roles: [papel], tenants: [{ tenant: 1 }], enableAPIKey: true }],
        totalDocs: 1, limit: 1, totalPages: 1, page: 1, pagingCounter: 1, hasPrevPage: false, hasNextPage: false, prevPage: null, nextPage: null })
      const headers = { authorization: 'users API-Key fixture-nao-real' }
      const ctx = slug => ({ params: Promise.resolve({ slug }) })
      const get = protegerTransporteSiteReader({ config, superficie: 'rest', handler: REST_GET(config) })
      const post = protegerTransporteSiteReader({ config, superficie: 'rest', handler: REST_POST(config) })
      assert.equal((await get(new Request('https://cms.example.test/api/native-smoke', { headers }), ctx(['native-smoke']))).status, 403)
      assert.equal(chamadas, 0)
      for (const header of ['X-HTTP-Method-Override', 'X-Payload-HTTP-Method-Override']) {
        const request = new Request('https://cms.example.test/api/editorial/identity-v1', {
          method: 'POST', headers: { ...headers, [header]: 'GET', 'Content-Type': 'application/json' }, body: '{' })
        assert.equal((await post(request, ctx(['editorial', 'identity-v1']))).status, 405)
        assert.equal(request.bodyUsed, false)
      }
      const identity = await get(new Request('https://cms.example.test/api/editorial/identity-v1', { headers }), ctx(['editorial', 'identity-v1']))
      assert.deepEqual(await identity.json(), { versao: 1, papel: 'site-reader', tenantId: '1' })
      papel = 'editor'
      const normal = new Request('https://cms.example.test/api/native-smoke', { method: 'POST',
        headers: { ...headers, 'X-HTTP-Method-Override': 'GET', 'Content-Type': 'application/json' }, body: '{}' })
      const response = await post(normal, ctx(['native-smoke']))
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { method: 'GET', role: 'editor' })
      assert.equal(chamadas, 1)
      console.log('native-rest-ok')
    `], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, NODE_ENV: 'test', PAYLOAD_DISABLE_DEPENDENCY_CHECKER: 'true', DISABLE_PAYLOAD_HMR: 'true' },
      timeout: 20_000,
    })
    expect(stdout).toContain('native-rest-ok')
  }, 25_000)

  it.each(metodos)('REST %s impede reader antes do handler nativo', async method => {
    const request = new Request('https://cms.example.test/api/posts', { method, headers: credencial })
    expect((await rest[method](request, contexto(['posts']))).status).toBe(403)
    expect(mock.nativos[`REST_${method}`]).not.toHaveBeenCalled()
  })

  it.each(metodos)('default-off preserva REST %s e o mesmo Request/contexto', async method => {
    mock.config.custom.siteReader.ativo = false
    const request = new Request('https://cms.example.test/api/posts', { method, headers: credencial })
    const ctx = contexto(['posts'])
    expect(await (await rest[method](request, ctx)).text()).toBe(`REST_${method}`)
    expect(mock.nativos[`REST_${method}`]).toHaveBeenCalledWith(request, ctx)
    expect(mock.getPayload).not.toHaveBeenCalled()
    expect(mock.auth).not.toHaveBeenCalled()
  })

  it.each(['X-HTTP-Method-Override', 'X-Payload-HTTP-Method-Override'])('POST com %s não alcança a conversão nativa', async header => {
    const request = new Request('https://cms.example.test/api/editorial/identity-v1', {
      method: 'POST', headers: { ...credencial, [header]: 'GET', 'Content-Type': 'application/json' }, body: '{',
    })
    expect((await rest.POST(request, contexto(['editorial', 'identity-v1']))).status).toBe(405)
    expect(request.bodyUsed).toBe(false)
    expect(mock.nativos.REST_POST).not.toHaveBeenCalled()
  })

  it('GET identity devolve DTO mínimo e rejeita params.slug divergente', async () => {
    const request = () => new Request('https://cms.example.test/api/editorial/identity-v1', { headers: credencial })
    const response = await rest.GET(request(), contexto(['editorial', 'identity-v1']))
    expect(await response.json()).toEqual({ versao: 1, papel: 'site-reader', tenantId: '1' })
    expect((await rest.GET(request(), contexto(['payload-jobs', 'run']))).status).toBe(403)
    expect(mock.nativos.REST_GET).not.toHaveBeenCalled()
  })

  it.each(['POST', 'OPTIONS'] as const)('GraphQL %s bloqueia reader antes do handler e do corpo', async method => {
    const request = new Request('https://cms.example.test/api/graphql', {
      method, headers: credencial, ...(method === 'POST' ? { body: '{' } : {}),
    })
    const response = method === 'POST' ? await graphql.POST(request) : await graphql.OPTIONS(request, contexto(['graphql']))
    expect(response.status).toBe(403)
    expect(request.bodyUsed).toBe(false)
    expect(mock.nativos.GRAPHQL_POST).not.toHaveBeenCalled()
    expect(mock.nativos.REST_OPTIONS).not.toHaveBeenCalled()
  })

  it('playground bloqueia reader antes de renderizar', async () => {
    const response = await playground.GET(new Request('https://cms.example.test/api/graphql-playground', { headers: credencial }))
    expect(response.status).toBe(403)
    expect(mock.nativos.GRAPHQL_PLAYGROUND_GET).not.toHaveBeenCalled()
  })

  it('GraphQL e playground preservam os handlers nativos com opt-in desligado', async () => {
    mock.config.custom.siteReader.ativo = false
    const request = new Request('https://cms.example.test/api/graphql', { method: 'POST', headers: credencial })
    const options = new Request(request.url, { method: 'OPTIONS', headers: credencial })
    const ctx = contexto(['graphql'])
    expect(await (await graphql.POST(request)).text()).toBe('GRAPHQL_POST')
    expect(await (await graphql.OPTIONS(options, ctx)).text()).toBe('REST_OPTIONS')
    const get = new Request('https://cms.example.test/api/graphql-playground', { headers: credencial })
    expect(await (await playground.GET(get)).text()).toBe('GRAPHQL_PLAYGROUND_GET')
    expect(mock.nativos.GRAPHQL_POST).toHaveBeenCalledWith(request)
    expect(mock.nativos.REST_OPTIONS).toHaveBeenCalledWith(options, ctx)
    expect(mock.nativos.GRAPHQL_PLAYGROUND_GET).toHaveBeenCalledWith(get)
    expect(mock.auth).not.toHaveBeenCalled()
  })

  it.each(['editor', 'anonimo'])('preserva o REST existente para %s', async principal => {
    if (principal === 'editor') mock.auth.mockResolvedValue({ user: { id: 2, collection: 'users', roles: ['editor'] } })
    const request = new Request('https://cms.example.test/api/posts', { headers: principal === 'editor' ? credencial : {} })
    expect(await (await rest.GET(request, contexto(['posts']))).text()).toBe('REST_GET')
    expect(mock.nativos.REST_GET).toHaveBeenCalledOnce()
    if (principal === 'anonimo') expect(mock.auth).not.toHaveBeenCalled()
  })
})

describe('admin Next e server actions', () => {
  it.each([[], ['login'], ['custom-view'], ['collections', 'posts', '1']].map(segments => ({ segments })))('página e metadata de $segments bloqueiam reader sem depender do layout', async ({ segments }) => {
    const args = { params: Promise.resolve({ segments }), searchParams: Promise.resolve({}) }
    await expect(Page(args)).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
    await expect(generateMetadata(args)).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
    expect(mock.page).not.toHaveBeenCalled()
    expect(mock.metadata).not.toHaveBeenCalled()
    expect(mock.layout).not.toHaveBeenCalled()
  })

  it('reader não chega a RootLayout nem ao provider que serializa usuário', async () => {
    await expect(Layout({ children: 'conteudo' })).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
    expect(mock.notFound).toHaveBeenCalledOnce()
    expect(mock.layout).not.toHaveBeenCalled()
    expect(mock.serverFunction).not.toHaveBeenCalled()
  })

  it('server action revalida os headers atuais antes de handleServerFunctions', async () => {
    mock.headers.mockResolvedValue(new Headers())
    const tree = await Layout({ children: 'conteudo' })
    mock.headers.mockResolvedValue(new Headers(credencial))
    await expect(tree.props.serverFunction({ name: 'form-state', args: {} })).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
    expect(mock.auth).toHaveBeenCalledOnce()
    expect(mock.serverFunction).not.toHaveBeenCalled()
  })

  it.each(['editor', 'anonimo', 'default-off'])('preserva layout e server action para %s', async principal => {
    if (principal === 'editor') mock.auth.mockResolvedValue({ user: { id: 2, collection: 'users', roles: ['editor'] } })
    if (principal === 'anonimo') mock.headers.mockResolvedValue(new Headers())
    if (principal === 'default-off') mock.config.custom.siteReader.ativo = false
    const tree = await Layout({ children: 'conteudo' })
    expect(renderToStaticMarkup(tree)).toBe('conteudo')
    expect(mock.layout).toHaveBeenCalledOnce()
    const args = { name: 'form-state', args: {} }
    expect(await tree.props.serverFunction(args)).toBe('resultado nativo')
    expect(mock.serverFunction).toHaveBeenCalledWith({ ...args, config: mock.config, importMap: {} })
    const pageArgs = { params: Promise.resolve({ segments: ['login'] }), searchParams: Promise.resolve({}) }
    expect(await Page(pageArgs)).toBe('pagina nativa')
    expect(await generateMetadata(pageArgs)).toEqual({ title: 'metadata nativa' })
    expect(mock.page).toHaveBeenCalledWith({ ...pageArgs, config: mock.config, importMap: {} })
    expect(mock.metadata).toHaveBeenCalledWith({ ...pageArgs, config: mock.config })
    expect(mock.notFound).not.toHaveBeenCalled()
    if (principal !== 'editor') expect(mock.auth).not.toHaveBeenCalled()
  })
})
