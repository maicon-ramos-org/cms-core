/**
 * Portão de migração (ADR-0009): aplica as migrações e CONFERE no banco que todas foram
 * aplicadas. O `pnpm migrate` do site chama `portaoDeMigracao` com a config e as migrações
 * dele (o wrapper do site conta o incidente que deu origem a isto).
 *
 * O risco que o portão fecha: o container `migrate` SAIR COM CÓDIGO 0 sem aplicar nada. O
 * `cms` depende dele com `service_completed_successfully`, então sobe logo atrás, saudável,
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
 * A MIGRAÇÃO RODA DENTRO DESTE PROCESSO (2026-09-23), e não mais pelo CLI `payload
 * migrate`. O CLI saiu duas vezes no CI sem imprimir nada e sem aplicar nada (runs
 * 35853010224 e o `migrate:create` da #69) — o portão reprovou, como devia, mas um deploy
 * reprovado assim é um deploy perdido por nada. A causa provável é a do `sair.ts`: sem
 * terminal, o Node encerra quando o event loop esvazia, e o CLI não o segura. Aqui o
 * `mantemVivo()` segura. Duas armadilhas do `migrate` do `@payloadcms/drizzle` passam a ser
 * tratadas ANTES de acontecer, e não só pegas depois:
 *  - o rastro de `push` (`batch = -1`) é conferido antes; com ele, o Payload abriria um
 *    prompt e chamaria `process.exit(0)` — agora o portão reprova sem chamar o migrate;
 *  - qualquer `process.exit` no meio do migrate vira erro (`semSaidaDoProcesso`), com o
 *    relatório impresso, em vez de encerrar o processo sem conferir nada.
 *
 * Quem chama segura o event loop (`mantemVivo`) e encerra com `sair` — ver o `migra.ts` do site.
 */
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

import type { Migration, Payload, SanitizedConfig } from 'payload'

import { SaidaInesperada, semSaidaDoProcesso } from './sair'

/**
 * A MESMA regra do `findMigrationDir`/`readMigrationFiles` do Payload — de propósito. Se a
 * lista daqui divergisse da que ele roda, o portão conferiria outra coisa.
 */
const IGNORADOS = new Set(['index.ts', 'index.js'])

const migrationsNoRepo = (DIRETORIO: string): string[] =>
  readdirSync(DIRETORIO)
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.js')) && !IGNORADOS.has(f))
    .map((f) => path.basename(f).split('.')[0] as string)
    .sort()

/** Só o que precisamos do pool do adapter — o mesmo recorte do `prova-reaplicacao-enum.ts`. */
type ClienteSQL = { query: (texto: string) => Promise<{ rows: Record<string, unknown>[] }>; release: () => void }

/**
 * Nomes já gravados em `payload_migrations`, e o rastro de `push` se houver. Banco vazio
 * (a tabela nasce com a primeira migration) é "nada aplicado", não erro.
 */
const migrationsNoBanco = async (payload: Payload): Promise<{ nomes: Set<string>; push: boolean }> => {
  const pool = (payload.db as unknown as { pool: { connect: () => Promise<ClienteSQL> } }).pool
  const c = await pool.connect()
  try {
    const { rows } = await c.query("select to_regclass('payload_migrations') is not null as existe")
    if (!rows[0]?.existe) return { nomes: new Set(), push: false }
    const { rows: linhas } = await c.query('select name, batch from payload_migrations')
    return {
      nomes: new Set(linhas.map((l) => String(l.name ?? ''))),
      push: linhas.some((l) => Number(l.batch) === -1),
    }
  } finally {
    c.release()
  }
}

export interface OpcoesDoPortao {
  /** A pasta de migrações do site — a conferência lê os ARQUIVOS dela. */
  diretorio: string
  /** A config do Payload do site. */
  config: SanitizedConfig | Promise<SanitizedConfig>
  /**
   * A lista do `index.ts` que o `migrate:create` mantém. Se um arquivo da pasta faltar nela,
   * ele não roda — e a conferência, que lê a PASTA, reprova.
   */
  migrations: Migration[]
}

/** Aplica e confere. Devolve o código de saída: 0 só se toda migração da pasta está no banco. */
export async function portaoDeMigracao({ diretorio: DIRETORIO, config, migrations }: OpcoesDoPortao): Promise<number> {
  if (!existsSync(DIRETORIO)) {
    console.error(`\nFALHA: não existe ${DIRETORIO}.`)
    console.error('O Payload trata isso como "No migrations to run." e sai 0 — esta imagem')
    console.error('está quebrada e NÃO pode liberar o cms.\n')
    return 1
  }

  const esperadas = migrationsNoRepo(DIRETORIO)
  if (esperadas.length === 0) {
    console.error(`\nFALHA: ${DIRETORIO} não tem nenhuma migration.\n`)
    return 1
  }

  const { getPayload } = await import('payload')
  let payload: Payload
  try {
    payload = await getPayload({ config, disableOnInit: true })
  } catch (err: unknown) {
    console.error(`\nFALHA ao abrir o Payload contra o banco: ${String(err)}\n`)
    return 1
  }

  try {
    return await aplicaEConfere(payload, esperadas, migrations)
  } finally {
    await payload.destroy()
  }
}

const aplicaEConfere = async (
  payload: Payload,
  esperadas: string[],
  migrations: Migration[],
): Promise<number> => {
  // 1. ANTES de migrar: com rastro de `push`, o migrate do Payload abriria um prompt e
  //    chamaria `process.exit(0)`. Não há o que perguntar — reprova aqui.
  let antes: { nomes: Set<string>; push: boolean }
  try {
    antes = await migrationsNoBanco(payload)
  } catch (err: unknown) {
    console.error(`\nFALHA ao ler payload_migrations antes de migrar: ${String(err)}\n`)
    return 1
  }
  if (antes.push) return reprova(esperadas, antes.nomes, { push: true })

  // 2. migra, no mesmo processo. `process.exit` no meio vira erro com o código.
  let erroDoMigrate: string | null = null
  try {
    await semSaidaDoProcesso(() => payload.db.migrate({ migrations }))
  } catch (err: unknown) {
    erroDoMigrate =
      err instanceof SaidaInesperada
        ? `o Payload tentou encerrar o processo no meio do migrate (process.exit(${String(err.codigo)}))`
        : `o migrate lançou: ${String(err)}`
  }

  // 3. a pós-condição, que vale para qualquer causa
  let depois: { nomes: Set<string>; push: boolean }
  try {
    depois = await migrationsNoBanco(payload)
  } catch (err: unknown) {
    // banco fora, credencial errada: tudo aqui é "não sei se aplicou", e não saber reprova
    console.error(`\nFALHA ao conferir as migrations contra o banco: ${String(err)}`)
    if (erroDoMigrate) console.error(`(antes disso, ${erroDoMigrate})`)
    console.error('')
    return 1
  }
  const faltando = esperadas.filter((nome) => !depois.nomes.has(nome))
  if (faltando.length === 0 && !erroDoMigrate && !depois.push) {
    console.log(`\nok — ${esperadas.length} migrations do repo estão aplicadas no banco.`)
    return 0
  }
  return reprova(esperadas, depois.nomes, { push: depois.push, erroDoMigrate })
}

const reprova = (
  esperadas: string[],
  nomes: Set<string>,
  { push, erroDoMigrate }: { push: boolean; erroDoMigrate?: string | null },
): number => {
  const faltando = esperadas.filter((nome) => !nomes.has(nome))
  console.error('\n' + '─'.repeat(72))
  console.error('PORTÃO DE MIGRAÇÃO REPROVOU — o cms não deve subir com este banco.')
  console.error('─'.repeat(72))
  if (erroDoMigrate) console.error(`\n  ${erroDoMigrate}`)
  console.error(`\n  migrations no repo:  ${esperadas.length}`)
  console.error(`  aplicadas no banco:  ${esperadas.length - faltando.length}`)

  if (faltando.length > 0) {
    console.error('\n  NÃO aplicadas:')
    for (const nome of faltando) console.error(`    - ${nome}`)
  }
  if (push) {
    console.error('\n  Há linha com batch = -1 em payload_migrations: este banco levou')
    console.error('  `push` em algum momento (ADR-0006). Com ela, o migrate do Payload abre um')
    console.error('  prompt e SAI 0 sem aplicar nada quando não há terminal — por isso o portão')
    console.error('  reprova antes de chamá-lo.')
  }
  if (faltando.length === 0 && erroDoMigrate) {
    console.error('\n  Todas aplicadas, mas o migrate não terminou limpo — reprovando por segurança.')
  }
  console.error('')
  return 1
}
