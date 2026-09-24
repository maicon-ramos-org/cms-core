/**
 * `pnpm confere:schema` — mudou coleção no núcleo ou no plugin sem migração no site de
 * referência? Reprova e mostra o SQL que faltou (`confereSchema`, ADR-0006).
 */
import './env'

import path from 'node:path'

import { confereSchema, mantemVivo, sair } from '@maicon-ramos-org/cms-core'

const encerra = mantemVivo()

const run = async (): Promise<number> =>
  confereSchema({
    diretorio: path.resolve(process.cwd(), 'src/migrations'),
    config: (await import('../payload.config')).default,
  })

run()
  .then(async (codigo) => {
    encerra()
    if (codigo !== 0) console.error('Rode `pnpm --filter @maicon-ramos-org/referencia-cms migrate:create <nome>` e commite a migração.')
    await sair(codigo)
  })
  .catch(async (err: unknown) => {
    encerra()
    console.error(err)
    await sair(1)
  })
