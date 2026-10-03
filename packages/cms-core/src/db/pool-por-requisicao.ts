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

/**
 * O `error` que o Pool do `pg` emite para um cliente OCIOSO (já descartado por ele). Num Worker,
 * o socket do `pg-cloudflare` avisa o próprio fechamento como erro (`This socket has been
 * closed.`) — e com `maxUses: 1` todo cliente é fechado depois de cada uso. Sem ouvinte, o
 * `emit('error')` do Pool lança e vira `unhandledRejection`, uma por consulta. O fechamento que
 * o próprio `pg` pediu (`client._ending`) é esperado e fica em silêncio; outra queda de cliente
 * ocioso vira aviso — o Pool já o tirou de circulação, nada a refazer.
 */
export function ouvinteDeErroDoPool(erro: unknown, cliente?: object): void {
  if ((cliente as { _ending?: boolean } | undefined)?._ending) return
  console.warn(JSON.stringify({
    level: 'warn',
    msg: 'pg: cliente ocioso do pool caiu (o pool já o descartou)',
    err: erro instanceof Error ? erro.message : String(erro),
  }))
}

interface ClienteEmprestado extends Cliente {
  query?: (...args: unknown[]) => unknown
  /** A `Connection` do pg: emite `readyForQuery` com o estado da transação ('I', 'T' ou 'E'). */
  connection?: { on?: (evento: string, ouvinte: (msg: { status?: string }) => void) => unknown; off?: (evento: string, ouvinte: (msg: { status?: string }) => void) => unknown }
}
interface PoolBase {
  connect(...args: unknown[]): unknown
  query(...args: unknown[]): unknown
  on(evento: 'error', ouvinte: (erro: Error, cliente: object) => void): unknown
}
interface Emprestimo {
  /** As consultas desviadas para o cliente que ainda não terminaram. */
  emCurso: Set<Promise<unknown>>
  /** Último estado de transação que o servidor informou ('T' = dentro de transação válida). */
  estado?: string
}

let savepoints = 0
/**
 * Roda a consulta desviada num SAVEPOINT da transação do cliente. Se ela falha, o
 * `ROLLBACK TO SAVEPOINT` devolve a transação ao estado de antes: um hook que trata o erro de
 * uma consulta opcional (`try { … } catch {}`) não derruba o COMMIT, como não derrubava quando a
 * consulta ia por outra conexão. Custo: duas idas ao banco a mais por consulta desviada.
 */
async function noSavepoint(cliente: ClienteEmprestado, args: unknown[]): Promise<unknown> {
  const nome = `cms_core_consulta_solta_${++savepoints}`
  // o pg executa na ordem em que recebe: SAVEPOINT, a consulta, e depois RELEASE/ROLLBACK TO
  const marca = cliente.query!(`SAVEPOINT ${nome}`) as Promise<unknown>
  const consulta = cliente.query!(...args) as Promise<unknown>
  consulta.catch(() => undefined) // o erro é tratado abaixo, depois do SAVEPOINT
  const marcou = await marca.then(() => true, () => false)
  try {
    const resultado = await consulta
    // falha no RELEASE (a transação já terminou, num hook que não esperou a consulta) não muda
    // o resultado: o savepoint some no COMMIT
    if (marcou) await (cliente.query!(`RELEASE SAVEPOINT ${nome}`) as Promise<unknown>).catch(() => undefined)
    return resultado
  } catch (erro) {
    if (marcou) await (cliente.query!(`ROLLBACK TO SAVEPOINT ${nome}`) as Promise<unknown>).catch(() => undefined)
    throw erro
  }
}

/**
 * O Pool real de UMA invocação, com duas mudanças sobre o do adapter:
 *
 * 1. **Uma conexão por vez.** Enquanto a invocação tem um (e só um) cliente emprestado em forma
 *    de promessa — a transação do drizzle, que é toda escrita do Payload, ou o monitor do
 *    bootstrap —, a consulta solta do mesmo Pool (`pool.query`, o que o drizzle usa fora de
 *    transação) vai NESSE cliente, em vez de pedir outra conexão. Sem isso, uma escrita precisava
 *    de duas conexões ao mesmo tempo: o BEGIN segura uma até o COMMIT, e no meio dela rodam
 *    consultas sem `req` — o `checkDocumentLockStatus` do próprio Payload (todo PATCH/DELETE pela
 *    REST), LEITURAS de hooks de terceiros sem `req`, e até esta versão o `uniquePorTenant` e o
 *    `slugDeRelacao` do núcleo. Com `max: 1`, ou com o Hyperdrive repartindo o limite de conexões
 *    em shards de UMA conexão, a 2ª consulta esperava uma vaga que só abriria no COMMIT: a
 *    escrita travava até o timeout ("Timed out while waiting for an open slot in the pool." e
 *    500 de ~15 s). O desvio é incondicional (o Hyperdrive não deixa saber, do lado do cliente,
 *    se haveria outra vaga). No mesmo cliente, a consulta entra na fila dele (o `pg` executa uma
 *    por vez) e roda DENTRO da transação — vê o que a escrita já gravou, o que o Payload faria se
 *    recebesse `req`. Quando o cliente está numa transação, a consulta roda num SAVEPOINT
 *    (`noSavepoint`): se ela falhar, a transação continua válida. O cliente só volta ao Pool
 *    depois que as consultas desviadas para ele terminam. Com dois clientes emprestados, não
 *    escolhe: a consulta vai ao Pool, como antes.
 *
 *    Limite: só a consulta SOLTA (`pool.query`) é desviada. Um hook que GRAVA sem `req` abre uma
 *    2ª transação, e o `pool.connect()` dela continua esperando outra conexão; com uma conexão
 *    só, essa escrita ainda trava até o `connectionTimeoutMillis`. Hook que grava dentro de uma
 *    escrita precisa passar `req` (é o que o Payload recomenda, e o que o núcleo faz).
 * 2. **Ouvinte de `error`** (`ouvinteDeErroDoPool`).
 */
export function criaPoolDaInvocacao(Original: ConstrutorPool): ConstrutorPool {
  const Base = Original as unknown as new (opcoes?: unknown) => PoolBase
  const emprestadosDe = new WeakMap<object, Map<ClienteEmprestado, Emprestimo>>()
  const emprestados = (pool: object) => {
    let mapa = emprestadosDe.get(pool)
    if (!mapa) emprestadosDe.set(pool, (mapa = new Map()))
    return mapa
  }
  class PoolDaInvocacao extends Base {
    constructor(opcoes?: unknown) {
      super(opcoes)
      this.on('error', ouvinteDeErroDoPool)
    }

    override connect(...args: unknown[]): unknown {
      // a forma com callback é a do `pool.query` interno do pg-pool: cliente de uma consulta só
      if (typeof args[0] === 'function') return super.connect(...args)
      const resultado = super.connect(...args) as Promise<ClienteEmprestado> | undefined
      if (typeof resultado?.then !== 'function') return resultado
      return resultado.then((cliente) => {
        if (!cliente || typeof cliente.query !== 'function') return cliente
        const emprestimo: Emprestimo = { emCurso: new Set() }
        const anotaEstado = (msg: { status?: string }) => { emprestimo.estado = msg?.status }
        cliente.connection?.on?.('readyForQuery', anotaEstado)
        const mapa = emprestados(this)
        mapa.set(cliente, emprestimo)
        const release = cliente.release
        cliente.release = (erro) => {
          mapa.delete(cliente)
          const devolve = () => {
            cliente.connection?.off?.('readyForQuery', anotaEstado)
            return release.call(cliente, erro)
          }
          if (!emprestimo.emCurso.size) return devolve()
          void Promise.allSettled([...emprestimo.emCurso]).then(devolve)
        }
        return cliente
      })
    }

    override query(...args: unknown[]): unknown {
      const [emprestado, ...outros] = emprestados(this)
      if (!emprestado || outros.length || typeof args[args.length - 1] === 'function') return super.query(...args)
      const [cliente, { emCurso, estado }] = emprestado
      // `Submittable` (cursor/stream) não é promessa: vai direto ao cliente, sem savepoint
      const submittable = typeof (args[0] as { submit?: unknown } | null)?.submit === 'function'
      const consulta = (estado === 'T' && !submittable ? noSavepoint(cliente, args) : cliente.query!(...args)) as Promise<unknown> | undefined
      if (typeof consulta?.then !== 'function') return consulta
      emCurso.add(consulta)
      const tira = () => void emCurso.delete(consulta)
      consulta.then(tira, tira)
      return consulta
    }
  }
  return PoolDaInvocacao as unknown as ConstrutorPool
}

/** Interno: Drizzle guarda a fachada; filas/clientes/listeners pertencem à invocação. */
export function criaPoolPorRequisicao(
  PoolOriginal: ConstrutorPool,
  obterContexto: ObterContexto,
  bootstrap: ClientesBootstrap = new WeakMap(),
): ConstrutorPool {
  const PoolDaInvocacao = criaPoolDaInvocacao(PoolOriginal)
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
            entrada = { pool: new PoolDaInvocacao({ ...opcoes, connectionString, maxUses: 1 }), conexao: connectionString }
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
