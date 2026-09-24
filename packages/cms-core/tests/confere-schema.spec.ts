/**
 * `confereSchemaNoPayload` — a trava do ADR-0006 (coleção mudou sem migration = CI
 * vermelho), agora dentro do processo. O passo antigo chamava o CLI `payload
 * migrate:create` e procurava a frase "No schema changes detected" na saída; o CLI saiu
 * calado três vezes no CI (#65, #69, #85) e a trava reprovou sem motivo.
 *
 * A regra aqui não depende de frase nem de código de saída: o `createMigration` do Payload
 * roda contra uma CÓPIA da pasta de migrações, e o que decide é se ele escreveu arquivo
 * novo nela. O Payload de mentira reproduz os caminhos que o 3.88 tem.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { confereSchemaNoPayload } from '../src/scripts/confere-schema'

let pasta: string
beforeEach(() => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'migracoes-'))
  fs.writeFileSync(path.join(pasta, '20260101_000000_inicial.ts'), '// up\n')
  fs.writeFileSync(path.join(pasta, '20260101_000000_inicial.json'), '{}')
  fs.writeFileSync(path.join(pasta, 'index.ts'), 'export const migrations = []\n')
})
afterEach(() => {
  fs.rmSync(pasta, { recursive: true, force: true })
  vi.restoreAllMocks()
})

type Criar = (dir: string) => Promise<void>

const payloadCom = (criar: Criar) => {
  const db = {
    migrationDir: '/pasta/original/do/adapter',
    createMigration: async function (this: { migrationDir: string }) {
      await criar(this.migrationDir)
    },
  }
  return { payload: { db } as never, db }
}

const semLog = () => {
  const saida: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...a) => void saida.push(a.join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...a) => void saida.push(a.join(' ')))
  return saida
}

describe('confereSchemaNoPayload', () => {
  it('sem mudança (o Payload 3.88 chama process.exit(0) com skipEmpty): passa', async () => {
    const saida = semLog()
    const { payload } = payloadCom(async () => {
      process.exit(0)
    })
    expect(await confereSchemaNoPayload(payload, pasta)).toBe(0)
    expect(saida.join('\n')).toContain('schema em dia')
  })

  it('sem mudança e sem exit (se uma versão futura só retornar): passa igual', async () => {
    semLog()
    const { payload } = payloadCom(async () => {})
    expect(await confereSchemaNoPayload(payload, pasta)).toBe(0)
  })

  it('com mudança: reprova, mostra o SQL que faltou e não toca a pasta do repo', async () => {
    const saida = semLog()
    const { payload } = payloadCom(async (dir) => {
      fs.writeFileSync(path.join(dir, '20260924_000000_confere_schema.json'), '{}')
      fs.writeFileSync(
        path.join(dir, '20260924_000000_confere_schema.ts'),
        'export async function up() {\n  await db.execute(sql`ALTER TABLE "lojas" ADD COLUMN "novo" varchar;`)\n}\n',
      )
      process.exit(0) // mesmo que o Payload encerrasse depois de escrever, o arquivo decide
    })
    expect(await confereSchemaNoPayload(payload, pasta)).toBe(1)
    expect(saida.join('\n')).toContain('ALTER TABLE "lojas" ADD COLUMN "novo"')
    expect(fs.readdirSync(pasta).sort()).toEqual(['20260101_000000_inicial.json', '20260101_000000_inicial.ts', 'index.ts'])
  })

  it('o Payload lança: reprova — não saber é reprovar', async () => {
    const saida = semLog()
    const { payload } = payloadCom(async () => {
      throw new Error('drizzle-kit ausente')
    })
    expect(await confereSchemaNoPayload(payload, pasta)).toBe(1)
    expect(saida.join('\n')).toContain('drizzle-kit ausente')
  })

  it('o Payload tenta sair com código diferente de 0: reprova', async () => {
    semLog()
    const { payload } = payloadCom(async () => {
      process.exit(1)
    })
    expect(await confereSchemaNoPayload(payload, pasta)).toBe(1)
  })

  it('o gerador trabalha na cópia e o adapter volta a apontar para a pasta dele', async () => {
    semLog()
    let vista = ''
    const { payload, db } = payloadCom(async (dir) => {
      vista = dir
      expect(fs.readdirSync(dir)).toContain('20260101_000000_inicial.json')
    })
    await confereSchemaNoPayload(payload, pasta)
    expect(vista).not.toBe(pasta)
    expect(fs.existsSync(vista)).toBe(false)
    expect(db.migrationDir).toBe('/pasta/original/do/adapter')
  })
})
