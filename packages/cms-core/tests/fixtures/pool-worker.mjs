import { AsyncLocalStorage } from 'node:async_hooks'
import pg from 'pg'
import { criaPoolPorRequisicao, poolPostgresPorRequisicao } from '../../src/db/pool-por-requisicao.ts'

const contexto = new AsyncLocalStorage()
const atual = () => {
  const c = contexto.getStore()
  if (!c) throw new Error('sem contexto')
  return c
}
const Pool = criaPoolPorRequisicao(pg.Pool, atual)
let facade, global, bootstrap
let concluidos = 0
const dados = () => ({ total: facade.totalCount, idle: facade.idleCount, waiting: facade.waitingCount })

export default {
  fetch(request, env, ctx) {
    return contexto.run({ identidade: ctx, connectionString: env.HYPERDRIVE.connectionString }, async () => {
      const opcoes = { connectionString: env.HYPERDRIVE.connectionString, maxUses: 1, application_name: env.PROBE_NAME }
      facade ??= new Pool(opcoes)
      const path = new URL(request.url).pathname
      if (path === '/global') {
        global ??= new pg.Pool(opcoes)
        await global.query('SELECT 1, pg_sleep(0.25)')
      } else if (path === '/transaction' || path === '/rollback') {
        const client = await facade.connect()
        try {
          await client.query('BEGIN')
          await client.query('SELECT 1, pg_sleep(0.025)')
          if (path === '/rollback') throw new Error('rollback de teste')
          await client.query('COMMIT')
        } catch (e) {
          await client.query('ROLLBACK')
          if (path !== '/rollback') throw e
        } finally { client.release() }
      } else if (path === '/callback') {
        await new Promise((resolve, reject) => facade.connect((erro, cliente, release) => {
          if (erro) return reject(erro)
          cliente.query('SELECT 1', (falha) => { release(falha); falha ? reject(falha) : resolve() })
        }))
      } else if (path === '/batch') {
        await Promise.all(Array.from({ length: 12 }, () => facade.query('SELECT 1, pg_sleep(0.025)')))
      } else if (path === '/error') {
        try { await facade.query('SELECT coluna_inexistente_da_fixture') } catch { /* erro de query seguido de retry */ }
        await facade.query('SELECT 1')
      } else if (path === '/end') {
        await facade.query('SELECT 1')
        await facade.end()
        let recusou = false
        try { await facade.query('SELECT 1') } catch { recusou = true }
        return Response.json({ recusou })
      } else if (path === '/bootstrap') {
        if (!bootstrap) {
          const config = poolPostgresPorRequisicao(atual)({ db: { init: () => ({
            name: 'postgres', pg, poolOptions: opcoes,
            async connect() { this.pool = new this.pg.Pool(this.poolOptions); await this.pool.connect() },
          }) } })
          bootstrap = config.db.init({})
          await bootstrap.connect()
        }
        await bootstrap.pool.query('SELECT 1')
        return Response.json({ total: bootstrap.pool.totalCount, waiting: bootstrap.pool.waitingCount })
      } else if (path === '/background') {
        ctx.waitUntil(facade.query('SELECT 1, pg_sleep(0.1)').then(() => { concluidos++ }))
        return Response.json({ iniciado: true })
      } else if (path === '/background-done') {
        return Response.json({ concluidos })
      } else if (path === '/abandonado') {
        const cliente = await facade.connect()
        await cliente.query('BEGIN')
        // Cliente deliberadamente abandonado: prova o cleanup nativo no EOF.
        return new Response('fim')
      } else if (path === '/cancelado') {
        const cliente = await facade.connect()
        await cliente.query('BEGIN')
        return new Response(new ReadableStream({
          async start(controller) {
            controller.enqueue(new TextEncoder().encode('inicio'))
            // I/O em andamento quando o consumidor cancela o corpo. Sem release
            // propositalmente: o runtime deve encerrar também esta invocação.
            try { await cliente.query('SELECT pg_sleep(0.1)'); controller.close() }
            catch { /* desconexão deliberada da fixture */ }
          },
        }))
      } else {
        await facade.query('SELECT 1, pg_sleep(0.025)')
      }
      return Response.json(dados())
    })
  },
}
