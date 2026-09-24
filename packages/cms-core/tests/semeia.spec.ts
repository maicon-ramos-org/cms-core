/**
 * `aplicaSemente` — a semeadura que todo site usa (PRD 17 RF5c): cria os tenants e os
 * usuários que recebe, e só cria. O site passa os dados dele; o núcleo não sabe de marca.
 *
 * Roda contra um Payload de mentira (só `find`, `create` e o `logger`): o que importa aqui é
 * a regra — idempotência, chave e senha vindas do ambiente, tenant referenciado por slug —,
 * e não o banco.
 */
import { getPayload } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { aplicaSemente, semeia, upsert, type Semente } from '../src/scripts/semeia'

vi.mock('payload', () => ({ getPayload: vi.fn() }))

type Doc = Record<string, unknown> & { id: number }

const payloadDeMentira = () => {
  const banco: Record<string, Doc[]> = {}
  const logs: string[] = []
  let proximo = 1
  const casa = (doc: Doc, where: Record<string, { equals: unknown }>) =>
    Object.entries(where).every(([campo, cond]) => doc[campo] === cond.equals)
  const payload = {
    find: async ({ collection, where }: { collection: string; where: Record<string, { equals: unknown }> }) => ({
      docs: (banco[collection] ?? []).filter((d) => casa(d, where)),
    }),
    create: async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      const doc = { ...data, id: proximo++ }
      ;(banco[collection] ??= []).push(doc)
      return doc
    },
    logger: { info: (m: string) => logs.push(m) },
  }
  return { payload: payload as never, banco, logs }
}

const semente = (): Semente => ({
  tenants: [
    { slug: 'um', nome: 'Um' },
    { slug: 'dois', nome: 'Dois' },
  ],
  usuarios: [
    { email: 'admin@exemplo.test', nome: 'admin', roles: ['super-admin'], tenants: [], senhaDoAmbiente: 'SENHA_TESTE' },
    { email: 'agente@exemplo.test', nome: 'agente', roles: ['agente'], tenants: ['um', 'dois'] },
    { email: 'sistema@exemplo.test', nome: 'sistema', roles: ['sistema'], tenants: ['dois'], apiKeyDoAmbiente: 'CHAVE_TESTE' },
  ],
})

const ambienteOriginal = { ...process.env }
afterEach(() => {
  vi.unstubAllEnvs()
  process.env = { ...ambienteOriginal }
})

describe('aplicaSemente', () => {
  it('cria os tenants na ordem recebida e liga cada usuário aos tenants pelo slug', async () => {
    const { payload, banco } = payloadDeMentira()
    const r = await aplicaSemente(payload, semente())

    expect(banco.tenants?.map((t) => t.slug)).toEqual(['um', 'dois'])
    expect(r.tenants).toEqual({ um: 1, dois: 2 })
    const agente = banco.users?.find((u) => u.email === 'agente@exemplo.test')
    expect(agente?.tenants).toEqual([{ tenant: 1 }, { tenant: 2 }])
    expect(agente).toMatchObject({ nome: 'agente', roles: ['agente'], enableAPIKey: true })
  })

  it('é idempotente: rodar de novo não cria nada nem reexibe chave', async () => {
    const { payload, banco, logs } = payloadDeMentira()
    await aplicaSemente(payload, semente())
    logs.length = 0
    const r = await aplicaSemente(payload, semente())

    expect(banco.tenants).toHaveLength(2)
    expect(banco.users).toHaveLength(3)
    expect(r.chavesNovas).toEqual([])
    expect(logs).toContain('Nenhum usuário novo — keys existentes preservadas.')
  })

  it('chave de API vem do ambiente SÓ para quem a declara e SÓ quando a variável existe', async () => {
    process.env.CHAVE_TESTE = 'chave-fixa'
    const { payload, banco } = payloadDeMentira()
    const r = await aplicaSemente(payload, semente())

    const chave = (email: string) => banco.users?.find((u) => u.email === email)?.apiKey
    expect(chave('sistema@exemplo.test')).toBe('chave-fixa')
    expect(chave('agente@exemplo.test')).not.toBe('chave-fixa')
    expect(chave('agente@exemplo.test')).toMatch(/^[0-9a-f-]{36}$/)
    expect(r.chavesNovas.map((k) => k.usuario)).toEqual([
      'admin@exemplo.test',
      'agente@exemplo.test',
      'sistema@exemplo.test',
    ])

    delete process.env.CHAVE_TESTE
    const outro = payloadDeMentira()
    await aplicaSemente(outro.payload, semente())
    expect(outro.banco.users?.find((u) => u.email === 'sistema@exemplo.test')?.apiKey).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('senha do ambiente é usada e NÃO impressa; sem ela, é gerada e impressa uma vez', async () => {
    process.env.SENHA_TESTE = 'senha-escolhida'
    const a = payloadDeMentira()
    await aplicaSemente(a.payload, semente())
    expect(a.banco.users?.find((u) => u.email === 'admin@exemplo.test')?.password).toBe('senha-escolhida')
    expect(a.logs.join('\n')).not.toContain('senha-escolhida')
    expect(a.logs.join('\n')).not.toContain('GERADA')

    delete process.env.SENHA_TESTE
    const b = payloadDeMentira()
    await aplicaSemente(b.payload, semente())
    const gerada = b.banco.users?.find((u) => u.email === 'admin@exemplo.test')?.password as string
    expect(b.logs).toContain(`Senha do admin@exemplo.test GERADA agora (defina SENHA_TESTE pra escolher): ${gerada}`)

    // na segunda rodada o usuário já existe: nada a imprimir
    b.logs.length = 0
    await aplicaSemente(b.payload, semente())
    expect(b.logs.join('\n')).not.toContain('GERADA')
  })

  it('o conteúdo do site roda depois dos usuários, com os ids dos tenants, e antes do resumo', async () => {
    const { payload, logs } = payloadDeMentira()
    const vistos: Record<string, number | string>[] = []
    await aplicaSemente(payload, {
      ...semente(),
      conteudo: async ({ tenants, payload: p }) => {
        vistos.push(tenants)
        await upsert(p, 'lojas', { slug: { equals: 'x' } }, { slug: 'x', tenant: tenants.dois })
        p.logger.info('conteúdo semeado')
      },
    })
    expect(vistos).toEqual([{ um: 1, dois: 2 }])
    expect(logs.indexOf('conteúdo semeado')).toBeLessThan(logs.indexOf('Seed concluído.'))
  })

  it('usuário apontando para tenant que não está na semente é erro, antes de criar o usuário', async () => {
    const { payload, banco } = payloadDeMentira()
    const s = semente()
    s.usuarios[1]!.tenants = ['tres']
    await expect(aplicaSemente(payload, s)).rejects.toThrow('agente@exemplo.test aponta para o tenant "tres"')
    expect(banco.users ?? []).toHaveLength(0)
  })
})

describe('upsert', () => {
  it('devolve o existente sem alterar, ou cria', async () => {
    const { payload, banco } = payloadDeMentira()
    const a = await upsert(payload, 'lojas', { slug: { equals: 'x' } }, { slug: 'x', nome: 'primeira' })
    const b = await upsert(payload, 'lojas', { slug: { equals: 'x' } }, { slug: 'x', nome: 'segunda' })
    expect(a).toMatchObject({ id: 1, criado: true })
    expect(b).toMatchObject({ id: 1, criado: false })
    expect(banco.lojas).toEqual([{ slug: 'x', nome: 'primeira', id: 1 }])
  })
})

describe('semeia', () => {
  it('recusa produção ANTES de abrir o Payload', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect(semeia({ config: {} as never, ...semente() })).rejects.toThrow('não roda com NODE_ENV=production')
    expect(getPayload).not.toHaveBeenCalled()
  })
})
