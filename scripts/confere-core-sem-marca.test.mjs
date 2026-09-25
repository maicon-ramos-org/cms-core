/**
 * PRD 17 RF2 — a trava tem que errar nos dois sentidos de propósito: reprovar marca,
 * domínio e programa de afiliado onde eles não podem morar, e NÃO reprovar o que é
 * legítimo (o escopo npm do dono do repositório, o plugin de afiliado, palavra comum que
 * contém o nome).
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'

import { procuraMarcas } from './confere-core-sem-marca.mjs'

const raizes = []
after(() => {
  for (const r of raizes) rmSync(r, { recursive: true, force: true })
})

/** Monta um repo de mentira com os arquivos dados e devolve o que a trava achou. */
function achados(arquivos) {
  const raiz = mkdtempSync(join(tmpdir(), 'core-sem-marca-'))
  raizes.push(raiz)
  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    mkdirSync(dirname(join(raiz, caminho)), { recursive: true })
    writeFileSync(join(raiz, caminho), conteudo)
  }
  return procuraMarcas(raiz)
}

test('pacote neutro passa, com o escopo npm do dono do repositório', () => {
  const r = achados({
    'packages/schema/package.json': '{ "name": "@maicon-ramos-org/schema" }',
    'packages/schema/src/index.ts': "import { x } from '@maicon-ramos-org/afflinks'\nexport const tenant = { nome: 'Exemplo' }",
  })
  assert.deepEqual(r, [])
})

test('o escopo antigo, com a marca, reprova — a exceção acabou com a mudança de casa', () => {
  const r = achados({ 'packages/schema/src/index.ts': "import { x } from '@runzos/afflinks'" })
  assert.equal(r.length, 1)
})

test('o site de referência em apps/ também é olhado', () => {
  const r = achados({ 'apps/referencia-web/src/pages/x.astro': '<p>runzos.com</p>' })
  assert.equal(r.length, 1)
  assert.match(r[0], /^apps\/referencia-web/)
})

test('domínio de site em código reprova, com arquivo e linha', () => {
  const r = achados({ 'packages/schema/src/index.ts': "const a = 1\nconst host = 'runzos.com'" })
  assert.equal(r.length, 1)
  assert.match(r[0], /^packages\/schema\/src\/index\.ts:2 /)
  assert.match(r[0], /runzos/)
})

test('marca em comentário também reprova — o comentário vai junto com o pacote', () => {
  const r = achados({ 'packages/schema/src/index.ts': '// feito para o Runzos\nexport {}' })
  assert.equal(r.length, 1)
})

test('o atributo WebMCP do formulário de contato é pego quando o componente entra no pacote', () => {
  // o achado do PRD 17 RF7: o atributo WebMCP do formulário de contato citava o site
  const r = achados({
    'packages/editorial/src/FormularioContato.astro': '<form toolname="enviar_mensagem_ao_runzos"></form>',
  })
  assert.equal(r.length, 1)
})

test('as outras instâncias também são marca', () => {
  const r = achados({
    'packages/schema/src/a.ts': "const a = 'solomo.com.br'",
    'packages/schema/src/b.ts': "const b = 'Alma Fitness'",
    'packages/schema/src/c.ts': "const c = 'https://maiconramos.com'",
  })
  assert.equal(r.length, 3)
})

test('programa de afiliado reprova em cms-core e editorial, e passa no pacote de afiliado', () => {
  const r = achados({
    'packages/cms-core/src/tenants.ts': "options: ['hostinger', 'amazon']",
    'packages/editorial/src/Rodape.astro': '<p>Parceiro Mercado Livre</p>',
    'packages/afflinks/src/index.ts': "const programas = ['hostinger', 'amazon', 'cloudways']",
  })
  // um achado por programa: a linha do cms-core cita dois
  assert.deepEqual(r.sort(), [
    'packages/cms-core/src/tenants.ts:1 — programa de afiliado "amazon" fora do plugin afiliado',
    'packages/cms-core/src/tenants.ts:1 — programa de afiliado "hostinger" fora do plugin afiliado',
    'packages/editorial/src/Rodape.astro:1 — programa de afiliado "mercado livre" fora do plugin afiliado',
  ])
})

test('palavra comum que contém o nome do programa não reprova', () => {
  // `\b` nos dois lados: "impacto" e "amazonas" não são Impact nem Amazon
  const r = achados({ 'packages/editorial/src/texto.ts': "const t = 'o impacto chegou ao amazonas'" })
  assert.deepEqual(r, [])
})

test('node_modules e dist ficam fora', () => {
  const r = achados({
    'packages/schema/node_modules/x/index.js': "const host = 'runzos.com'",
    'packages/schema/dist/index.js': "const host = 'runzos.com'",
  })
  assert.deepEqual(r, [])
})

test('scripts/ também é varrido (PRD 24 RF3: o comentário do topo de outra trava citava a marca)', () => {
  const r = achados({ 'scripts/confere-core-sem-node.mjs': '// Workers no Runzos' })
  assert.equal(r.length, 1)
  assert.match(r[0], /^scripts\/confere-core-sem-node\.mjs:1 /)
})

test('esta própria trava e o teste dela ficam fora da varredura de scripts/ — eles CITAM a marca de propósito', () => {
  const r = achados({
    'scripts/confere-core-sem-marca.mjs': "const MARCAS = [{ nome: 'runzos', re: /runzos/gi }]",
    'scripts/confere-core-sem-marca.test.mjs': "test('runzos', () => {})",
  })
  assert.deepEqual(r, [])
})
