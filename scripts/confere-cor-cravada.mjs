/**
 * PRD 12 — nenhuma cor de tema cravada no CSS do tema, do plugin e do site de referência.
 *
 * Um tema escuro não se quebra de uma vez; ele apodrece por um `color: #555` de cada vez.
 * O hex cravado não dá erro, não some do layout claro e não aparece em review — ele só
 * fica cinza-escuro sobre cinza-escuro na tela de quem lê à noite, que é justamente quem
 * nunca abre issue. Por isso a trava é automática e roda no `pnpm check`.
 *
 * O que passa e por quê:
 *  - `#000` e `#fff` DENTRO de `color-mix(...)`: ali o hex é primitivo de sombreamento
 *    (clarear/escurecer um token), não uma cor escolhida à mão.
 *  - `rgb(0 0 0 / a)`: véu de diálogo e sombra. Preto é preto nos dois temas.
 *  - hex em comentário: comentário explica, não pinta.
 *  - `currentColor`, `transparent`, `inherit`: não são cor de tema.
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
    else if (nome.endsWith('.astro')) saida.push(caminho)
  }
  return saida
}

/** Tira comentários de bloco e de linha antes de procurar hex. */
const semComentarios = (linha) => linha.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/, ' ')

const HEX = /#[0-9a-fA-F]{3,8}\b/g
const problemas = []

for (const base of ONDE) {
  for (const arq of arquivos(join(raiz, base))) {
    const texto = readFileSync(arq, 'utf8')
    // só o miolo dos <style>: hex em atributo de SVG inline é desenho, não tema
    for (const bloco of texto.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      const inicio = texto.slice(0, bloco.index).split('\n').length - 1
      const linhas = (bloco[1] ?? '').split('\n')
      let emComentario = false
      linhas.forEach((linhaBruta, i) => {
        // comentário de bloco atravessando várias linhas
        let linha = linhaBruta
        if (emComentario) {
          const fim = linha.indexOf('*/')
          if (fim === -1) return
          linha = linha.slice(fim + 2)
          emComentario = false
        }
        const abre = semComentarios(linha).lastIndexOf('/*')
        if (abre !== -1 && !linha.slice(abre).includes('*/')) {
          emComentario = true
          linha = linha.slice(0, abre)
        }
        // um nível de parêntese aninhado: `color-mix(in srgb, var(--x) 62%, #000)` tem
        // um `)` no meio, e o casamento ingênuo parava nele e "achava" o #000 de fora
        const limpa = semComentarios(linha).replace(/color-mix\((?:[^()]|\([^()]*\))*\)/g, ' ')
        for (const achado of limpa.match(HEX) ?? []) {
          problemas.push(`${relative(raiz, arq)}:${inicio + i + 1} — cor cravada \`${achado}\``)
        }
      })
    }
  }
}

if (problemas.length) {
  console.error(`cor cravada: ${problemas.length} problema(s)\n`)
  for (const p of problemas) console.error(`  - ${p}`)
  console.error(
    '\nCor é DADO do tenant e tem DOIS valores (tema claro e tema escuro).\n' +
      'Use o papel correspondente — var(--rz-ink), --rz-muted, --rz-borda, --rz-on-brand,\n' +
      '--rz-surface-brand, --rz-sombra-media… — e não um hex escolhido olhando a tela clara.',
  )
  process.exit(1)
}
console.log('cor cravada: nenhum hex de tema no CSS do site.')
