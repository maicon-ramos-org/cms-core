/**
 * A fábrica de tema como integração Astro (PRD 17 RF3) — o mecanismo que o `editorial` e a
 * entrada `web` dos plugins usam. Um tema é uma lista de rotas e de componentes; o site
 * escolhe o quanto troca, nos três níveis do PRD:
 *
 *  1. token (cor, fonte, logo): dado do tenant, nada aqui;
 *  2. componente: `componentes: { Cabecalho: './src/MeuCabecalho.astro' }` — toda rota do
 *     tema importa o componente por `virtual:<tema>/<Nome>`, e o módulo aponta para o
 *     arquivo do site quando ele existe e para o do pacote quando não;
 *  3. rota: o site escreve a própria página em `src/pages`, e o tema NÃO injeta a dele
 *     (`rotas.ts` conta por que não deixamos o Astro desempatar).
 *
 * O que as rotas do tema precisam saber do site e não é componente (nome do serviço,
 * textos) chega por `virtual:<tema>/config`, com o que o site passou em `config`.
 *
 * É o mesmo mecanismo do Starlight, e existe por uma razão só: o site tem que poder ser
 * visualmente diferente sem bifurcar o pacote.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { AstroIntegration } from 'astro'

import { normalizaPadrao, rotasDoSite } from './rotas'

export interface RotaDoTema {
  /** O padrão, na grafia do `injectRoute` (`/categoria/[slug]`). */
  pattern: string
  /** Caminho absoluto do arquivo da rota, dentro do pacote. */
  entrypoint: string
}

export interface DefinicaoDoTema<C extends string> {
  /** Nome da integração e prefixo dos módulos virtuais (`virtual:<nome>/...`). */
  nome: string
  rotas: RotaDoTema[]
  /** Cada componente substituível → o arquivo padrão, caminho absoluto dentro do pacote. */
  componentes: Record<C, string>
  /** Middleware do tema, caminho absoluto — roda antes do middleware do site. */
  middleware?: string
}

export interface OpcoesDoSite<C extends string> {
  /** Componentes que o site troca: nome → arquivo do site, relativo à raiz dele. */
  componentes?: Partial<Record<C, string>>
  /** O que as rotas do tema leem de `virtual:<nome>/config`. Tem que ser serializável. */
  config?: object
}

export function temaAstro<C extends string>(tema: DefinicaoDoTema<C>, site: OpcoesDoSite<C> = {}): AstroIntegration {
  const prefixo = `virtual:${tema.nome}/`
  const idDaConfig = `\0${prefixo}config`

  return {
    name: tema.nome,
    hooks: {
      'astro:config:setup': ({ config, injectRoute, updateConfig, addMiddleware, logger }) => {
        // nome de componente errado no site é erro de digitação: falha no build, não some
        const arquivos: Record<string, string> = { ...tema.componentes }
        for (const [nome, relativo] of Object.entries(site.componentes ?? {}) as Array<[string, string]>) {
          if (!(nome in tema.componentes)) {
            const validos = Object.keys(tema.componentes).join(', ')
            throw new Error(`[${tema.nome}] componente "${nome}" não existe neste tema (existem: ${validos})`)
          }
          const absoluto = fileURLToPath(new URL(relativo, config.root))
          if (!existsSync(absoluto)) {
            throw new Error(`[${tema.nome}] o componente ${nome} aponta para ${relativo}, que não existe`)
          }
          arquivos[nome] = absoluto
        }

        const doSite = rotasDoSite(fileURLToPath(new URL('pages/', config.srcDir)))
        for (const rota of tema.rotas) {
          if (doSite.has(normalizaPadrao(rota.pattern))) {
            logger.info(`${rota.pattern}: o site tem a própria rota — a do tema fica de fora`)
            continue
          }
          injectRoute({ pattern: rota.pattern, entrypoint: rota.entrypoint })
        }

        if (tema.middleware) addMiddleware({ entrypoint: tema.middleware, order: 'pre' })

        updateConfig({
          vite: {
            plugins: [
              {
                name: `${tema.nome}:virtual`,
                resolveId(id: string) {
                  if (!id.startsWith(prefixo)) return undefined
                  const nome = id.slice(prefixo.length)
                  if (nome === 'config') return idDaConfig
                  // o próprio arquivo .astro: o compilador do Astro o trata como qualquer outro
                  if (nome in arquivos) return arquivos[nome]
                  throw new Error(`[${tema.nome}] ${id} não existe neste tema`)
                },
                load(id: string) {
                  if (id === idDaConfig) return `export default ${JSON.stringify(site.config ?? {})}`
                  return undefined
                },
              },
            ],
          },
        })
      },
    },
  }
}
