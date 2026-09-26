/**
 * PRD 24 RF3 — nada de `node:fs`/`node:os` no caminho que o Worker web carrega.
 *
 * O núcleo roda nos dois formatos até a virada terminar: Node na VPS e no CI, Workers no
 * site que o consome. Nos Workers, a compatibilidade com Node cobre `node:crypto`, `node:path` e
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
 * Exceção restrita: só o import nomeado de AsyncLocalStorage de async_hooks, provado
 * em workerd nos testes do editorial. Não libera as outras APIs desse módulo.
 *
 * Os imports são achados pelo parser de verdade do TypeScript (`ts.createSourceFile` +
 * `forEachChild`), não por regex no texto bruto. Uma heurística anterior tirava comentário
 * por regex antes de mascarar string, e o início ou o fim de um comentário de bloco dentro
 * de uma STRING (por exemplo uma string com o valor de dois caracteres "barra-asterisco")
 * apagava tudo até o próximo fechamento de verdade — um import real no meio, escondido
 * "atrás" de duas strings, sumia da análise sem avisar (achado real desta revisão, PRD 24
 * RF3). O parser não erra: ele sabe onde uma string começa e termina, então nunca confunde
 * o conteúdo dela com comentário ou com outro import — e também não depende de espaço
 * depois de `import`/`export`/`from`.
 *
 * `node scripts/confere-core-sem-node.mjs` (entra no `check` na RF4).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

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
 * Onde o frontmatter de um `.astro` abre, como o compilador do Astro o reconhece
 * (`@astrojs/compiler-rs` 0.5.0, conferido com `transform()`): no primeiro `---` do arquivo,
 * desde que antes dele só haja espaço, texto sem `<` nem `{`, e comentários HTML fechados —
 * linha em branco, comentário de licença ou BOM antes da cerca NÃO impedem o compilador de
 * levar o import para o bundle (achado real da revisão do PRD 24 RF3: a regex antiga,
 * ancorada em `^---`, devolvia vazio nesses casos). Onde o compilador é mais estrito (um
 * comentário de várias linhas antes da cerca, que ele deixa como template), a trava ainda
 * enxerga frontmatter: erra a favor de reprovar.
 */
const ABERTURA_DO_FRONTMATTER = /^(?:[^<{]|<!--[\s\S]*?-->)*?---/

/**
 * O código de JS/TS de um arquivo, pronto para o parser, e a linha (0-based) em que ele
 * começa no arquivo original. Para `.astro` é o que vem depois da cerca que abre o
 * frontmatter; sem frontmatter, não há código para seguir.
 *
 * Vai até o FIM do arquivo, não até a próxima linha `---`: o compilador fecha o frontmatter
 * no primeiro `---` fora de string, comentário e template literal, e uma regex que corta na
 * primeira linha `---` corta cedo demais quando um template literal tem essa linha dentro — o
 * import que vem depois sumia. Parsear o template junto nunca esconde import do frontmatter
 * (o frontmatter é código válido, e o parser o lê igual com ou sem o que vem depois); no
 * máximo acha algo no template, e aí a trava reprova a mais, que é o lado certo do erro.
 */
function codigoEOffset(caminho, textoOriginal) {
  if (!caminho.endsWith('.astro')) return { codigo: textoOriginal, offset: 0 }
  const m = textoOriginal.match(ABERTURA_DO_FRONTMATTER)
  if (!m) return { codigo: '', offset: 0 }
  const inicioDoCodigo = m.index + m[0].length
  return { codigo: textoOriginal.slice(inicioDoCodigo), offset: textoOriginal.slice(0, inicioDoCodigo).split('\n').length - 1 }
}

/**
 * Falha fechada: um `.astro` com uma linha que começa com `---` em que a trava NÃO reconheceu
 * frontmatter é um formato que ela não sabe ler — devolve a linha (1-based) para reprovar, em
 * vez de seguir sem olhar. Na prática é uma cerca depois de uma tag ou de `{…}`, que o
 * compilador trata como template; se for mesmo template, `<hr>` ou um frontmatter vazio no
 * topo resolvem.
 */
export function cercaNaoReconhecida(textoOriginal, caminho) {
  if (!caminho.endsWith('.astro') || ABERTURA_DO_FRONTMATTER.test(textoOriginal)) return null
  const m = textoOriginal.match(/^[ \t]*---/m)
  return m ? textoOriginal.slice(0, m.index).split('\n').length : null
}

/** O texto fixo de um literal — string comum ou template SEM `${…}` — ou `null`. */
function textoFixo(expr) {
  if (ts.isStringLiteral(expr)) return expr.text
  if (ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text
  return null
}

/**
 * Os imports de VALOR de um arquivo, com a linha (1-based, do arquivo original). Pelo
 * parser do TypeScript: uma string ou template com `/*`, `//` ou `import`/`from` dentro
 * nunca é confundido com código de verdade, e não importa se falta espaço depois de
 * `import`/`export` (`import{x}from'm'`, `export*from'm'` são achados do mesmo jeito).
 *
 * `import type`/`export type` (a declaração INTEIRA) ficam de fora — não vão para o bundle.
 * `import { type A } from 'm'` CONTA: o compilador pode manter o import mesmo com o
 * especificador marcado, o que é a favor da trava (prefere reprovar demais a de menos).
 * Import dinâmico (`import(...)`) e `require(...)` contam quando o módulo é texto fixo —
 * string ou template sem interpolação, que o bundler resolve do mesmo jeito; com `${…}` não
 * há como saber o módulo, e a trava não tem base para reprovar.
 */
export function importsDe(textoOriginal, caminho = 'arquivo.ts') {
  const { codigo, offset } = codigoEOffset(caminho, textoOriginal)
  if (!codigo.trim()) return []

  const nomeParaOParser = caminho.endsWith('.astro') ? `${caminho}.ts` : caminho
  const sourceFile = ts.createSourceFile(nomeParaOParser, codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const linhaDe = (pos) => sourceFile.getLineAndCharacterOfPosition(pos).line + 1 + offset

  const achados = []
  const visita = (node) => {
    if (ts.isImportDeclaration(node)) {
      if (!node.importClause?.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const especificador = node.moduleSpecifier.text
        const bindings = node.importClause?.namedBindings
        // Workers suporta run/getStore de AsyncLocalStorage, não o módulo completo.
        // Import namespace/default/dinâmico e reexports continuam fechados.
        const somenteAsyncLocalStorage = especificador.replace(/^node:/, '') === 'async_hooks' &&
          !node.importClause?.name && bindings && ts.isNamedImports(bindings) &&
          bindings.elements.length > 0 && bindings.elements.every(e => e.isTypeOnly || (e.propertyName ?? e.name).text === 'AsyncLocalStorage')
        achados.push({ especificador, linha: linhaDe(node.getStart(sourceFile)), ...(somenteAsyncLocalStorage ? { somenteAsyncLocalStorage: true } : {}) })
      }
    } else if (ts.isExportDeclaration(node)) {
      if (!node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        achados.push({ especificador: node.moduleSpecifier.text, linha: linhaDe(node.getStart(sourceFile)) })
      }
    } else if (ts.isCallExpression(node)) {
      const eImportDinamico = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const eRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require'
      if ((eImportDinamico || eRequire) && node.arguments.length > 0) {
        const modulo = textoFixo(node.arguments[0])
        if (modulo !== null) achados.push({ especificador: modulo, linha: linhaDe(node.getStart(sourceFile)) })
      }
    }
    ts.forEachChild(node, visita)
  }
  visita(sourceFile)
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
    const texto = readFileSync(arquivo, 'utf8')
    const cerca = cercaNaoReconhecida(texto, arquivo)
    if (cerca !== null) {
      const via = origem === rel ? '' : ` (alcançado a partir de ${origem})`
      achados.push(`${rel}:${cerca} — frontmatter que a trava não reconhece (cerca --- depois de tag ou de {…})${via}`)
    }
    for (const { especificador, linha, somenteAsyncLocalStorage } of importsDe(texto, arquivo)) {
      const semPrefixo = especificador.replace(/^node:/, '')
      const base = semPrefixo.split('/')[0]
      if (especificador.startsWith('node:') || DO_NODE.has(semPrefixo) || DO_NODE.has(base)) {
        if (!PERMITIDOS.has(semPrefixo) && !somenteAsyncLocalStorage) {
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
      `\nPermitidos: ${[...PERMITIDOS].map((m) => `node:${m}`).join(', ')} e AsyncLocalStorage nomeado. O que lê disco ou sistema` +
        '\nfica no que só o astro.config alcança (a integração), ou vira dado que a rota recebe.',
    )
    process.exit(1)
  }
  console.log(`confere-core-sem-node: ok (${ENTRADAS.length} entradas do Worker web, ${[...PERMITIDOS].map((m) => `node:${m}`).join(', ')} e AsyncLocalStorage nomeado)`)
}
