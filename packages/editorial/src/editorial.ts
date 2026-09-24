/**
 * `editorial({ config, componentes })` — o tema editorial no `astro.config` do site
 * (PRD 17 RF3).
 *
 * Traz o middleware (tenant pelo Host, barra final, negociação de markdown), as rotas
 * editoriais que o site não tiver, o layout `@runzos/editorial/componentes/Base.astro` com os
 * componentes que o site pode trocar, e as bibliotecas de `@runzos/editorial/lib/*`.
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
  Ferramentas: doPacote('./componentes/Ferramentas.astro'),
}

/**
 * As rotas do tema. Cada uma só é injetada se o site não tiver a mesma em `src/pages`
 * (nível 3 — `rotas.ts`); a home, por exemplo, quase todo site vai querer a própria.
 */
const ROTAS = [
  ['/', './rotas/index.astro'],
  ['/blog', './rotas/blog.astro'],
  ['/categoria/[slug]', './rotas/categoria/[slug].astro'],
  ['/tag/[slug]', './rotas/tag/[slug].astro'],
  ['/feed.xml', './rotas/feed.xml.ts'],
  ['/robots.txt', './rotas/robots.txt.ts'],
  ['/manifest.webmanifest', './rotas/manifest.webmanifest.ts'],
  ['/healthz', './rotas/healthz.ts'],
  ['/api/contato', './rotas/api/contato.ts'],
  ['/api/revalidate', './rotas/api/revalidate.ts'],
  ['/api/uso-agente', './rotas/api/uso-agente.ts'],
].map(([pattern, arquivo]) => ({ pattern: pattern!, entrypoint: doPacote(arquivo!) }))

export type ComponenteDoEditorial = keyof typeof COMPONENTES

export interface OpcoesEditorial {
  config: ConfigDoEditorial
  /** Componentes que o site troca: nome → arquivo do site, relativo à raiz dele. */
  componentes?: Partial<Record<ComponenteDoEditorial, string>>
}

export function editorial({ config, componentes }: OpcoesEditorial): AstroIntegration {
  return temaAstro(
    { nome: 'editorial', rotas: ROTAS, componentes: COMPONENTES, middleware: doPacote('./middleware.ts') },
    { config, componentes },
  )
}
