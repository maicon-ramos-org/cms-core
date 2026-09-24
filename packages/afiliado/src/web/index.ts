/**
 * A entrada `web` do plugin de afiliado (PRD 17 RF3e): `afiliado({ config })` no
 * `astro.config` do site injeta as rotas de oferta, loja, cupom e produto — menos as que o
 * site já tiver em `src/pages` (o mesmo `temaAstro` do tema editorial, do qual o plugin
 * depende: o layout, o middleware e as ferramentas WebMCP são do tema).
 *
 * O que o plugin acrescenta às rotas DO TEMA (links do corpo, mapa do site, busca,
 * `llms.txt`) entra por `@maicon-ramos-org/afiliado/web/extensao`, listado em
 * `editorial({ extensoes })`.
 */
import { fileURLToPath } from 'node:url'

import { temaAstro } from '@maicon-ramos-org/editorial'
import type { AstroIntegration } from 'astro'

import type { ConfigDoAfiliado } from './config'

const doPacote = (caminho: string): string => fileURLToPath(new URL(caminho, import.meta.url))

const ROTAS = [
  // o redirect de afiliado: todo link de loja do site passa por aqui (nunca link cru no HTML)
  ['/r/[id]', './rotas/r/[id].ts'],
  ['/api/cupom/[id]', './rotas/api/cupom/[id].ts'],
  ['/cupom-[loja]', './rotas/cupom-[loja].astro'],
  ['/ofertas', './rotas/ofertas/index.astro'],
  ['/ofertas/[slug]', './rotas/ofertas/[slug].astro'],
  ['/ofertas/[slug].md', './rotas/ofertas/[slug].md.ts'],
  ['/empresa/[slug]', './rotas/empresa/[slug].astro'],
  ['/p/[slug]', './rotas/p/[slug].astro'],
  ['/p/[slug].md', './rotas/p/[slug].md.ts'],
  ['/categoria-oferta/[...caminho]', './rotas/categoria-oferta/[...caminho].astro'],
].map(([pattern, arquivo]) => ({ pattern: pattern!, entrypoint: doPacote(arquivo!) }))

export interface OpcoesAfiliado {
  config?: ConfigDoAfiliado
}

export function afiliado({ config = {} }: OpcoesAfiliado = {}): AstroIntegration {
  return temaAstro({ nome: 'afiliado', rotas: ROTAS, componentes: {} }, { config })
}

export type { ConfigDoAfiliado }
