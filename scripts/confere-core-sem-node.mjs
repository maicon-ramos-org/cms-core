/**
 * PRD 24 RF3 — nada de `node:fs`/`node:os` no caminho que o Worker web carrega.
 *
 * O núcleo roda nos dois formatos até a virada terminar: Node na VPS e no CI, Workers no
 * Runzos. Nos Workers, a compatibilidade com Node cobre `node:crypto`, `node:path` e
 * `node:url`, mas o disco e o sistema operacional não existem — um `readFileSync` que
 * escapa para uma rota passa em todo teste de Node e só quebra no Worker, em produção.
 *
 * O tema tem, sim, código com `node:fs`: `rotas.ts` e `tema.ts` leem a pasta `src/pages` do
 * site e os componentes que ele troca. Mas só o `astro.config` os alcança, na hora do
 * build. O que a trava confere é o que o bundle do Worker leva: partindo das entradas que
 * rodam a cada pedido (o middleware, as rotas e os componentes que os temas injetam, e as
 * bibliotecas que o site importa por `lib/*`), segue os imports — relativos e entre os
 * pacotes do repositório, pelo `exports` de cada `package.json` — e reprova todo módulo do
 * Node fora da lista de permitidos. Import só de tipo não conta (não vai para o bundle);
 * pacote de fora do repositório, módulo virtual e `astro:*` não são seguidos.
 *
 * Por que lista de permitidos e não de proibidos: o módulo novo do Node que alguém puxar
 * amanhã tem que ser uma decisão, não uma surpresa no deploy. Para permitir outro, confira
 * que o runtime dos Workers o implementa e acrescente em `PERMITIDOS`, com o motivo.
 *
 * `node scripts/confere-core-sem-node.mjs` (entra no `check` na RF4).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Os módulos do Node que o runtime dos Workers implementa e o lado web pode usar. */
export const PERMITIDOS = new Set(['crypto', 'path', 'url'])

/**
 * O que o Worker web carrega a cada pedido, relativo à raiz do repositório. Pasta vale por
 * todos os arquivos de código dentro dela.
 */
export const ENTRADAS = [
  'packages/editorial/src/middleware.ts',
  'packages/editorial/src/rotas',
  'packages/editorial/src/componentes',
  'packages/editorial/src/lib',
  'packages/afiliado/src/web/rotas',
  'packages/afiliado/src/web/componentes',
  'packages/afiliado/src/web/lib',
  'packages/afiliado/src/web/extensao.ts',
]

const CODIGO = /\.(ts|mts|js|mjs|astro)$/
const IGNORADOS = new Set(['node_modules', 'dist', '.astro', '.turbo'])
const EXTENSOES = ['.ts', '.mts', '.js', '.mjs', '.astro', '/index.ts', '/index.js']
const DO_NODE = new Set(builtinModules)

const paraBarra = (p) => p.split(sep).join('/')

function arquivosDe(caminho) {
  if (!existsSync(caminho)) return []
  if (!statSync(caminho).isDirectory()) return [caminho]
  const saida = []
  for (const nome of readdirSync(caminho)) {
    if (IGNORADOS.has(nome)) continue
    const filho = join(caminho, nome)
    if (statSync(filho).isDirectory()) saida.push(...arquivosDe(filho))
    else if (CODIGO.test(nome) && !/\.(spec|test)\.[mc]?[jt]s$/.test(nome) && !nome.endsWith('.d.ts')) saida.push(filho)
  }
  return saida
}

/**
 * O texto sem comentários, com as quebras de linha no lugar (a linha do achado continua
 * certa). Sem isso, a palavra "import" num comentário emendaria com o `from` do import de
 * baixo, e um `import type` passaria por import de valor. O `//` só abre comentário depois
 * de espaço ou pontuação: o de `https://` fica.
 */
const semComentarios = (texto) =>
  texto
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[\s;{}(),])\/\/[^\n]*/gm, '$1')

/**
 * Os imports de VALOR de um arquivo, com a linha. `import type`/`export type` ficam de fora;
 * `import { type A }` conta (o compilador pode manter o import), o que é a favor da trava.
 */
export function importsDe(textoOriginal) {
  const texto = semComentarios(textoOriginal)
  const achados = []
  const linhaDe = (i) => texto.slice(0, i).split('\n').length
  const padroes = [
    // import x from 'm' / import { a } from 'm' / import * as x from 'm' / export … from 'm'
    /\b(import|export)(\s+type\b)?\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    // import 'm' (só efeito colateral)
    /\bimport\s*['"]([^'"]+)['"]/g,
    // import('m') com texto fixo
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const [n, re] of padroes.entries()) {
    for (const m of texto.matchAll(re)) {
      if (n === 0 && m[2]) continue
      achados.push({ especificador: n === 0 ? m[3] : m[1], linha: linhaDe(m.index) })
    }
  }
  return achados
}

/** Nome do pacote do repositório → pasta e `exports` dele. */
function pacotesDoRepositorio(raiz) {
  const pacotes = new Map()
  for (const nome of existsSync(join(raiz, 'packages')) ? readdirSync(join(raiz, 'packages')) : []) {
    const arquivo = join(raiz, 'packages', nome, 'package.json')
    if (!existsSync(arquivo)) continue
    const pkg = JSON.parse(readFileSync(arquivo, 'utf8'))
    if (pkg.name) pacotes.set(pkg.name, { pasta: join(raiz, 'packages', nome), exports: pkg.exports ?? {} })
  }
  return pacotes
}

/** `./lib/*` → `./src/lib/*.ts`, com o curinga do Node (um `*` de cada lado). */
function peloExports(exportsDoPacote, sub) {
  const mapa = typeof exportsDoPacote === 'string' ? { '.': exportsDoPacote } : exportsDoPacote
  const alvo = (v) => (typeof v === 'string' ? v : (v?.import ?? v?.default))
  if (mapa[sub] !== undefined) return alvo(mapa[sub])
  for (const [chave, valor] of Object.entries(mapa)) {
    const [antes, depois] = chave.split('*')
    if (depois === undefined || !sub.startsWith(antes) || !sub.endsWith(depois)) continue
    const meio = sub.slice(antes.length, sub.length - depois.length)
    return alvo(valor)?.replace('*', meio)
  }
  return undefined
}

function comExtensao(base) {
  if (existsSync(base) && statSync(base).isFile()) return base
  // convenção ESM do TypeScript: `./x.js` no import, `./x.ts` no disco
  const semJs = base.replace(/\.m?js$/, '')
  for (const ext of EXTENSOES) {
    if (existsSync(semJs + ext)) return semJs + ext
    if (existsSync(base + ext)) return base + ext
  }
  return null
}

/**
 * Tudo o que a trava encontrou, como `caminho:linha — módulo (alcançado a partir de …)`.
 * `entradas` é relativo a `raiz`; o padrão é o Worker web.
 */
export function procuraNodeNoWorker(raiz, entradas = ENTRADAS) {
  const pacotes = pacotesDoRepositorio(raiz)
  const achados = []
  const visto = new Set()
  const fila = []
  for (const e of entradas) {
    for (const arq of arquivosDe(join(raiz, e))) fila.push({ arquivo: arq, origem: paraBarra(relative(raiz, arq)) })
  }

  const resolve = (especificador, de) => {
    if (especificador.startsWith('.')) return comExtensao(join(dirname(de), especificador))
    for (const [nome, { pasta, exports }] of pacotes) {
      if (especificador !== nome && !especificador.startsWith(`${nome}/`)) continue
      const sub = `.${especificador.slice(nome.length)}`
      const alvo = peloExports(exports, sub)
      return alvo ? comExtensao(join(pasta, alvo)) : null
    }
    return null
  }

  while (fila.length) {
    const { arquivo, origem } = fila.shift()
    if (visto.has(arquivo)) continue
    visto.add(arquivo)
    const rel = paraBarra(relative(raiz, arquivo))
    for (const { especificador, linha } of importsDe(readFileSync(arquivo, 'utf8'))) {
      const semPrefixo = especificador.replace(/^node:/, '')
      const base = semPrefixo.split('/')[0]
      if (especificador.startsWith('node:') || DO_NODE.has(semPrefixo) || DO_NODE.has(base)) {
        if (!PERMITIDOS.has(semPrefixo)) {
          const via = origem === rel ? '' : ` (alcançado a partir de ${origem})`
          achados.push(`${rel}:${linha} — ${especificador}${via}`)
        }
        continue
      }
      const proximo = resolve(especificador, arquivo)
      if (proximo) fila.push({ arquivo: proximo, origem })
    }
  }
  return achados
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const raiz = fileURLToPath(new URL('..', import.meta.url))
  const achados = procuraNodeNoWorker(raiz)
  if (achados.length) {
    console.error('Módulo do Node que o Worker não tem, no caminho que ele carrega (PRD 24 RF3):\n')
    for (const a of achados) console.error(`  ${a}`)
    console.error(
      `\nPermitidos: ${[...PERMITIDOS].map((m) => `node:${m}`).join(', ')}. O que lê disco ou sistema` +
        '\nfica no que só o astro.config alcança (a integração), ou vira dado que a rota recebe.',
    )
    process.exit(1)
  }
  console.log(`confere-core-sem-node: ok (${ENTRADAS.length} entradas do Worker web, só ${[...PERMITIDOS].map((m) => `node:${m}`).join(', ')})`)
}
