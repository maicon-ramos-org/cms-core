/**
 * PRD 24 (RF0.10, RF4) — o pré-lançamento sai na dist-tag `next` e o `latest` fica na última
 * estável. A regra tem que acertar nos dois sentidos: pré-lançamento nunca cai no `latest`, e
 * versão estável segue sem `--tag` (o npm aplica o `latest` e mantém a trava dele).
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { distTag } from './dist-tag.mjs'

const script = fileURLToPath(new URL('./dist-tag.mjs', import.meta.url))

test('pré-lançamento sai em next', () => {
  assert.equal(distTag('0.2.0-next.1'), 'next')
  assert.equal(distTag('0.2.0-next.12'), 'next')
  assert.equal(distTag('1.0.0-rc.2'), 'next')
  assert.equal(distTag('1.0.0-next.1+build.3'), 'next')
})

test('versão estável não leva tag: o npm aplica o latest sozinho', () => {
  assert.equal(distTag('0.1.0'), null)
  assert.equal(distTag('0.2.0'), null)
  assert.equal(distTag('10.20.30'), null)
})

test('hífen nos metadados de build não é pré-lançamento (SemVer, e o npm concorda)', () => {
  assert.equal(distTag('1.0.0+build-7'), null)
})

test('o que não é SemVer reprova, em vez de sair como estável', () => {
  for (const v of ['', '0.2', 'v0.2.0', '0.2.0-', '0.2.0 ', 'lixo']) {
    assert.throws(() => distTag(v), /não é SemVer/, `aceitou ${JSON.stringify(v)}`)
  }
})

test('na linha de comando: imprime a tag do pré-lançamento e nada na estável', () => {
  assert.equal(execFileSync('node', [script, '0.2.0-next.1'], { encoding: 'utf8' }), 'next\n')
  assert.equal(execFileSync('node', [script, '0.1.0'], { encoding: 'utf8' }), '')
})

test('na linha de comando: versão inválida ou ausente sai com erro', () => {
  assert.notEqual(spawnSync('node', [script, 'lixo']).status, 0)
  assert.notEqual(spawnSync('node', [script]).status, 0)
})
