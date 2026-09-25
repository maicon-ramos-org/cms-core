/**
 * PRD 17 RF2 — nada de marca, domínio ou programa de afiliado dentro do core.
 *
 * Este repositório é o núcleo da plataforma (ADR-0011 §4), instalado por vários sites.
 * Marca de um site escrita aqui vaza para todos os outros — o PRD 14 já achou o defeito em três lugares do tenant 3d
 * (título da home, manifest e `.well-known/mcp.json`), e o RF2 achou mais um em código de
 * produção: o validador da Amazon só aceitava a etiqueta de associado do Runzos, e
 * recusaria os links de qualquer outro site afiliado.
 *
 * Duas regras:
 *
 * 1. Em TODO `packages/`, `apps/` e `scripts/`: nenhuma marca ou domínio de site nosso.
 *    Comentário e teste contam, e o núcleo se prova com dado de exemplo (ADR-0011 §4, o
 *    site de referência em `apps/`).
 * 2. Em `packages/cms-core` e `packages/editorial`: nenhum nome de programa de afiliado.
 *    Esses nomes só podem morar no plugin `afiliado` (ADR-0011 §5); a instância editorial
 *    não tem programa nenhum.
 *
 * Sem exceção: o escopo npm é o dono do repositório (`@maicon-ramos-org/`, exigência do
 * GitHub Packages), e o escopo antigo saiu na mudança de casa (PRD 17 RF9).
 *
 * Uma exceção só de arquivo (não de conteúdo): esta trava e o teste dela CITAM as marcas —
 * é o dado que eles verificam —, então ficam fora da varredura de `scripts/` (PRD 24 RF3).
 *
 * `node scripts/confere-core-sem-marca.mjs`
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * As instâncias da plataforma (ADR-0011 §1). Site novo entra aqui no dia em que a
 * instância nasce (PRD 19/21/22). `3d` não entra sozinho: é palavra comum ("impressão 3D"),
 * e a marca dele é "Runzos 3D" em `3d.runzos.com`, que a primeira regra já pega.
 */
const MARCAS = [
  { nome: 'runzos', re: /runzos/gi },
  { nome: 'solomo', re: /solomo/gi },
  { nome: 'alma fitness', re: /alma[\s-]?fitness/gi },
  { nome: 'maiconramos', re: /maiconramos/gi },
]

/** A lista do PRD 17 RF2, com `\b` nos dois lados: "impacto" não é Impact. */
const PROGRAMAS = /\b(hostinger|cloudways|amazon|awin|impact|shopee|mercado\s?livre|hotmart)\b/gi
const SO_NO_PLUGIN = ['packages/cms-core/', 'packages/editorial/']

/** Pastas que a trava varre, além da raiz do repositório em si. */
const PASTAS = ['packages', 'apps', 'scripts']

/**
 * Arquivo excluído da varredura por INTEIRO — não por conteúdo. Só esta trava e o teste
 * dela: precisam citar as marcas para testá-las e documentá-las (ver comentário do topo).
 */
const SEM_VARREDURA = new Set(['scripts/confere-core-sem-marca.mjs', 'scripts/confere-core-sem-marca.test.mjs'])

const IGNORADOS = new Set(['node_modules', 'dist', 'build', 'coverage', '.astro', '.turbo', '.next'])

function arquivos(dir) {
  const saida = []
  let itens
  try {
    itens = readdirSync(dir)
  } catch {
    return saida
  }
  for (const nome of itens) {
    if (IGNORADOS.has(nome)) continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho))
    else saida.push(caminho)
  }
  return saida
}

/** Binário (imagem, fonte) não tem "menção"; o byte zero denuncia. */
const ehTexto = (buf) => !buf.subarray(0, 8192).includes(0)

/** Tudo o que a trava encontrou em `packages/`, `apps/` e `scripts/`, como `caminho:linha — motivo`. */
export function procuraMarcas(raiz) {
  const achados = []
  for (const arq of PASTAS.flatMap((d) => arquivos(join(raiz, d)))) {
    const rel = relative(raiz, arq).split(sep).join('/')
    if (SEM_VARREDURA.has(rel)) continue
    const buf = readFileSync(arq)
    if (!ehTexto(buf)) continue
    const soNoPlugin = SO_NO_PLUGIN.some((p) => rel.startsWith(p))
    buf
      .toString('utf8')
      .split('\n')
      .forEach((linhaBruta, i) => {
        const linha = linhaBruta
        for (const m of MARCAS) {
          if (linha.match(m.re)) achados.push(`${rel}:${i + 1} — marca de site "${m.nome}"`)
        }
        if (soNoPlugin) {
          for (const p of new Set((linha.match(PROGRAMAS) ?? []).map((x) => x.toLowerCase()))) {
            achados.push(`${rel}:${i + 1} — programa de afiliado "${p}" fora do plugin afiliado`)
          }
        }
      })
  }
  return achados
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const raiz = fileURLToPath(new URL('..', import.meta.url))
  const achados = procuraMarcas(raiz)
  if (achados.length) {
    console.error('Marca, domínio ou programa de afiliado dentro do core (PRD 17 RF2):\n')
    for (const a of achados) console.error(`  ${a}`)
    console.error(
      '\nO que é de um site vira parâmetro da fábrica ou campo de `tenants`; o que é de afiliado' +
        '\nmora no plugin `afiliado`. Teste usa dado de exemplo (`Exemplo`, `exemplo.test`).',
    )
    process.exit(1)
  }
  console.log(
    'confere-core-sem-marca: ok (packages/, apps/ e scripts/ sem marca de site; cms-core e editorial sem programa de afiliado)',
  )
}
