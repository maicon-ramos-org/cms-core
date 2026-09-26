import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getPayload } from 'payload'
import { afterEach, expect, it, vi } from 'vitest'
import { cmsCore } from '../src/fabrica'

afterEach(() => vi.unstubAllEnvs())

it('siteReader desligado mantém schema byte-idêntico; opt-in acrescenta só enum e não contamina config seguinte', async () => {
  vi.stubEnv('PAYLOAD_SECRET', 'reader-schema-fixture')
  const gera = async (siteReader?: boolean) => {
    const pasta = mkdtempSync(join(tmpdir(), 'reader-schema-'))
    const config = await cmsCore({ raiz: pasta, pastaDeMigracoes: pasta, sharp: null, logger: { options: { level: 'silent' } }, ...(siteReader === undefined ? {} : { siteReader }),
      midia: { r2: { bucket: 'fixture', endpoint: 'https://bucket.invalid', publicBase: 'https://media.invalid', credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' } } },
      plugins: [c => ({ ...c, typescript: { ...c.typescript, autoGenerate: false } })],
    })
    const payload = await getPayload({ config, key: pasta, disableDBConnect: true, disableOnInit: true })
    await payload.db.createMigration({ migrationName: 'inicial', payload, forceAcceptWarning: true, skipEmpty: true })
    const arquivo = readdirSync(pasta).find(f => f.endsWith('_inicial.ts'))!
    return readFileSync(join(pasta, arquivo), 'utf8')
  }
  const antes = await gera()
  const ligado = await gera(true)
  expect(ligado).toContain("'sistema', 'site-reader'")
  expect(ligado.replace("'sistema', 'site-reader'", "'sistema'")).toBe(antes)
  expect(await gera(false)).toBe(antes)
  expect(await gera()).toBe(antes)
}, 60_000)
