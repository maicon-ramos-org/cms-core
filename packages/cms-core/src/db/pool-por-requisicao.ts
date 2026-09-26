import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Plugin } from 'payload'

type ConstrutorPool = PostgresAdapter['pg']['Pool']
interface Cliente { release(erro?: Error | boolean): void }
type ClientesBootstrap = WeakMap<object, Set<Cliente>>

/** Identidade estável da invocação e conexão de um binding confiável, nunca entrada HTTP. */
export interface ContextoConexaoPostgres {
  identidade: object
  connectionString: string
}
type ObterContexto = () => ContextoConexaoPostgres

function contextoValido(obterContexto: ObterContexto): ContextoConexaoPostgres {
  const contexto = obterContexto()
  if (!contexto || !contexto.identidade || typeof contexto.identidade !== 'object'
    || typeof contexto.connectionString !== 'string' || !contexto.connectionString.trim()) {
    throw new Error('Pool por requisição exige contexto atual e conexão válidos.')
  }
  return contexto
}

/** Interno: Drizzle guarda a fachada; filas/clientes/listeners pertencem à invocação. */
export function criaPoolPorRequisicao(
  PoolOriginal: ConstrutorPool,
  obterContexto: ObterContexto,
  bootstrap: ClientesBootstrap = new WeakMap(),
): ConstrutorPool {
  return class PoolPorRequisicao extends PoolOriginal {
    constructor(opcoes?: ConstructorParameters<ConstrutorPool>[0]) {
      super(opcoes)
      const pools = new WeakMap<object, { pool: InstanceType<ConstrutorPool>; conexao: string }>()
      return new Proxy(this, {
        get: (_alvo, chave, fachada) => {
          const { identidade, connectionString } = contextoValido(obterContexto)
          let entrada = pools.get(identidade)
          if (entrada && entrada.conexao !== connectionString) {
            throw new Error('Pool da mesma requisição não pode trocar de conexão.')
          }
          if (!entrada) {
            entrada = { pool: new PoolOriginal({ ...opcoes, connectionString, maxUses: 1 }), conexao: connectionString }
            pools.set(identidade, entrada)
          }
          const pool = entrada.pool
          const valor = Reflect.get(pool, chave, pool)
          if (typeof valor !== 'function') return valor
          return (...argumentos: unknown[]) => {
            const atual = contextoValido(obterContexto)
            if (atual.identidade !== identidade) throw new Error('Método de Pool pertence a outra requisição.')
            if (atual.connectionString !== connectionString) throw new Error('Pool da mesma requisição não pode trocar de conexão.')
            const emprestados = chave === 'connect' ? bootstrap.get(identidade) : undefined
            const registra = (cliente: Cliente): Cliente => {
              emprestados!.add(cliente)
              const release = cliente.release.bind(cliente)
              cliente.release = (...args) => { emprestados!.delete(cliente); release(...args) }
              return cliente
            }
            if (emprestados && typeof argumentos[0] === 'function') {
              const callback = argumentos[0] as (...args: unknown[]) => void
              argumentos[0] = (erro: unknown, cliente: Cliente | undefined, release: unknown) =>
                callback(erro, cliente ? registra(cliente) : cliente, cliente?.release ?? release)
            }
            const resultado = Reflect.apply(valor, pool, argumentos)
            const promessa = resultado as Promise<Cliente> | undefined
            if (emprestados && typeof promessa?.then === 'function') return promessa.then(registra)
            // EventEmitter.on/once retornam this: não deixar escapar o Pool real.
            return resultado === pool ? fachada : resultado
          }
        },
      })
    }
  }
}

/** Opt-in de plataforma Worker. Sem plugin, driver, fábrica e comportamento Node não mudam. */
export function poolPostgresPorRequisicao(obterContexto: ObterContexto): Plugin {
  return config => {
    const banco = config.db
    if (!banco) throw new Error('Pool por requisição exige adapter PostgreSQL.')
    return { ...config, db: { ...banco, init: args => {
      const adapter = banco.init(args) as PostgresAdapter
      if (adapter.name !== 'postgres' || !adapter.connect) throw new Error('Pool por requisição exige adapter PostgreSQL.')
      if (adapter.readReplicaOptions?.length) throw new Error('Pool por requisição não suporta réplicas: requer conexão única.')
      const bootstrap: ClientesBootstrap = new WeakMap()
      adapter.pg = { ...adapter.pg, Pool: criaPoolPorRequisicao(adapter.pg.Pool, obterContexto, bootstrap) }
      const conectar = adapter.connect.bind(adapter)
      adapter.connect = async opcoes => {
        if (adapter.pool) return conectar(opcoes)
        const { identidade } = contextoValido(obterContexto)
        const clientes = new Set<Cliente>()
        bootstrap.set(identidade, clientes)
        let falhou = true
        try { await conectar(opcoes); falhou = false }
        finally {
          bootstrap.delete(identidade)
          // db-postgres 3.88 reserva um monitor sem release; não vale entre invocações.
          for (const cliente of clientes) cliente.release(falhou)
        }
      }
      return adapter
    } } }
  }
}
