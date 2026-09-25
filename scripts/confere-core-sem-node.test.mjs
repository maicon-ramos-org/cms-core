/**
 * PRD 24 RF3 — a trava de `node:fs`/`node:os` no caminho que o Worker carrega. Ela tem que
 * errar nos dois sentidos de propósito: reprovar o módulo do Node que o Worker não tem,
 * mesmo escondido atrás de dois imports ou de outro pacote do repositório; e NÃO reprovar
 * o que é legítimo (os permitidos, o import só de tipo, o arquivo que só o `astro.config`
 * alcança).
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, test } from 'node:test'

import { ENTRADAS, procuraNodeNoWorker } from './confere-core-sem-node.mjs'

const raizes = []
after(() => {
  for (const r of raizes) rmSync(r, { recursive: true, force: true })
})

/** Os `package.json` dos dois pacotes que o Worker web carrega, com os `exports` de verdade. */
const PACOTES = {
  'packages/editorial/package.json': JSON.stringify({
    name: '@maicon-ramos-org/editorial',
    exports: { '.': './src/index.ts', './lib/*': './src/lib/*.ts', './middleware': './src/middleware.ts' },
  }),
  'packages/afiliado/package.json': JSON.stringify({
    name: '@maicon-ramos-org/afiliado',
    exports: { './web': './src/web/index.ts', './web/lib/*': './src/web/lib/*.ts', './web/extensao': './src/web/extensao.ts' },
  }),
}

/** Monta um repositório de mentira com os arquivos dados e devolve o que a trava achou. */
function achados(arquivos) {
  const raiz = mkdtempSync(join(tmpdir(), 'core-sem-node-'))
  raizes.push(raiz)
  for (const [caminho, conteudo] of Object.entries({ ...PACOTES, ...arquivos })) {
    mkdirSync(dirname(join(raiz, caminho)), { recursive: true })
    writeFileSync(join(raiz, caminho), conteudo)
  }
  return procuraNodeNoWorker(raiz)
}

test('rota que importa node:fs reprova, com arquivo e linha', () => {
  const r = achados({
    'packages/editorial/src/rotas/x.ts': "const a = 1\nimport { readFileSync } from 'node:fs'\nexport const GET = () => a",
  })
  assert.equal(r.length, 1)
  assert.match(r[0], /^packages\/editorial\/src\/rotas\/x\.ts:2 — node:fs/)
})

test('o caminho indireto também: middleware → lib → node:os', () => {
  const r = achados({
    'packages/editorial/src/middleware.ts': "import { x } from './lib/util'\nexport const onRequest = x",
    'packages/editorial/src/lib/util.ts': "import { hostname } from './sistema.js'\nexport const x = hostname",
    'packages/editorial/src/lib/sistema.ts': "export { hostname } from 'node:os'",
  })
  assert.equal(r.length, 1)
  assert.match(r[0], /^packages\/editorial\/src\/lib\/sistema\.ts:1 — node:os/)
})

test('node:crypto, node:path e node:url são permitidos, com e sem o prefixo', () => {
  const r = achados({
    'packages/editorial/src/lib/hash.ts': [
      "import { createHash } from 'node:crypto'",
      "import path from 'node:path'",
      "import { fileURLToPath } from 'node:url'",
      "import { randomUUID } from 'crypto'",
      'export const h = [createHash, path, fileURLToPath, randomUUID]',
    ].join('\n'),
  })
  assert.deepEqual(r, [])
})

test('fora da lista de permitidos reprova: fs sem prefixo, fs/promises, child_process', () => {
  const r = achados({
    'packages/editorial/src/lib/a.ts': "import fs from 'fs'",
    'packages/editorial/src/lib/b.ts': "import { readFile } from 'node:fs/promises'",
    'packages/editorial/src/lib/c.ts': "import { exec } from 'node:child_process'",
  })
  assert.equal(r.length, 3)
  assert.match(r.join('\n'), /a\.ts:1 — fs/)
  assert.match(r.join('\n'), /b\.ts:1 — node:fs\/promises/)
  assert.match(r.join('\n'), /c\.ts:1 — node:child_process/)
})

test('import só de tipo não entra no bundle: não reprova', () => {
  const r = achados({
    'packages/editorial/src/middleware.ts': "import type { Tema } from '../tema'\nimport { type Outro } from './lib/x'\nexport type { Rotas } from '../rotas'",
    'packages/editorial/src/tema.ts': "import { existsSync } from 'node:fs'\nexport type Tema = 1",
    'packages/editorial/src/rotas.ts': "import { readdirSync } from 'node:fs'\nexport type Rotas = 1",
    'packages/editorial/src/lib/x.ts': 'export type Outro = 1',
  })
  assert.deepEqual(r, [])
})

test('o que só o astro.config alcança (a integração, rotas.ts, tema.ts) fica de fora', () => {
  const r = achados({
    'packages/editorial/src/index.ts': "export { temaAstro } from './tema'",
    'packages/editorial/src/tema.ts': "import { existsSync } from 'node:fs'\nexport const temaAstro = existsSync",
    'packages/editorial/src/rotas/healthz.ts': 'export const GET = () => new Response()',
  })
  assert.deepEqual(r, [])
})

test('e deixa de ficar de fora quando uma rota passa a importá-lo', () => {
  const r = achados({
    'packages/editorial/src/index.ts': "export { temaAstro } from './tema'",
    'packages/editorial/src/tema.ts': "import { existsSync } from 'node:fs'\nexport const temaAstro = existsSync",
    'packages/editorial/src/rotas/healthz.ts': "import { temaAstro } from '../index'\nexport const GET = () => new Response(String(temaAstro))",
  })
  assert.equal(r.length, 1)
  assert.match(r[0], /^packages\/editorial\/src\/tema\.ts:1 — node:fs/)
  assert.match(r[0], /packages\/editorial\/src\/rotas\/healthz\.ts/)
})

test('de um pacote para o outro, pelo `exports` do package.json', () => {
  const r = achados({
    'packages/afiliado/src/web/rotas/r/[id].ts': "import { ipHash } from '@maicon-ramos-org/editorial/lib/hash'\nexport const GET = ipHash",
    'packages/editorial/src/lib/hash.ts': "import { tmpdir } from 'node:os'\nexport const ipHash = tmpdir",
  })
  assert.equal(r.length, 1)
  assert.match(r[0], /^packages\/editorial\/src\/lib\/hash\.ts:1 — node:os/)
})

test('componente .astro: o import do frontmatter conta', () => {
  const r = achados({
    'packages/editorial/src/componentes/Base.astro': "---\nimport { readFileSync } from 'node:fs'\nconst x = readFileSync\n---\n<html></html>",
  })
  assert.equal(r.length, 1)
  assert.match(r[0], /^packages\/editorial\/src\/componentes\/Base\.astro:2 — node:fs/)
})

test('import dinâmico com texto fixo conta', () => {
  const r = achados({
    'packages/afiliado/src/web/extensao.ts': "export const f = async () => (await import('node:fs')).readFileSync",
  })
  assert.equal(r.length, 1)
})

test('pacote de fora do repositório, módulo virtual e do Astro não são seguidos', () => {
  const r = achados({
    'packages/editorial/src/middleware.ts': [
      "import { defineMiddleware } from 'astro:middleware'",
      "import config from 'virtual:editorial/config'",
      "import { isbot } from 'isbot'",
      'export const onRequest = defineMiddleware(() => [config, isbot])',
    ].join('\n'),
  })
  assert.deepEqual(r, [])
})

test('as entradas são as do Worker web: middleware, rotas, componentes e lib dos dois pacotes', () => {
  for (const e of [
    'packages/editorial/src/middleware.ts',
    'packages/editorial/src/rotas',
    'packages/editorial/src/componentes',
    'packages/editorial/src/lib',
    'packages/afiliado/src/web/rotas',
    'packages/afiliado/src/web/componentes',
    'packages/afiliado/src/web/lib',
    'packages/afiliado/src/web/extensao.ts',
  ]) {
    assert.ok(ENTRADAS.includes(e), e)
  }
})

test('o repositório de verdade passa', () => {
  const raiz = fileURLToPath(new URL('..', import.meta.url))
  assert.deepEqual(procuraNodeNoWorker(raiz), [])
})
