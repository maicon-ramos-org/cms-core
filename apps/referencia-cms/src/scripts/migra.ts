/**
 * `pnpm migrate` — o portão de migração do núcleo (`portaoDeMigracao`): aplica as migrações
 * e CONFERE no banco que todas foram aplicadas; sai != 0 se faltar alguma.
 */
import './env'

import path from 'node:path'

import { mantemVivo, portaoDeMigracao, sair } from '@maicon-ramos-org/cms-core'
import type { Migration } from 'payload'

const encerra = mantemVivo()

const run = async (): Promise<number> =>
  portaoDeMigracao({
    diretorio: path.resolve(process.cwd(), 'src/migrations'),
    config: (await import('../payload.config')).default,
    migrations: (await import('../migrations')).migrations as unknown as Migration[],
  })

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
