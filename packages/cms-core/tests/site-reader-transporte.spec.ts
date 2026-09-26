import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SanitizedConfig } from 'payload'
import { protegerTransporteSiteReader, leitorNoPreflightSiteReader } from '../src/site-reader/transporte'

const mock = vi.hoisted(() => ({ payload: {}, getPayload: vi.fn(), auth: vi.fn() }))
vi.mock('payload', () => ({ getPayload: mock.getPayload, executeAuthStrategies: mock.auth }))
const config = { custom: { siteReader: { ativo: true } }, cookiePrefix: 'payload', routes: { api: '/api' } } as unknown as SanitizedConfig
const reader = { id: 1, collection: 'users', roles: ['site-reader'], tenants: [{ tenant: 1 }], _strategy: 'api-key', enableAPIKey: true }
const key = { authorization: 'users API-Key fixture-nao-real' }
const identity = 'https://cms.example.test/api/editorial/identity-v1'

beforeEach(() => {
  vi.resetAllMocks()
  mock.getPayload.mockResolvedValue(mock.payload)
  mock.auth.mockResolvedValue({ user: reader })
})

describe('spike: Request original e preflight sem lookup anônimo', () => {
  it('default-off delega o MESMO Request/contexto, sem inicializar Payload nem autenticar', async () => {
    const handler = vi.fn(async (_request: Request, ..._args: unknown[]) => new Response('default'))
    const guard = protegerTransporteSiteReader({ config: { ...config, custom: {} }, handler, superficie: 'rest' })
    const request = new Request(identity, { method: 'POST', headers: { ...key, 'X-HTTP-Method-Override': 'GET' }, body: '{' })
    const contexto = { params: Promise.resolve({ slug: ['editorial', 'identity-v1'] }) }
    expect((await guard(request, contexto)).status).toBe(200)
    expect(handler).toHaveBeenCalledWith(request, contexto)
    expect(request.bodyUsed).toBe(false)
    expect(mock.getPayload).not.toHaveBeenCalled()
    expect(mock.auth).not.toHaveBeenCalled()
  })

  it.each([{}, { cookie: 'analytics=fixture' }, { cookie: 'payload-token=' }])('público sem credencial Payload não acrescenta lookup: %j', async headers => {
    const handler = vi.fn(async () => new Response('publico'))
    const request = new Request('https://cms.example.test/api/midia', { headers: headers as HeadersInit })
    const guard = protegerTransporteSiteReader({ config, handler, superficie: 'rest' })
    expect((await guard(request)).status).toBe(200)
    expect(handler).toHaveBeenCalledWith(request)
    expect(mock.getPayload).not.toHaveBeenCalled()
    expect(mock.auth).not.toHaveBeenCalled()
  })

  it.each(['payload-token =fixture', 'a=x; payload-token =fixture;', 'payload-token\t=\tfixture'])('cookie nativo com espaços não escapa do preflight: %s', async cookie => {
    const handler = vi.fn()
    mock.auth.mockResolvedValue({ user: { ...reader, _strategy: 'local-jwt' } })
    expect((await protegerTransporteSiteReader({ config, handler, superficie: 'graphql' })(new Request('https://cms.example.test/api/graphql', { headers: { cookie } }))).status).toBe(403)
    expect(mock.auth).toHaveBeenCalledTimes(1)
    expect(handler).not.toHaveBeenCalled()
  })

  it.each(['', 'custom'])('preserva cookiePrefix nativo mesmo vazio: %j', async cookiePrefix => {
    const handler = vi.fn()
    mock.auth.mockResolvedValue({ user: { ...reader, _strategy: 'local-jwt' } })
    const r = await protegerTransporteSiteReader({ config: { ...config, cookiePrefix }, handler, superficie: 'graphql' })(new Request('https://cms.example.test/api/graphql', { headers: { cookie: `${cookiePrefix}-token=fixture` } }))
    expect(r.status).toBe(403)
    expect(mock.auth).toHaveBeenCalledTimes(1)
    expect(handler).not.toHaveBeenCalled()
  })

  it('identity anônima responde401 sem lookup e sem handler', async () => {
    const handler = vi.fn()
    expect((await protegerTransporteSiteReader({ config, handler, superficie: 'rest' })(new Request(identity))).status).toBe(401)
    expect(mock.getPayload).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
  })

  it.each(['X-HTTP-Method-Override', 'X-Payload-HTTP-Method-Override'])('rejeita %s ANTES de JSON inválido/auth/handler', async header => {
    const handler = vi.fn()
    const request = new Request(identity, { method: 'POST', headers: { ...key, [header]: 'GET', 'content-type': 'application/json' }, body: '{' })
    const r = await protegerTransporteSiteReader({ config, handler, superficie: 'rest' })(request)
    expect(r.status).toBe(405)
    expect(r.headers.get('allow')).toBe('GET')
    expect(request.bodyUsed).toBe(false)
    expect(mock.auth).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
  })

  it.each(['HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'])('identity não aceita %s', async method => {
    expect((await protegerTransporteSiteReader({ config, handler: vi.fn(), superficie: 'rest' })(new Request(identity, { method, headers: key }))).status).toBe(405)
  })

  it('identity autentica a cada request, projeta somente DTO e observa revogação', async () => {
    const handler = vi.fn()
    const guard = protegerTransporteSiteReader({ config, handler, superficie: 'rest' })
    const r = await guard(new Request(identity, { headers: key }))
    expect(await r.json()).toEqual({ versao: 1, papel: 'site-reader', tenantId: '1' })
    expect(r.headers.get('cache-control')).toBe('private, no-store')
    expect(r.headers.get('vary')).toBe('Authorization')
    expect(r.headers.has('set-cookie')).toBe(false)
    expect(mock.auth).toHaveBeenCalledWith({ payload: mock.payload, headers: expect.any(Headers), canSetHeaders: false, isGraphQL: false })
    mock.auth.mockResolvedValue({ user: null })
    expect((await guard(new Request(identity, { headers: key }))).status).toBe(401)
    expect(mock.auth).toHaveBeenCalledTimes(2)
    expect(handler).not.toHaveBeenCalled()
  })

  it.each(['/api/users/me', '/api/posts', '/api/claims/versions', '/api/payload-jobs/run?queue=diario'])('reader não alcança %s', async path => {
    const handler = vi.fn()
    const r = await protegerTransporteSiteReader({ config, handler, superficie: 'rest' })(new Request('https://cms.example.test' + path, { headers: key }))
    expect(r.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it.each(['graphql', 'graphql-playground'] as const)('%s não lê corpo nem executa handler de reader', async superficie => {
    const handler = vi.fn()
    const request = new Request(identity, { headers: key })
    expect((await protegerTransporteSiteReader({ config, handler, superficie })(request)).status).toBe(403)
    expect(request.bodyUsed).toBe(false)
    expect(handler).not.toHaveBeenCalled()
  })

  it('confere também params.slug efetivo do Next, não somente URL visível', async () => {
    const guard = protegerTransporteSiteReader({ config, handler: vi.fn(), superficie: 'rest' })
    expect((await guard(new Request(identity, { headers: key }), { params: Promise.resolve({ slug: ['payload-jobs', 'run'] }) })).status).toBe(403)
    expect((await guard(new Request(identity, { headers: key }), { params: Promise.resolve({ slug: ['editorial', 'identity-v1'] }) })).status).toBe(200)
  })

  it('admin preflight usa headers, nega inclusive reader misto e não faz lookup anônimo', async () => {
    expect(await leitorNoPreflightSiteReader({ config, headers: new Headers() })).toBe(false)
    expect(mock.auth).not.toHaveBeenCalled()
    mock.auth.mockResolvedValue({ user: { ...reader, roles: ['site-reader', 'super-admin'] } })
    expect(await leitorNoPreflightSiteReader({ config, headers: new Headers(key) })).toBe(true)
  })

  it.each([undefined, null, [], 'site-reader', ['editor', null]].map(roles => [roles]))('usuário users sem discriminador válido não vira não-reader: %j', async roles => {
    mock.auth.mockResolvedValue({ user: { ...reader, roles } })
    const handler = vi.fn()
    const guard = protegerTransporteSiteReader({ config, handler, superficie: 'graphql' })
    expect((await guard(new Request('https://cms.example.test/api/graphql', { headers: key }))).status).toBe(403)
    expect(await leitorNoPreflightSiteReader({ config, headers: new Headers(key) })).toBe(true)
    expect(handler).not.toHaveBeenCalled()
  })
})
