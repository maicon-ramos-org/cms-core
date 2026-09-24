/**
 * Gate do gate: confere que TODO pacote do workspace é coberto por `pnpm check`.
 *
 * `pnpm -r typecheck` e `pnpm -r test` percorrem os pacotes, mas quem não declara o
 * script é PULADO em silêncio — some do check sem nada ficar vermelho. Foi assim que um
 * pacote novo pôde escapar. Depender de lembrar de registrar cada pacote falha de novo no
 * próximo; então o check descobre os pacotes sozinho e falha quando acha um descoberto.
 *
 * Exceção é declarada NO PRÓPRIO pacote (`runzos.semTestes`), não numa lista central:
 * assim ela aparece no diff de quem criou o pacote, com o motivo do lado.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const raiz = new URL('..', import.meta.url).pathname
const OBRIGATORIOS = ['typecheck', 'test']

/** Os globs do pnpm-workspace.yaml — todos no formato `dir/*`, que é o que o repo usa. */
function pastasDoWorkspace() {
  const yaml = readFileSync(join(raiz, 'pnpm-workspace.yaml'), 'utf8')
  const globs = [...yaml.matchAll(/^\s*-\s*['"]?([^'"\s#]+)['"]?\s*$/gm)].map((m) => m[1])
  const pastas = []
  for (const glob of globs) {
    if (!glob.endsWith('/*')) {
      pastas.push(join(raiz, glob))
      continue
    }
    const pai = join(raiz, glob.slice(0, -2))
    if (!existsSync(pai)) continue
    for (const nome of readdirSync(pai, { withFileTypes: true })) {
      if (nome.isDirectory() && existsSync(join(pai, nome.name, 'package.json'))) pastas.push(join(pai, nome.name))
    }
  }
  return pastas
}

/** `echo ...` passa verde sem rodar nada: é pior que não ter script, porque mente. */
const ehFingido = (cmd) => /^\s*(echo|true|exit\s+0|:)\b/.test(cmd ?? '')

const problemas = []
const pastas = pastasDoWorkspace()
for (const pasta of pastas) {
  const pkg = JSON.parse(readFileSync(join(pasta, 'package.json'), 'utf8'))
  const onde = relative(raiz, pasta)
  const scripts = pkg.scripts ?? {}
  for (const script of OBRIGATORIOS) {
    if (!scripts[script]) {
      problemas.push(`${onde} (${pkg.name}) não declara "${script}" — pnpm -r pula em silêncio`)
      continue
    }
    if (script === 'test' && ehFingido(scripts[script]) && !pkg.runzos?.semTestes) {
      problemas.push(
        `${onde} (${pkg.name}) tem "test" que não roda nada. Se é intencional, declare o` +
          ` motivo em "runzos": { "semTestes": "..." } no package.json.`,
      )
    }
  }
}

if (problemas.length) {
  console.error(`cobertura do check: ${problemas.length} problema(s)\n`)
  for (const p of problemas) console.error(`  - ${p}`)
  console.error('\nUm pacote fora do check é um pacote sem gate. Corrija antes de commitar.')
  process.exit(1)
}
console.log(`cobertura do check: ${pastas.length} pacotes, todos com typecheck e test.`)
