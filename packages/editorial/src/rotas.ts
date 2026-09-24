/**
 * Que rotas o site já tem em `src/pages` — para o tema NÃO injetar a mesma (PRD 17 RF3,
 * nível 3 de personalização: o site que escreve a própria `index.astro` não usa a do pacote).
 *
 * POR QUE NÃO DEIXAR O ASTRO DESEMPATAR. O PRD mandava ligar
 * `experimental.globalRoutePriority`; no Astro 7 essa opção não existe mais (virou o padrão
 * no 5). Rota do site e rota injetada com o mesmo padrão até terminam com a do site vencendo
 * — mas o Astro avisa, a cada build, que "a collision will result in a hard error in
 * following versions". Nível 3 apoiado num aviso de erro futuro é promessa com prazo. O tema
 * simplesmente não injeta o que o site já declarou, e não há colisão para desempatar.
 */
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

/** As extensões que o Astro transforma em rota (páginas e endpoints). */
const EXTENSOES = ['.astro', '.md', '.mdx', '.html', '.ts', '.js', '.mjs']

/**
 * O padrão de rota de um arquivo de `src/pages`, na grafia do `injectRoute`:
 * `blog.astro` → `/blog`, `categoria/index.astro` → `/categoria`,
 * `sitemap-[tipo].xml.ts` → `/sitemap-[tipo].xml`. `null` para o que não vira rota.
 */
export function padraoDoArquivo(relativo: string): string | null {
  const partes = relativo.split(/[\\/]/)
  // `_arquivo` e `_pasta/` ficam fora do roteamento, como no Astro
  if (partes.some((p) => p.startsWith('_'))) return null
  const ultimo = partes.at(-1) ?? ''
  const ext = EXTENSOES.find((e) => ultimo.endsWith(e))
  if (!ext) return null
  const semExt = ultimo.slice(0, -ext.length)
  // `.d.ts` é declaração de tipo, não endpoint
  if (ext === '.ts' && semExt.endsWith('.d')) return null
  const segmentos = [...partes.slice(0, -1), semExt].filter((s, i, todos) => !(s === 'index' && i === todos.length - 1))
  return '/' + segmentos.join('/')
}

/**
 * Duas grafias da mesma rota são a mesma rota: `/[slug]` e `/[id]` casam as mesmas URLs.
 * O nome do parâmetro sai; o que resta é o formato.
 */
export function normalizaPadrao(padrao: string): string {
  const semBarraFinal = padrao.length > 1 ? padrao.replace(/\/+$/, '') : padrao
  return semBarraFinal.replace(/\[\.\.\.[^\]]+\]/g, '[...]').replace(/\[[^\].]+\]/g, '[]')
}

/** Os padrões (normalizados) de todas as rotas que o site declara em `pastaDePaginas`. */
export function rotasDoSite(pastaDePaginas: string): Set<string> {
  const achadas = new Set<string>()
  if (!existsSync(pastaDePaginas)) return achadas
  const anda = (dir: string) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, item.name)
      if (item.isDirectory()) {
        anda(abs)
        continue
      }
      const padrao = padraoDoArquivo(path.relative(pastaDePaginas, abs))
      if (padrao) achadas.add(normalizaPadrao(padrao))
    }
  }
  anda(pastaDePaginas)
  return achadas
}
