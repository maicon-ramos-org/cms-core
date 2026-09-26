import { AsyncLocalStorage } from 'node:async_hooks'
import { EventEmitter } from 'node:events'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Config } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { criaPoolPorRequisicao, poolPostgresPorRequisicao, type ContextoConexaoPostgres } from '../src/db/pool-por-requisicao'

class PoolFalso extends EventEmitter {
  static criados: PoolFalso[] = []
  readonly clientes: Array<{ release: (...args: unknown[]) => void; soltura: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> }> = []
  encerrado = false
  constructor(readonly options: Record<string, unknown> = {}) { super(); PoolFalso.criados.push(this) }
  connect(callback?: (erro: Error | undefined, cliente?: unknown, release?: unknown) => void) {
    if (this.encerrado) return Promise.reject(new Error('encerrado'))
    const soltura = vi.fn()
    const cliente = { release: soltura, soltura, on: vi.fn() }
    this.clientes.push(cliente)
    this.emit('connect', cliente)
    if (callback) { callback(undefined, cliente, cliente.release); return }
    return Promise.resolve(cliente)
  }
  async query() { return { dono: this.options.connectionString, pool: this } }
  end() { this.encerrado = true; return Promise.resolve() }
}
const Base = PoolFalso as unknown as PostgresAdapter['pg']['Pool']
const contexto = new AsyncLocalStorage<ContextoConexaoPostgres>()
const atual = () => { const c = contexto.getStore(); if (!c) throw new Error('sem contexto'); return c }
const monta = (nome: string): ContextoConexaoPostgres => ({ identidade: {}, connectionString: `postgres://${nome}` })
const roda = <T>(nome: string, f: () => T) => contexto.run(monta(nome), f)

describe('fachada Pool restrita ao request', () => {
  it('mesmo contexto usa Pool real; requests concorrentes não compartilham fila/cliente', async () => {
    const Pool = criaPoolPorRequisicao(Base, atual)
    const pool = new Pool({ maxUses: 1 })
    expect(pool).toBeInstanceOf(PoolFalso)
    const dados = await Promise.all(['a', 'b'].map(nome => roda(nome, async () => {
      const a = await pool.query('SELECT 1') as unknown as { dono: string; pool: PoolFalso }
      await Promise.resolve()
      const b = await pool.query('SELECT 1') as unknown as { dono: string; pool: PoolFalso }
      expect(a.pool).toBe(b.pool)
      expect(a.pool.options.maxUses).toBe(1)
      return a
    })))
    expect(dados.map(d => d.dono)).toEqual(['postgres://a', 'postgres://b'])
    expect(dados[0]!.pool).not.toBe(dados[1]!.pool)
  })

  it('método capturado não muda de proprietário nem pode escapar para outro request', async () => {
    const Pool = criaPoolPorRequisicao(Base, atual)
    const pool = new Pool({ maxUses: 1 })
    await roda('a', async () => {
      const query = pool.query, cliente = await pool.connect()
      await roda('b', async () => {
        expect(() => query('SELECT 1')).toThrow(/outra requisição/)
        expect((await pool.query('SELECT 1') as unknown as { dono: string }).dono).toBe('postgres://b')
      })
      expect((await query('SELECT 1') as unknown as { dono: string }).dono).toBe('postgres://a')
      cliente.release()
      expect(cliente.release).toHaveBeenCalledOnce()
    })
  })

  it('callbacks, listeners e end são delegados ao Pool real de cada request', async () => {
    const Pool = criaPoolPorRequisicao(Base, atual)
    const pool = new Pool({ maxUses: 1 })
    const a = monta('a'), b = monta('b'), erroA = vi.fn(), erroB = vi.fn()
    const realA = await contexto.run(a, async () => {
      expect(pool.on('error', erroA)).toBe(pool)
      return (await pool.query('SELECT 1') as unknown as { pool: PoolFalso }).pool
    })
    const realB = await contexto.run(b, async () => {
      expect(pool.on('error', erroB)).toBe(pool)
      return (await pool.query('SELECT 1') as unknown as { pool: PoolFalso }).pool
    })
    realA.emit('error', new Error('falha sintética'))
    expect(erroA).toHaveBeenCalledOnce()
    expect(erroB).not.toHaveBeenCalled()
    contexto.run(a, () => pool.connect((erro, cliente, release) => {
      expect(erro).toBeUndefined()
      expect(cliente).toBeDefined()
      release()
      expect(realA.clientes[0]!.release).toHaveBeenCalledOnce()
    }))
    await contexto.run(a, () => pool.end())
    expect(realA.encerrado).toBe(true)
    expect(realB.encerrado).toBe(false)
    await contexto.run(b, () => pool.query('SELECT 1'))
  })

  it('sem contexto não cria fallback global nem consulta DATABASE_URL', async () => {
    const Pool = criaPoolPorRequisicao(Base, atual)
    const pool = new Pool({ maxUses: 1 })
    expect(() => pool.query('SELECT 1')).toThrow('sem contexto')
    expect(() => pool.connect()).toThrow('sem contexto')
    expect(() => pool.end()).toThrow('sem contexto')
    await contexto.run({ identidade: {}, connectionString: '' } as ContextoConexaoPostgres, async () => {
      expect(() => pool.query('SELECT 1')).toThrow(/contexto/i)
    })
  })

  it('a identidade de uma requisição não pode trocar de banco, inclusive método capturado', async () => {
    const Pool = criaPoolPorRequisicao(Base, atual)
    const pool = new Pool({ connectionString: 'postgres://bootstrap', maxUses: 99, max: 3 })
    await roda('a', async () => {
      const query = pool.query
      const real = (await query('SELECT 1') as unknown as { pool: PoolFalso }).pool
      expect(real.options).toMatchObject({ connectionString: 'postgres://a', maxUses: 1, max: 3 })
      atual().connectionString = 'postgres://outro-banco'
      expect(() => pool.query('SELECT 1')).toThrow(/mesma requisição/)
      expect(() => query('SELECT 1')).toThrow(/mesma requisição/)
    })
  })

  it.each([null, undefined, { identidade: null, connectionString: 'postgres://fixture' },
    { identidade: 'tenant', connectionString: 'postgres://fixture' },
    { identidade: {}, connectionString: ' ' }])('contexto inválido falha fechado sem fallback: %j', invalido => {
    const Pool = criaPoolPorRequisicao(Base, () => invalido as never)
    const pool = new Pool({ connectionString: 'postgres://bootstrap' })
    expect(() => pool.query('SELECT 1')).toThrow(/contexto/i)
  })

})

describe('plugin não modifica driver global e libera bootstrap', () => {
  function configFalsa(falha = false, replicas?: string[]) {
    let adapter: PostgresAdapter
    const pg = { Pool: Base }
    const config = { db: { init: () => {
      adapter = {
        name: 'postgres', pg, poolOptions: { maxUses: 1 }, pool: undefined, readReplicaOptions: replicas,
        async connect(this: PostgresAdapter) {
          // db-postgres 3.88 só reserva o monitor quando o Pool ainda não existe.
          if (this.pool) return
          this.pool = new this.pg.Pool(this.poolOptions)
          await this.pool.connect()
          if (falha) throw new Error('bootstrap falhou')
        },
      } as unknown as PostgresAdapter
      return adapter
    } } } as unknown as Config
    return { config, pg }
  }

  it('não redireciona silenciosamente réplicas ao binding primário', async () => {
    const { config } = configFalsa(false, ['postgres://replica-fixture'])
    const modificada = await poolPostgresPorRequisicao(atual)(config)
    expect(() => modificada.db!.init({ payload: {} as never })).toThrow(/réplicas/)
  })

  it.each([false, true])('cliente de bootstrap liberado inclusive em erro=%s', async falha => {
    const { config, pg } = configFalsa(falha)
    const modificada = await poolPostgresPorRequisicao(atual)(config)
    const adapter = modificada.db!.init({ payload: {} as never }) as PostgresAdapter
    expect(pg.Pool).toBe(Base)
    expect(adapter.pg).not.toBe(pg)
    await roda('bootstrap', async () => {
      if (falha) await expect(adapter.connect!()).rejects.toThrow('bootstrap falhou')
      else await adapter.connect!()
      const real = (await adapter.pool.query('SELECT 1') as unknown as { pool: PoolFalso }).pool
      expect(real.clientes[0]!.soltura).toHaveBeenCalledOnce()
      expect(real.clientes[0]!.soltura).toHaveBeenCalledWith(falha)
      await adapter.connect!({ hotReload: true })
      expect(real.clientes).toHaveLength(1)
      const transacao = await adapter.pool.connect()
      expect(transacao.release).not.toHaveBeenCalled()
      transacao.release()
      await adapter.pool.end()
      expect(real.encerrado).toBe(true)
    })
  })
})
