/**
 * `semSaidaDoProcesso` — o portão de migração roda o `migrate` do Payload DENTRO do próprio
 * processo, e o `@payloadcms/drizzle` 3.88 chama `process.exit` no meio dele: `exit(0)`
 * quando o prompt do `batch = -1` é cancelado (sem terminal, sempre) e `exit(1)` quando uma
 * migration lança. Com o `exit` de verdade, o portão morreria sem conferir nada — e com 0.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { SaidaInesperada, semSaidaDoProcesso } from '../src/scripts/sair'

const exitOriginal = process.exit

afterEach(() => {
  process.exit = exitOriginal
})

describe('semSaidaDoProcesso', () => {
  it('um process.exit(0) no meio vira erro com o código, e o processo segue vivo', async () => {
    const r = semSaidaDoProcesso(async () => {
      process.exit(0)
    })
    await expect(r).rejects.toBeInstanceOf(SaidaInesperada)
    await expect(r).rejects.toMatchObject({ codigo: 0 })
  })

  it('também o exit(1) de migration que lançou', async () => {
    await expect(
      semSaidaDoProcesso(async () => {
        await Promise.resolve()
        process.exit(1)
      }),
    ).rejects.toMatchObject({ codigo: 1 })
  })

  it('devolve o valor quando ninguém tenta sair', async () => {
    await expect(semSaidaDoProcesso(async () => 42)).resolves.toBe(42)
  })

  it('devolve o process.exit de verdade no fim, tenha dado certo ou não', async () => {
    await semSaidaDoProcesso(async () => 1)
    expect(process.exit).toBe(exitOriginal)
    await semSaidaDoProcesso(async () => process.exit(0)).catch(() => {})
    expect(process.exit).toBe(exitOriginal)
  })
})
