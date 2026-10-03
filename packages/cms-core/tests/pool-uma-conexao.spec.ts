/**
 * Pool por requisição: UMA conexão por vez dentro da invocação, e ouvinte de `error`
 * (`criaPoolDaInvocacao`). A prova com Payload e Postgres de verdade (Pool max 1) está em
 * `tests/int/pool-uma-conexao.int.spec.ts`.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { EventEmitter } from 'node:events'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { describe, expect, it, vi } from 'vitest'
import { criaPoolPorRequisicao, type ContextoConexaoPostgres } from '../src/db/pool-por-requisicao'

/** Um cliente do pg: `query` resolve quando o teste mandar (para ver a fila e o release). */
class ClienteFalso {
  consultas: unknown[] = []
  soltou = 0
  pendentes: Array<() => void> = []
  async query(...args: unknown[]) {
    this.consultas.push(args[0])
    await new Promise<void>((r) => this.pendentes.push(r))
    return { rows: [{ via: 'cliente' }] }
  }
  release() { this.soltou++ }
  terminaTudo() { for (const r of this.pendentes.splice(0)) r() }
}

/** O mínimo do `pg.Pool`: EventEmitter (sem ouvinte, `emit('error')` lança, como no pg-pool). */
class PoolFalso extends EventEmitter {
  static criados: PoolFalso[] = []
  /** Quando definido, `connect` empresta este cliente (com `Connection`) em vez de um `ClienteFalso`. */
  static proximoCliente: (() => ClienteFalso) | undefined
  clientes: ClienteFalso[] = []
  consultasDoPool: unknown[] = []
  constructor(readonly opcoes: Record<string, unknown> = {}) { super(); PoolFalso.criados.push(this) }
  connect(cb?: (erro: unknown, cliente: ClienteFalso, release: () => void) => void) {
    const cliente = PoolFalso.proximoCliente?.() ?? new ClienteFalso()
    this.clientes.push(cliente)
    if (cb) return void cb(undefined, cliente, () => cliente.release())
    return Promise.resolve(cliente)
  }
  async query(...args: unknown[]) {
    this.consultasDoPool.push(args[0])
    return { rows: [{ via: 'pool' }] }
  }
}
const Base = PoolFalso as unknown as PostgresAdapter['pg']['Pool']
const contexto = new AsyncLocalStorage<ContextoConexaoPostgres>()
const atual = () => { const c = contexto.getStore(); if (!c) throw new Error('sem contexto'); return c }
/** A fachada que o drizzle guarda, numa invocação só; devolve também o Pool real dela. */
const invocacao = async <T>(f: (pool: PoolFalso, real: () => PoolFalso) => Promise<T>) => {
  const Pool = criaPoolPorRequisicao(Base, atual)
  const fachada = new Pool({ max: 1 }) as unknown as PoolFalso
  return contexto.run({ identidade: {}, connectionString: 'postgres://fixture' }, () =>
    f(fachada, () => PoolFalso.criados[PoolFalso.criados.length - 1]!))
}

describe('pool da invocação: uma conexão por vez', () => {
  it('consulta solta durante a transação vai no cliente da transação, sem pedir 2ª conexão', async () => {
    await invocacao(async (pool, real) => {
      const cliente = (await pool.connect()) as unknown as ClienteFalso // o BEGIN do drizzle
      const consulta = pool.query('select count(*) from "tags" where slug = $1', ['x'])
      expect(cliente.consultas).toEqual(['select count(*) from "tags" where slug = $1'])
      expect(real().consultasDoPool).toEqual([])
      expect(real().clientes).toHaveLength(1)
      cliente.terminaTudo()
      await expect(consulta).resolves.toEqual({ rows: [{ via: 'cliente' }] })
    })
  })

  it('o cliente só volta ao Pool depois que a consulta desviada termina; depois, consultas voltam ao Pool', async () => {
    await invocacao(async (pool) => {
      const cliente = (await pool.connect()) as unknown as ClienteFalso
      const consulta = pool.query('select 1')
      cliente.release() // o COMMIT já foi; o drizzle solta o cliente
      expect(cliente.soltou).toBe(0)
      cliente.terminaTudo()
      await consulta
      await new Promise((r) => setTimeout(r, 0))
      expect(cliente.soltou).toBe(1)
      await expect(pool.query('select 2')).resolves.toEqual({ rows: [{ via: 'pool' }] })
    })
  })

  it('sem cliente emprestado, ou com callback, nada muda', async () => {
    await invocacao(async (pool, real) => {
      await expect(pool.query('select 1')).resolves.toEqual({ rows: [{ via: 'pool' }] })
      // a forma com callback (a do pool.query interno do pg-pool) não conta como emprestado
      await new Promise<void>((r) => pool.connect(() => r()))
      await expect(pool.query('select 2')).resolves.toEqual({ rows: [{ via: 'pool' }] })
      expect(real().consultasDoPool).toEqual(['select 1', 'select 2'])
    })
  })

  it('dois clientes emprestados ao mesmo tempo: não escolhe, a consulta vai ao Pool', async () => {
    await invocacao(async (pool) => {
      await pool.connect()
      await pool.connect()
      await expect(pool.query('select 1')).resolves.toEqual({ rows: [{ via: 'pool' }] })
    })
  })

  it('invocações diferentes não se misturam: o cliente emprestado de uma não recebe consulta da outra', async () => {
    const Pool = criaPoolPorRequisicao(Base, atual)
    const fachada = new Pool({ max: 1 }) as unknown as PoolFalso
    const a = { identidade: {}, connectionString: 'postgres://fixture' }
    const b = { identidade: {}, connectionString: 'postgres://fixture' }
    const cliente = (await contexto.run(a, () => fachada.connect())) as unknown as ClienteFalso
    await expect(contexto.run(b, () => fachada.query('select de b'))).resolves.toEqual({ rows: [{ via: 'pool' }] })
    expect(cliente.consultas).toEqual([])
  })
})

/** Cliente do pg com a `Connection` que informa o estado da transação a cada `readyForQuery`. */
class ClienteComConexao {
  consultas: unknown[] = []
  soltou = 0
  connection = new EventEmitter()
  constructor(private readonly falha: (sql: unknown) => boolean = () => false) {}
  async query(...args: unknown[]) {
    this.consultas.push(args[0])
    await new Promise((r) => setTimeout(r, 0))
    if (args[0] === 'begin') this.connection.emit('readyForQuery', { status: 'T' })
    if (this.falha(args[0])) throw new Error(`falhou: ${String(args[0])}`)
    return { rows: [{ via: 'cliente' }] }
  }
  release() { this.soltou++ }
}
const comCliente = async (cliente: ClienteComConexao, f: (pool: PoolFalso) => Promise<void>) => {
  PoolFalso.proximoCliente = () => cliente as unknown as ClienteFalso
  try { await invocacao(async (pool) => f(pool)) } finally { PoolFalso.proximoCliente = undefined }
}

describe('pool da invocação: consulta desviada numa transação roda num SAVEPOINT', () => {
  it('sucesso: SAVEPOINT, a consulta e RELEASE, nessa ordem, no cliente da transação', async () => {
    const cliente = new ClienteComConexao()
    await comCliente(cliente, async (pool) => {
      const tx = (await pool.connect()) as unknown as ClienteComConexao
      await tx.query('begin')
      await expect(pool.query('select 1', [])).resolves.toEqual({ rows: [{ via: 'cliente' }] })
      const [, savepoint, consulta, release] = cliente.consultas as string[]
      expect(cliente.consultas[0]).toBe('begin')
      expect(savepoint).toMatch(/^SAVEPOINT cms_core_consulta_solta_\d+$/)
      expect(consulta).toBe('select 1')
      expect(release).toBe(savepoint!.replace('SAVEPOINT', 'RELEASE SAVEPOINT'))
    })
  })

  it('falha: ROLLBACK TO SAVEPOINT devolve a transação, e o erro da consulta chega a quem chamou', async () => {
    const cliente = new ClienteComConexao((sql) => sql === 'select * from opcional')
    await comCliente(cliente, async (pool) => {
      const tx = (await pool.connect()) as unknown as ClienteComConexao
      await tx.query('begin')
      await expect(pool.query('select * from opcional')).rejects.toThrow('falhou: select * from opcional')
      const [, savepoint, , volta] = cliente.consultas as string[]
      expect(volta).toBe(savepoint!.replace('SAVEPOINT', 'ROLLBACK TO SAVEPOINT'))
      tx.release()
      expect(cliente.soltou).toBe(1)
      expect(cliente.connection.listenerCount('readyForQuery')).toBe(0)
    })
  })

  it('fora de transação (monitor do bootstrap), a consulta vai ao cliente sem SAVEPOINT', async () => {
    const cliente = new ClienteComConexao()
    await comCliente(cliente, async (pool) => {
      await pool.connect()
      cliente.connection.emit('readyForQuery', { status: 'I' })
      await pool.query('select 1')
      expect(cliente.consultas).toEqual(['select 1'])
    })
  })
})

describe('pool da invocação: ouvinte de error', () => {
  it('o fechamento pedido pelo próprio pg (cliente _ending) não vira exceção nem log', async () => {
    await invocacao(async (pool, real) => {
      await pool.query('select 1') // cria o Pool da invocação
      expect(real().listenerCount('error')).toBe(1)
      const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(() => real().emit('error', new TypeError('This socket has been closed.'), { _ending: true })).not.toThrow()
      expect(aviso).not.toHaveBeenCalled()
      aviso.mockRestore()
    })
  })

  it('outra queda de cliente ocioso não derruba o processo: vira aviso no log', async () => {
    await invocacao(async (pool, real) => {
      await pool.query('select 1')
      const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(() => real().emit('error', new Error('Network connection lost.'), { _ending: false })).not.toThrow()
      expect(aviso).toHaveBeenCalledTimes(1)
      expect(JSON.parse(aviso.mock.calls[0]![0] as string)).toEqual({
        level: 'warn',
        msg: 'pg: cliente ocioso do pool caiu (o pool já o descartou)',
        err: 'Network connection lost.',
      })
      aviso.mockRestore()
    })
  })
})
