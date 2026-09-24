/**
 * `editorial({ config })` — o tema editorial no `astro.config` do site (PRD 17 RF3).
 *
 * Por enquanto (RF3b) ele traz o middleware — tenant pelo Host, barra final, negociação de
 * markdown — e as bibliotecas de `@runzos/editorial/lib/*`. As rotas e os componentes
 * entram nas fatias seguintes, pelo mesmo `temaAstro`.
 */
import { fileURLToPath } from 'node:url'

import type { AstroIntegration } from 'astro'

import type { ConfigDoEditorial } from './config'
import { temaAstro } from './tema'

export interface OpcoesEditorial {
  config: ConfigDoEditorial
}

export function editorial({ config }: OpcoesEditorial): AstroIntegration {
  return temaAstro(
    {
      nome: 'editorial',
      rotas: [],
      componentes: {},
      middleware: fileURLToPath(new URL('./middleware.ts', import.meta.url)),
    },
    { config },
  )
}
