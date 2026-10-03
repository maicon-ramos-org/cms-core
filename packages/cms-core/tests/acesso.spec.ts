/**
 * As regras de acesso de `users`, `mensagens` e das coleções internas do Payload, na config
 * (sem banco). A prova pela REST real está em `tests/int/acesso.int.spec.ts`.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Access, CollectionConfig, Field, FieldAccess, SanitizedConfig } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Mensagens } from '../src/collections/Mensagens'
import { Users } from '../src/collections/Users'
import { cmsCore } from '../src/fabrica'

type U = { id?: number; roles?: string[]; _strategy?: string; collection?: string } | null
const req = (user: U) => ({ user, t: (k: string) => k }) as never
const sessao = (id: number, ...roles: string[]): U => ({ id, roles, _strategy: 'local-jwt', collection: 'users' })
const chave = (id: number, ...roles: string[]): U => ({ id, roles, _strategy: 'api-key', collection: 'users' })
const acesso = (c: CollectionConfig, op: 'create' | 'read' | 'update', user: U, id?: number) =>
  (c.access![op] as Access)({ req: req(user), id } as never)
const campo = (c: CollectionConfig, nome: string) => c.fields.find((f) => 'name' in f && f.name === nome) as Field & { access?: { read?: FieldAccess } }
const leCampo = (c: CollectionConfig, nome: string, user: U, doc?: Record<string, unknown>) => {
  const read = campo(c, nome)?.access?.read
  return read ? read({ req: req(user), doc } as never) : true
}

describe('users', () => {
  it('leitura: super-admin vê todos; os demais, só o próprio documento; anônimo, nada', () => {
    expect(acesso(Users, 'read', sessao(1, 'super-admin'))).toBe(true)
    expect(acesso(Users, 'read', chave(2, 'agente'))).toEqual({ id: { equals: '2' } })
    expect(acesso(Users, 'read', chave(3, 'sistema'))).toEqual({ id: { equals: '3' } })
    expect(acesso(Users, 'read', sessao(4, 'editor'))).toEqual({ id: { equals: '4' } })
    expect(acesso(Users, 'read', null)).toBe(false)
  })

  it('apiKey e enableAPIKey: só o dono e o super-admin leem; apiKeyIndex, ninguém', () => {
    for (const nome of ['apiKey', 'enableAPIKey']) {
      expect(leCampo(Users, nome, chave(2, 'agente'), { id: 2 }), nome).toBe(true)
      expect(leCampo(Users, nome, chave(2, 'agente'), { id: 1 }), nome).toBe(false)
      expect(leCampo(Users, nome, sessao(4, 'editor'), { id: 2 }), nome).toBe(false)
      expect(leCampo(Users, nome, sessao(1, 'super-admin'), { id: 2 }), nome).toBe(true)
    }
    expect(leCampo(Users, 'apiKeyIndex', sessao(1, 'super-admin'), { id: 1 })).toBe(false)
    expect(leCampo(Users, 'apiKeyIndex', chave(2, 'agente'), { id: 2 })).toBe(false)
  })

  it('edição: por API key, ninguém além do super-admin; em sessão, só a si mesmo', () => {
    expect(acesso(Users, 'update', chave(2, 'agente'), 2)).toBe(false)
    expect(acesso(Users, 'update', chave(3, 'sistema'), 3)).toBe(false)
    expect(acesso(Users, 'update', sessao(4, 'editor'), 4)).toBe(true)
    expect(acesso(Users, 'update', sessao(4, 'editor'), 2)).toBe(false)
    expect(acesso(Users, 'update', chave(1, 'super-admin'), 2)).toBe(true)
  })

  it('por API key, nem o super-admin troca senha ou e-mail; o resto passa', async () => {
    const hook = Users.hooks!.beforeValidate![0]!
    const roda = (user: U, data: Record<string, unknown>) =>
      hook({ data, originalDoc: { id: 2, email: 'a@b.test' }, operation: 'update', req: req(user) } as never)
    await expect(async () => roda(chave(1, 'super-admin'), { password: 'x' })).rejects.toMatchObject({ status: 403 })
    await expect(async () => roda(chave(1, 'super-admin'), { email: 'c@d.test' })).rejects.toMatchObject({ status: 403 })
    expect(await roda(chave(1, 'super-admin'), { email: 'a@b.test', nome: 'n' })).toEqual({ email: 'a@b.test', nome: 'n' })
    expect(await roda(chave(1, 'super-admin'), { enableAPIKey: false })).toEqual({ enableAPIKey: false })
    expect(await roda(sessao(1, 'super-admin'), { password: 'x' })).toEqual({ password: 'x' })
  })
})

describe('mensagens', () => {
  it('criar: só o servidor do site (sistema) e o super-admin; anônimo e agente não', () => {
    expect(acesso(Mensagens, 'create', null)).toBe(false)
    expect(acesso(Mensagens, 'create', chave(2, 'agente'))).toBe(false)
    expect(acesso(Mensagens, 'create', chave(3, 'sistema'))).toBe(true)
    expect(acesso(Mensagens, 'create', sessao(1, 'super-admin'))).toBe(true)
  })

  it('ler: super-admin, editor e sistema; editar: super-admin e editor', () => {
    expect(acesso(Mensagens, 'read', chave(2, 'agente'))).toBe(false)
    expect(acesso(Mensagens, 'read', chave(2, 'ingestao'))).toBe(false)
    expect(acesso(Mensagens, 'read', chave(3, 'sistema'))).toBe(true)
    expect(acesso(Mensagens, 'read', sessao(4, 'editor'))).toBe(true)
    expect(acesso(Mensagens, 'update', chave(3, 'sistema'))).toBe(false)
    expect(acesso(Mensagens, 'update', chave(2, 'agente'))).toBe(false)
    expect(acesso(Mensagens, 'update', sessao(4, 'editor'))).toBe(true)
  })

  it('campos pessoais só para super-admin e editor; ip_hash e lida para quem lê a coleção', () => {
    for (const nome of ['nome', 'email', 'mensagem', 'origem_url', 'user_agent']) {
      expect(leCampo(Mensagens, nome, chave(3, 'sistema')), nome).toBe(false)
      expect(leCampo(Mensagens, nome, sessao(4, 'editor')), nome).toBe(true)
      expect(leCampo(Mensagens, nome, sessao(1, 'super-admin')), nome).toBe(true)
    }
    expect(leCampo(Mensagens, 'ip_hash', chave(3, 'sistema'))).toBe(true)
    expect(leCampo(Mensagens, 'lida', chave(3, 'sistema'))).toBe(true)
  })
})

describe('coleções internas do Payload, na config da fábrica', () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries({ R2_ACCOUNT_ID: 'conta', R2_ACCESS_KEY_ID: 'chave', R2_SECRET_ACCESS_KEY: 'segredo',
      R2_BUCKET: 'midia-teste', R2_PUBLIC_BASE: 'https://media.exemplo.com', DATABASE_URL: 'postgres://ambiente@127.0.0.1:5432/x' })) vi.stubEnv(k, v)
  })
  afterEach(() => vi.unstubAllEnvs())
  const raiz = mkdtempSync(join(tmpdir(), 'acesso-'))
  const colecao = (config: SanitizedConfig, slug: string) => config.collections.find((c) => c.slug === slug)!

  it('payload-locked-documents: API key não cria, altera nem apaga trava; a sessão sim, em nome próprio', async () => {
    const config = await cmsCore({ raiz, pastaDeMigracoes: raiz, sharp: null })
    const trava = colecao(config, 'payload-locked-documents')
    for (const op of ['create', 'update', 'delete'] as const) {
      const fn = trava.access[op] as Access
      expect(fn({ req: req(chave(3, 'sistema')) } as never), op).toBe(false)
      expect(fn({ req: req(chave(1, 'super-admin')) } as never), op).toBe(false)
      expect(fn({ req: req(sessao(4, 'editor')) } as never), op).toBe(true)
      expect(fn({ req: req(null) } as never), op).toBe(false)
    }
    const data = await trava.hooks.beforeChange[0]!({ data: { user: { relationTo: 'users', value: 1 } }, req: req(sessao(4, 'editor')) } as never)
    expect(data).toEqual({ user: { relationTo: 'users', value: 4 } })
  })

  it('payload-preferences: a REST padrão só grava em sessão de login', async () => {
    const config = await cmsCore({ raiz, pastaDeMigracoes: raiz, sharp: null })
    const prefs = colecao(config, 'payload-preferences')
    for (const op of ['create', 'update'] as const) {
      expect((prefs.access[op] as Access)({ req: req(chave(2, 'agente')) } as never), op).toBe(false)
      expect((prefs.access[op] as Access)({ req: req(sessao(4, 'editor')) } as never), op).toBe(true)
    }
  })

  it('users: os campos de API key se fundem aos do Payload (mesmos nomes, uma vez cada, com o access daqui)', async () => {
    const config = await cmsCore({ raiz, pastaDeMigracoes: raiz, sharp: null })
    const users = colecao(config, 'users')
    for (const nome of ['enableAPIKey', 'apiKey', 'apiKeyIndex']) {
      const achados = users.fields.filter((f) => 'name' in f && f.name === nome) as Array<Field & { access?: { read?: unknown }; hooks?: unknown }>
      expect(achados, nome).toHaveLength(1)
      expect(achados[0]!.access?.read, nome).toBeTypeOf('function')
    }
    // o `apiKey` continua com os hooks de cifra/decifra do Payload
    const apiKey = users.fields.find((f) => 'name' in f && f.name === 'apiKey') as Field & { hooks?: { beforeChange?: unknown[]; afterRead?: unknown[] } }
    expect(apiKey.hooks?.beforeChange?.length).toBeGreaterThan(0)
    expect(apiKey.hooks?.afterRead?.length).toBeGreaterThan(0)
  })
})
