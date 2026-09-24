/**
 * Regra dura §3c: busca em `tenants` SEMPRE com `where` explícito.
 *
 * Custou duas páginas: um script fez `payload.find({ collection: 'tenants', limit: 1 })`
 * sem filtro, pegou um tenant de TESTE deixado por fixture e publicou as duas fichas num
 * host que não existe. Invisíveis, sem erro nenhum.
 *
 * Aqui custou pouco porque o tenant errado era de teste. O MESMO mecanismo, num sistema
 * multi-tenant de verdade, escreve dado de um cliente dentro do outro — e também sem erro.
 * Por isso vira trava e não recomendação.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const raiz = new URL('..', import.meta.url).pathname
const ONDE = ['packages', 'apps']

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

const problemas = []
for (const base of ONDE) {
  for (const arq of arquivos(join(raiz, base))) {
    const txt = readFileSync(arq, 'utf8')
    // Só chamadas a `.find(` — a primeira versão pegava qualquer ocorrência de
    // `collection: 'tenants'` e acusou um `new ValidationError({ collection: 'tenants' })`,
    // que não é busca nenhuma. Alarme falso é bug do instrumento.
    for (const m of txt.matchAll(/\.find\(\s*\{([\s\S]{0,500}?)\}\s*\)/g)) {
      const corpo = m[1] ?? ''
      if (!/collection:\s*['"]tenants['"]/.test(corpo)) continue
      if (/\bwhere\s*:/.test(corpo)) continue
      const linha = txt.slice(0, m.index).split('\n').length
      problemas.push(`${relative(raiz, arq)}:${linha} — \`find\` em tenants sem \`where\``)
    }
  }
}

if (problemas.length) {
  console.error(`tenant explícito: ${problemas.length} problema(s)\n`)
  for (const p of problemas) console.error(`  - ${p}`)
  console.error(
    '\nBusca em `tenants` precisa de `where` (slug ou canonical_host) e falhar alto se não achar.\n' +
      'Sem filtro, "o primeiro que vier" pode ser um tenant de teste — ou o de outro cliente.',
  )
  process.exit(1)
}
console.log('tenant explícito: nenhuma busca em `tenants` sem `where`.')
