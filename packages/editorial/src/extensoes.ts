/**
 * O que o tema aceita de CÓDIGO vindo de fora (PRD 17 RF3d): cada extensão é um módulo que
 * o site lista em `editorial({ extensoes })` e que exporta alguns destes ganchos. O plugin de
 * afiliado, por exemplo, sabe reescrever o link de loja do corpo de um post para `/r/{id}` —
 * o tema não sabe, e não deve saber, o que é uma loja.
 *
 * Um gancho que nenhuma extensão exporta simplesmente não roda: o tema funciona sozinho.
 */
import type { TenantDTO } from './lib/cms'
import type { UrlDoSitemap } from './lib/sitemap'

/** Como tratar os links do corpo (Lexical) de posts e páginas. */
export interface LinksDoCorpo {
  /** Destino no lugar do link cru — `null` deixa o link como está. */
  reescreve?: (url: string) => string | null
  /** Link de rastreio que ficou sem destino não pode sair no HTML: vira texto. */
  ehRastreio?: (url: string) => boolean
}

/** O que uma extensão acrescenta ao `llms.txt`. */
export interface LlmsDaExtensao {
  /** Linhas de lista (`- [Nome](url) — detalhe`) na seção de índices, depois do blog. */
  indices?: string[]
  /** Seções inteiras depois dos índices. */
  secoes?: Array<{ titulo: string; linhas: string[] }>
}

/** Gera as URLs de um sub-sitemap (`/sitemap-{tipo}.xml`); `base` é `https://{host canônico}`. */
export type GeradorDeSitemap = (tenant: TenantDTO, base: string) => Promise<UrlDoSitemap[]>

export interface ExtensaoDoEditorial {
  /** Chamado uma vez por página com corpo, com o tenant da requisição. */
  linksDoCorpo?: (tenant: TenantDTO) => Promise<LinksDoCorpo>
  /** Sub-sitemaps que a extensão acrescenta, por tipo. O tema tem `posts` e `paginas`. */
  sitemaps?: Record<string, GeradorDeSitemap>
  /** O que a extensão acrescenta ao `llms.txt` do tenant. */
  llms?: (tenant: TenantDTO, base: string) => Promise<LlmsDaExtensao>
}

/**
 * Junta o que as extensões dizem sobre os links do corpo: a primeira que reescreve um link
 * ganha, e basta uma dizer que é rastreio.
 */
export async function linksDoCorpo(extensoes: readonly ExtensaoDoEditorial[], tenant: TenantDTO): Promise<Required<LinksDoCorpo>> {
  const todas = await Promise.all(extensoes.map((e) => e.linksDoCorpo?.(tenant)))
  const validas = todas.filter((l): l is LinksDoCorpo => Boolean(l))
  return {
    reescreve: (url) => {
      for (const l of validas) {
        const destino = l.reescreve?.(url)
        if (destino) return destino
      }
      return null
    },
    ehRastreio: (url) => validas.some((l) => l.ehRastreio?.(url) === true),
  }
}

/**
 * Os tipos de sitemap e quem gera cada um: os do tema e os das extensões. A ordem é a que o
 * site declara (`config.sitemap.ordem`) — a do índice que o buscador já conhece —; tipo fora
 * dela vai para o fim, na ordem em que apareceu. Tipo que ninguém gera não entra.
 */
export function tiposDeSitemap(
  doTema: Record<string, GeradorDeSitemap>,
  extensoes: readonly ExtensaoDoEditorial[],
  ordem: readonly string[] = [],
): Map<string, GeradorDeSitemap> {
  const todos = new Map<string, GeradorDeSitemap>(Object.entries(doTema))
  for (const e of extensoes) for (const [tipo, gerador] of Object.entries(e.sitemaps ?? {})) todos.set(tipo, gerador)
  const ordenados = new Map<string, GeradorDeSitemap>()
  for (const tipo of [...ordem, ...todos.keys()]) {
    const gerador = todos.get(tipo)
    if (gerador && !ordenados.has(tipo)) ordenados.set(tipo, gerador)
  }
  return ordenados
}
