/**
 * `editorial({ config, componentes })` — o tema editorial no `astro.config` do site
 * (PRD 17 RF3).
 *
 * Hoje ele traz o middleware (tenant pelo Host, barra final, negociação de markdown), o
 * layout `@runzos/editorial/componentes/Base.astro` com os componentes que o site pode
 * trocar, e as bibliotecas de `@runzos/editorial/lib/*`. As rotas entram nas fatias
 * seguintes, pelo mesmo `temaAstro`.
 */
import { fileURLToPath } from 'node:url'

import type { AstroIntegration } from 'astro'

import type { ConfigDoEditorial } from './config'
import { temaAstro } from './tema'

const doPacote = (caminho: string): string => fileURLToPath(new URL(caminho, import.meta.url))

/** Os componentes que o site pode trocar, cada um com o padrão do tema. */
const COMPONENTES = {
  Cabecalho: doPacote('./componentes/Cabecalho.astro'),
  Rodape: doPacote('./componentes/Rodape.astro'),
  Fontes: doPacote('./componentes/Fontes.astro'),
}

export type ComponenteDoEditorial = keyof typeof COMPONENTES

export interface OpcoesEditorial {
  config: ConfigDoEditorial
  /** Componentes que o site troca: nome → arquivo do site, relativo à raiz dele. */
  componentes?: Partial<Record<ComponenteDoEditorial, string>>
}

export function editorial({ config, componentes }: OpcoesEditorial): AstroIntegration {
  return temaAstro(
    { nome: 'editorial', rotas: [], componentes: COMPONENTES, middleware: doPacote('./middleware.ts') },
    { config, componentes },
  )
}
