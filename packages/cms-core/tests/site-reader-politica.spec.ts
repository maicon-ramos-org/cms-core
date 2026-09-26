import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'
import { afiliado } from '../../afiliado/src/cms/plugin'
import { cmsCore } from '../src/fabrica'
import { aplicaPoliticaSiteReader } from '../src/site-reader/politica'

const reader = { id: 1, collection: 'users', roles: ['site-reader'], tenants: [{ tenant: 1 }], _strategy: 'api-key', enableAPIKey: true }
const req = (user: unknown) => ({ user, headers: new Headers(), method: 'GET' }) as PayloadRequest

afterEach(() => vi.unstubAllEnvs())

describe('spike: política aplicada à config final sanitizada', () => {
  const base = { raiz: '/tmp/reader-config-fixture', sharp: null,
    midia: { r2: { bucket: 'fixture', publicBase: 'https://media.example.test', endpoint: 'http://127.0.0.1:19000', credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' } } },
  }

  it('render exige opt-in separado, preserva schema e recusa colisão de caminho', async () => {
    const projetor = vi.fn(async () => ({ revisao: 'r1', dados: { titulo: 'Fixture' } }))
    const identidade = await cmsCore({ ...base, siteReader: true })
    const render = await cmsCore({ ...base, siteReader: { renderV1: projetor } })
    expect(identidade.custom?.siteReader?.renderV1).toBeUndefined()
    expect(render.custom?.siteReader?.renderV1).toBe(projetor)
    expect(render.collections.map(c => c.slug)).toEqual(identidade.collections.map(c => c.slug))
    expect(render.endpoints.map(e => e.path)).toEqual(identidade.endpoints.map(e => e.path))
    await expect(cmsCore({ ...base, siteReader: { renderV1: null } as never })).rejects.toThrow(/renderV1 deve ser/)
    await expect(cmsCore({ ...base, siteReader: { renderV1: projetor },
      plugins: [c => ({ ...c, endpoints: [...(c.endpoints ?? []), { path: '/editorial/render-v1', method: 'get', handler: async () => new Response() }] })],
    })).rejects.toThrow(/render já ocupado/)
  })

  it('rejeita strategy custom em qualquer coleção só quando opt-in está ativo', async () => {
    const plugins = [(c: import('payload').Config) => ({ ...c, collections: [...(c.collections ?? []), {
      slug: 'auth_externa', fields: [], auth: { strategies: [{ name: 'externa', authenticate: async () => ({ user: null }) }] },
    }] })]
    expect((await cmsCore({ ...base, plugins })).collections.find(c => c.slug === 'auth_externa')!.auth).toBeTruthy()
    await expect(cmsCore({ ...base, plugins, siteReader: true })).rejects.toThrow(/strategies custom/)
  })

  it('rejeita autoLogin ativo, mas preserva prefillOnly e default-off', async () => {
    const plugins = [(c: import('payload').Config) => ({ ...c, admin: { ...c.admin, autoLogin: { email: 'fixture@example.test' } } })]
    expect((await cmsCore({ ...base, plugins })).admin.autoLogin).toBeTruthy()
    await expect(cmsCore({ ...base, plugins, siteReader: true })).rejects.toThrow(/autoLogin/)
    await expect(cmsCore({ ...base, siteReader: true, plugins: [c => ({ ...c, admin: { ...c.admin, autoLogin: { email: 'fixture@example.test', prefillOnly: true } } })] })).resolves.toBeTruthy()
  })

  it.each([{ hidden: true }, { localized: true }, { virtual: true }, { required: false }])('exige discriminador roles íntegro: %j', async alteracao => {
    const plugin = (c: import('payload').Config) => ({ ...c, collections: c.collections!.map(collection => collection.slug !== 'users' ? collection : {
      ...collection, fields: collection.fields.map(field => field.type === 'select' && field.name === 'roles' ? { ...field, ...alteracao } : field),
    }) })
    await expect(cmsCore({ ...base, plugins: [plugin], siteReader: true })).rejects.toThrow(/roles/)
    if ('hidden' in alteracao) await expect(cmsCore({ ...base, plugins: [plugin] })).resolves.toBeTruthy()
  })

  it('preserva ACLs nativas para anônimo/editor: mídia pública, jobs, globais e defaults ausentes', async () => {
    const config = await cmsCore({ ...base, plugins: [c => ({ ...c,
      collections: [...c.collections!, { slug: 'defaults_reader', versions: true, fields: [] }],
      globals: [{ slug: 'default_global_reader', versions: true, fields: [] }],
    })], jobs: { tasks: [{ slug: 'default_reader', handler: async () => ({ output: {} }) }] } })
    const collection = config.collections.find(c => c.slug === 'defaults_reader')!
    const midia = config.collections.find(c => c.slug === 'midia')!
    const global = config.globals[0]!
    // Sanitização preenche CRUD/unlock, globais read/update e jobs. admin e
    // readVersions podem faltar: executeAccess/getAccessResults usam Boolean(user).
    expect(collection.access.admin).toBeUndefined()
    // O multi-tenant também fornece readVersions às coleções.
    expect(typeof collection.access.readVersions).toBe('function')
    expect(global.access.readVersions).toBeUndefined()
    const surfaces = [
      ...(['create', 'read', 'update', 'delete', 'unlock', 'admin', 'readVersions'] as const).map(op => ({ access: collection.access, op })),
      ...(['read', 'update', 'readVersions'] as const).map(op => ({ access: global.access, op })),
      ...(['run', 'queue', 'cancel'] as const).map(op => ({ access: config.jobs.access!, op })),
      { access: midia.access, op: 'read' as const },
    ].map(surface => ({ ...surface, original: (surface.access as Record<string, Function | undefined>)[surface.op] }))
    const principals = [undefined, { id: 2, collection: 'users', roles: ['editor'], tenants: [{ tenant: 1 }] }]
    const before = await Promise.all(surfaces.map(async s => Promise.all(principals.map(user => s.original ? s.original({ req: req(user) }) : Boolean(user)))))
    aplicaPoliticaSiteReader(config)
    for (const [index, surface] of surfaces.entries()) {
      const wrapped = (surface.access as Record<string, Function>)[surface.op]!
      expect(await Promise.all(principals.map(user => wrapped({ req: req(user) })))).toEqual(before[index])
    }
    expect(await midia.access.read({ req: req(undefined) })).toBe(true)
    for (const op of ['run', 'queue', 'cancel'] as const) {
      expect(await config.jobs.access![op]!({ req: req(undefined) } as never)).toBe(false)
      expect(await config.jobs.access![op]!({ req: req(principals[1]) } as never)).toBe(true)
    }
  })

  it('nega antes de cada ACL e handler, incluindo plugins, globais e jobs internos', async () => {
    vi.stubEnv('PAYLOAD_SECRET', 'reader-fixture-sem-segredo-real')
    const executa = vi.fn(async () => Response.json({ canario: true }))
    const permite = vi.fn(() => true)
    const config = await cmsCore({ raiz: '/tmp/reader-config-fixture', sharp: null,
      midia: { r2: { bucket: 'fixture', publicBase: 'https://media.example.test', endpoint: 'http://127.0.0.1:19000', credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' } } },
      plugins: [afiliado(), (c) => ({ ...c,
        collections: [...(c.collections ?? []), { slug: 'canario_reader', versions: true, fields: [],
          access: { read: permite, readVersions: permite, create: permite, update: permite, delete: permite },
          endpoints: [{ path: '/extra', method: 'get', handler: executa }],
        }],
        globals: [{ slug: 'global_reader', fields: [], access: { read: permite, update: permite }, endpoints: [{ path: '/extra', method: 'get', handler: executa }] }],
        endpoints: [{ path: '/canario', method: 'get', handler: executa }],
      })],
      jobs: { tasks: [{ slug: 'canario_reader', handler: async () => ({ output: {} }) }] },
    })
    expect(config.collections.some(c => c.slug === 'payload-jobs')).toBe(true)
    expect(config.collections.some(c => c.slug === 'ofertas')).toBe(true)
    const usersEndpoints = config.collections.find(c => c.slug === 'users')!.endpoints
    expect(usersEndpoints && usersEndpoints.some(e => e.path === '/me')).toBe(true)
    aplicaPoliticaSiteReader(config)

    for (const user of [reader, { ...reader, roles: ['site-reader', 'super-admin'] }, { ...reader, roles: undefined }]) {
      for (const collection of config.collections) {
        for (const operation of ['admin', 'create', 'read', 'readVersions', 'update', 'delete', 'unlock'] as const) {
          expect(await collection.access[operation]!({ req: req(user) } as never), `${collection.slug}.${operation}`).toBe(false)
        }
        for (const endpoint of collection.endpoints || []) {
          expect((await endpoint.handler(req(user))).status, `${collection.slug}:${endpoint.path}`).toBe(403)
        }
      }
      for (const global of config.globals) {
        for (const operation of ['read', 'readVersions', 'update'] as const) expect(await global.access[operation]!({ req: req(user) } as never)).toBe(false)
        for (const endpoint of global.endpoints || []) expect((await endpoint.handler(req(user))).status).toBe(403)
      }
      for (const endpoint of config.endpoints.filter(e => e.path !== '/editorial/identity-v1')) expect((await endpoint.handler(req(user))).status).toBe(403)
      for (const operation of ['run', 'queue', 'cancel'] as const) expect(await config.jobs.access![operation]!({ req: req(user) } as never)).toBe(false)
    }
    expect(permite).not.toHaveBeenCalled()
    expect(executa).not.toHaveBeenCalled()
    expect(await config.collections.find(c => c.slug === 'canario_reader')!.access.read({ req: req({ id: 2, roles: ['editor'], tenants: [] }) } as never)).not.toBe(false)
    expect(permite).toHaveBeenCalled()
    expect((await config.endpoints.find(e => e.path === '/canario')!.handler(req({ roles: ['editor'] }))).status).toBe(200)
    expect(executa).toHaveBeenCalledTimes(1)
  })
})
