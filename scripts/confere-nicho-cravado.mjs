/**
 * PRD 14 D4 — nenhum nicho de tenant cravado no código do site.
 *
 * O defeito que esta trava impede já aconteceu: "de software e hospedagem" estava escrito
 * em três arquivos do site e saía inteiro no `<title>` da home, no manifest e no
 * `.well-known/mcp.json` do tenant 3d, que vende impressão 3D. Não quebrou build, não
 * quebrou teste e não quebrou layout — ficou no ar, na aba do navegador e na SERP.
 *
 * É a mesma regra de `confere-cor-cravada`: o multi-tenant só é multi-tenant enquanto o
 * que distingue um tenant do outro mora na coleção `tenants`. Marca já era dado; cor já era
 * dado; nicho passou a ser (`tenants.nicho`, consumido por `lib/nicho.ts`).
 *
 * O que a trava procura: o nome dos nichos que os tenants declaram hoje, em qualquer
 * arquivo de código do site. A lista sai do `seed.ts` — nicho novo entra sozinho, sem
 * ninguém precisar lembrar de registrar aqui.
 *
 * O que passa e por quê:
 *  - `packages/editorial/src/lib/nicho.ts`: é o módulo que RESOLVE o nicho, e os
 *    exemplos de doc e as fixtures do teste precisam citar um nicho concreto.
 *  - comentário: comentário explica, não é emitido em nenhuma página.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const raiz = new URL('..', import.meta.url).pathname
const ONDE = ['packages', 'apps']

/** O módulo do nicho e o teste dele citam nicho de propósito — é o assunto deles. */
const LIBERADOS = ['packages/editorial/src/lib/nicho.ts', 'apps/referencia-cms/src/seed.ts']

function arquivos(dir) {
  const saida = []
  let itens
  try {
    itens = readdirSync(dir)
  } catch {
    return saida
  }
  for (const nome of itens) {
    if (nome === 'node_modules' || nome === 'dist') continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho))
    else if (/\.(ts|tsx|astro|mts)$/.test(nome)) saida.push(caminho)
  }
  return saida
}

/**
 * Os nichos gravados no seed — a mesma fonte que popula o banco. Ler daqui em vez de
 * manter uma lista própria é o que faz a trava cobrir o tenant que ainda vai existir.
 */
function nichosDoSeed() {
  const txt = readFileSync(join(raiz, 'apps/referencia-cms/src/seed.ts'), 'utf8')
  const achados = [...txt.matchAll(/\bnicho:\s*'([^']+)'/g)].map((m) => m[1].trim())
  return [...new Set(achados)].filter((n) => n.length >= 4)
}

/**
 * Tira comentários antes de procurar o literal, PRESERVANDO as quebras de linha — senão o
 * número que a mensagem de erro mostra não é o número do arquivo, e a trava manda quem for
 * consertar para a linha errada.
 */
const semComentarios = (txt) =>
  txt
    .replace(/\/\*[\s\S]*?\*\//g, (bloco) => bloco.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const nichos = nichosDoSeed()
if (nichos.length === 0) {
  console.error('confere-nicho-cravado: nenhum `nicho:` encontrado em apps/referencia-cms/src/seed.ts — a trava ficaria cega')
  process.exit(1)
}

const problemas = []
for (const base of ONDE) {
  for (const arq of arquivos(join(raiz, base))) {
    const rel = relative(raiz, arq)
    if (LIBERADOS.includes(rel)) continue
    const linhas = semComentarios(readFileSync(arq, 'utf8')).split('\n')
    linhas.forEach((linha, i) => {
      for (const nicho of nichos) {
        if (linha.includes(nicho)) problemas.push(`${rel}:${i + 1} — nicho "${nicho}" cravado no código`)
      }
    })
  }
}

if (problemas.length) {
  console.error('Nicho de tenant cravado no site (PRD 14 D4) — leia de `tenants.nicho` via `lib/nicho.ts`:\n')
  for (const p of problemas) console.error(`  ${p}`)
  console.error('\nO tenant 3d vende impressão 3D. Frase de nicho no código vaza para ele inteira.')
  process.exit(1)
}

console.log(`confere-nicho-cravado: ok (${nichos.length} nichos conferidos em ${ONDE.join(', ')})`)
