/**
 * A trava do ADR-0006: coleção que mudou sem migration não passa do CI. O `schema` que as
 * coleções geram hoje é comparado com o último retrato (`.json`) da pasta de migrações —
 * se houver diferença, falta migration.
 *
 * DENTRO DO PROCESSO (2026-09-24), e não mais pelo CLI `payload migrate:create`. O passo
 * antigo procurava a frase "No schema changes detected" na saída do CLI, e o CLI saiu
 * calado três vezes no CI (#65, #69, #85): sem frase, a trava reprovou um schema que estava
 * em dia. É o mesmo defeito que o portão de migração já resolveu (`portao.ts`, `sair.ts`).
 *
 * A regra não depende de frase nem de código de saída. O `createMigration` do Payload — o
 * mesmo caminho do CLI — roda contra uma CÓPIA da pasta de migrações, e decide o que ficou
 * nela: arquivo novo é migration faltando. Sem arquivo novo, o schema está em dia, tenha o
 * Payload retornado ou chamado `process.exit(0)` (é o que o 3.88 faz com `skipEmpty`).
 * Qualquer outro fim — erro, `exit` com outro código — reprova: não saber é reprovar.
 *
 * Quem chama segura o event loop (`mantemVivo`) e encerra com `sair`.
 */
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { Payload, SanitizedConfig } from 'payload'

import { SaidaInesperada, semSaidaDoProcesso } from './sair'

type AdapterComMigracao = {
  migrationDir: string
  createMigration: (args: { migrationName: string; payload: Payload; skipEmpty: boolean }) => Promise<void>
}

/** Confere sobre um Payload já aberto. Devolve o código de saída. */
export async function confereSchemaNoPayload(payload: Payload, diretorio: string): Promise<number> {
  const db = payload.db as unknown as AdapterComMigracao
  const copia = mkdtempSync(path.join(os.tmpdir(), 'confere-schema-'))
  const original = db.migrationDir
  try {
    cpSync(diretorio, copia, { recursive: true })
    const antes = new Set(readdirSync(copia))
    db.migrationDir = copia

    let problema: string | null = null
    try {
      await semSaidaDoProcesso(() => db.createMigration({ migrationName: 'confere_schema', payload, skipEmpty: true }))
    } catch (err: unknown) {
      if (!(err instanceof SaidaInesperada && err.codigo === 0)) {
        problema =
          err instanceof SaidaInesperada
            ? `o Payload tentou encerrar o processo (process.exit(${String(err.codigo)}))`
            : `o Payload lançou: ${String(err)}`
      }
    }

    const novos = readdirSync(copia).filter((f) => !antes.has(f) && f !== 'index.ts')
    if (novos.length > 0) {
      console.error('\nFALHA: as coleções mudaram e falta migration (ADR-0006). O que ela teria:\n')
      for (const f of novos.filter((n) => n.endsWith('.ts'))) console.error(readFileSync(path.join(copia, f), 'utf8'))
      return 1
    }
    if (problema) {
      console.error(`\nFALHA: não deu para conferir o schema — ${problema}.\n`)
      return 1
    }
    console.log('ok — schema em dia com as migrations.')
    return 0
  } finally {
    db.migrationDir = original
    rmSync(copia, { recursive: true, force: true })
  }
}

/**
 * Abre o Payload do site e confere. `PAYLOAD_MIGRATING` é o que o CLI de migração do
 * Payload liga: com ele, abrir o Payload nunca faz `push` do schema no banco.
 */
export async function confereSchema({
  config,
  diretorio,
}: {
  config: SanitizedConfig | Promise<SanitizedConfig>
  diretorio: string
}): Promise<number> {
  process.env.PAYLOAD_MIGRATING = 'true'
  const { getPayload } = await import('payload')
  const payload = await getPayload({ config, disableOnInit: true })
  try {
    return await confereSchemaNoPayload(payload, diretorio)
  } finally {
    await payload.destroy()
  }
}
