#!/usr/bin/env node
import { auditarPaginaPublica } from '../src/index.mjs'

const urls = process.argv.slice(2)
if (!urls.length) {
  process.stderr.write('Uso: auditar-publico https://site.example/artigo/ [...]\n')
  process.exitCode = 2
} else {
  let falhou = false
  for (const url of urls) {
    const resultado = await auditarPaginaPublica(url)
    process.stdout.write(`${JSON.stringify(resultado)}\n`)
    if (!resultado.ok) falhou = true
  }
  if (falhou) process.exitCode = 1
}
