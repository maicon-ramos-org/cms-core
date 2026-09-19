/**
 * Portão de migração — `pnpm migrate` do compose passa por aqui (incidente de 2026-09-19).
 *
 * O QUE ACONTECEU. O deploy das 02:28 subiu o CMS novo contra um banco sem a coluna
 * `tenants.nicho`. runzos.com e 3d.runzos.com deram 404 ("Tenant não encontrado para este
 * host") por 32 minutos e `/api/tenants` respondeu 500. O grave não é a migração ter
 * falhado: é o container `migrate` ter SAÍDO COM CÓDIGO 0. O `cms` depende dele com
 * `service_completed_successfully` (infra/compose.yml), então subiu logo atrás, saudável,
 * sem schema. Um migrate que sai 0 sem aplicar é pior que um que quebra: ele AUTORIZA o
 * passo seguinte.
 *
 * ONDE ESTÁ O EXIT 0. Não é `set -e` faltando nem promise não-aguardada: é o próprio
 * caminho feliz do Payload 3.88, que tem três saídas com código 0 e ZERO migration
 * aplicada — todas lidas em `node_modules`, não supostas:
 *
 *  1. `payload/dist/database/migrations/readMigrationFiles.js`: diretório de migration
 *     inexistente vira `logger.error` + `return []`. Em seguida, `@payloadcms/drizzle`
 *     (`dist/migrate.js`): `if (!migrationFiles.length) { logger.info('No migrations to
 *     run.'); return }`. Erro no log, sucesso no exit code.
 *  2. mesmo `dist/migrate.js`: se existir linha com `batch === -1` em `payload_migrations`
 *     (rastro de `push` em dev, ADR-0006), ele ABRE UM PROMPT interativo perguntando se
 *     pode continuar. Num container não há TTY: o `prompts` cancela na hora e o
 *     `onCancel` chama `process.exit(0)`. Pergunta que ninguém viu, respondida com
 *     "não", anunciada como sucesso.
 *  3. `readMigrationFiles` só enxerga arquivo que o `readdirSync` devolve. Imagem que
 *     perdeu `src/migrations` no build cai no caso 1 sem nenhum sinal.
 *
 * O CONSERTO NÃO É CORRIGIR ESSES TRÊS. É PARAR DE CONFIAR NO EXIT CODE. Este portão roda
 * o `payload migrate` e, depois, CONFERE A PÓS-CONDIÇÃO no banco: toda migration que
 * existe em `src/migrations` tem linha em `payload_migrations`. A invariante vale porque
 * o `runMigrationFile` do `@payloadcms/drizzle` grava essa linha DENTRO da mesma transação
 * do DDL — linha presente e DDL aplicado commitam juntos ou não commitam. Falhou a
 * conferência, sai != 0, `service_completed_successfully` reprova e o `cms` NÃO SOBE.
 *
 * Funciona para qualquer causa de falha, inclusive as que ainda não aconteceram: o portão
 * não sabe por que faltou, só que faltou.
 *
 * `pnpm --filter @runzos/cms migrate`
 */
import './env'

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { mantemVivo, sair } from './sair'

const encerra = mantemVivo()

/**
 * A MESMA regra do `findMigrationDir`/`readMigrationFiles` do Payload — de propósito. Se a
 * lista daqui divergisse da que ele roda, o portão conferiria outra coisa.
 */
const DIRETORIO = path.resolve(process.cwd(), 'src/migrations')
const IGNORADOS = new Set(['index.ts', 'index.js'])

const migrationsNoRepo = (): string[] =>
  readdirSync(DIRETORIO)
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.js')) && !IGNORADOS.has(f))
    .map((f) => path.basename(f).split('.')[0] as string)
    .sort()

/** Nomes já gravados em `payload_migrations`, e o rastro de `push` se houver. */
const migrationsNoBanco = async (): Promise<{ nomes: Set<string>; push: boolean }> => {
  const { getPayload } = await import('payload')
  const config = (await import('../payload.config')).default
  const payload = await getPayload({ config, disableOnInit: true })
  try {
    const { docs } = await payload.find({ collection: 'payload-migrations', limit: 0, pagination: false })
    return {
      nomes: new Set(docs.map((d) => String(d.name ?? ''))),
      push: docs.some((d) => Number(d.batch) === -1),
    }
  } finally {
    await payload.destroy()
  }
}

const run = async (): Promise<number> => {
  if (!existsSync(DIRETORIO)) {
    console.error(`\nFALHA: não existe ${DIRETORIO}.`)
    console.error('O Payload trata isso como "No migrations to run." e sai 0 — esta imagem')
    console.error('está quebrada e NÃO pode liberar o cms.\n')
    return 1
  }

  const esperadas = migrationsNoRepo()
  if (esperadas.length === 0) {
    console.error(`\nFALHA: ${DIRETORIO} não tem nenhuma migration.\n`)
    return 1
  }

  // stdin fechado de propósito: é o que o container tem. Se o Payload abrir o prompt do
  // `batch === -1`, ele cancela e sai 0 — e a conferência abaixo é quem pega.
  const filho = spawnSync('pnpm', ['run', 'migrate:payload'], {
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  if (filho.error) {
    console.error(`\nFALHA ao executar o migrate: ${filho.error.message}\n`)
    return 1
  }

  let nomes: Set<string>
  let push: boolean
  try {
    ;({ nomes, push } = await migrationsNoBanco())
  } catch (err: unknown) {
    // Banco fora, credencial errada, `payload_migrations` inexistente: tudo aqui é
    // "não sei se aplicou", e não saber reprova.
    console.error(`\nFALHA ao conferir as migrations contra o banco: ${String(err)}\n`)
    return 1
  }

  const faltando = esperadas.filter((nome) => !nomes.has(nome))

  if (faltando.length === 0 && filho.status === 0 && !push) {
    console.log(`\nok — ${esperadas.length} migrations do repo estão aplicadas no banco.`)
    return 0
  }

  console.error('\n' + '─'.repeat(72))
  console.error('PORTÃO DE MIGRAÇÃO REPROVOU — o cms não deve subir com este banco.')
  console.error('─'.repeat(72))
  console.error(`\n  payload migrate saiu com código ${filho.status}`)
  console.error(`  migrations no repo:  ${esperadas.length}`)
  console.error(`  aplicadas no banco:  ${esperadas.length - faltando.length}`)

  if (faltando.length > 0) {
    console.error('\n  NÃO aplicadas:')
    for (const nome of faltando) console.error(`    - ${nome}`)
  }
  if (push) {
    console.error('\n  Há linha com batch = -1 em payload_migrations: este banco levou')
    console.error('  `push` em algum momento (ADR-0006). É isso que faz o Payload abrir um')
    console.error('  prompt interativo e SAIR 0 sem aplicar nada quando não há TTY.')
  }
  if (faltando.length === 0 && filho.status !== 0) {
    console.error('\n  Todas aplicadas, mas o migrate saiu != 0 — reprovando por segurança.')
  }
  console.error('')
  return 1
}

run()
  .then(async (codigo) => {
    encerra()
    await sair(codigo)
  })
  .catch(async (err: unknown) => {
    encerra()
    console.error(err)
    await sair(1)
  })
