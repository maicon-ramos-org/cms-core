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

/** Um item do índice da busca instantânea — chaves curtas porque são centenas de itens. */
export interface ItemDoIndice {
  /** título */
  t: string
  /** endereço */
  u: string
  /** espécie (`artigo`, `página`…) — a que o filtro da busca usa */
  k: string
}

/** Uma fonte do `/search-index.json`: todos os itens de uma espécie, do tenant. */
export type FonteDoIndice = (tenant: TenantDTO) => Promise<ItemDoIndice[]>

/** Uma seção da página `/busca/` (ex.: "Lojas"), com os resultados do termo. */
export interface SecaoDaBusca {
  titulo: string
  itens: Array<{ nome: string; url: string }>
}

export interface ExtensaoDoEditorial {
  /** Chamado uma vez por página com corpo, com o tenant da requisição. */
  linksDoCorpo?: (tenant: TenantDTO) => Promise<LinksDoCorpo>
  /** Sub-sitemaps que a extensão acrescenta, por tipo. O tema tem `posts` e `paginas`. */
  sitemaps?: Record<string, GeradorDeSitemap>
  /** O que a extensão acrescenta ao `llms.txt` do tenant. */
  llms?: (tenant: TenantDTO, base: string) => Promise<LlmsDaExtensao>
  /** Fontes do índice da busca instantânea, por nome. O tema tem `posts` e `pages`. */
  indiceDeBusca?: Record<string, FonteDoIndice>
  /** Seções da página `/busca/` para um termo; saem antes dos artigos, na ordem das extensões. */
  busca?: (tenant: TenantDTO, termo: string, limite: number) => Promise<SecaoDaBusca[]>
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
 * Junta o que o tema e as extensões registram por nome (tipos de sitemap, fontes do índice
 * de busca), na ordem que o site declara — a que o buscador ou o arquivo já conhecem. Nome
 * fora da ordem vai para o fim, na ordem em que apareceu; nome que ninguém registrou não
 * entra; extensão registrada depois ganha de quem veio antes com o mesmo nome.
 */
export function ordenaContribuicoes<T>(
  doTema: Record<string, T>,
  dasExtensoes: ReadonlyArray<Record<string, T> | undefined>,
  ordem: readonly string[] = [],
): Map<string, T> {
  const todos = new Map<string, T>(Object.entries(doTema))
  for (const registro of dasExtensoes) for (const [nome, valor] of Object.entries(registro ?? {})) todos.set(nome, valor)
  const ordenados = new Map<string, T>()
  for (const nome of [...ordem, ...todos.keys()]) {
    const valor = todos.get(nome)
    if (valor !== undefined && !ordenados.has(nome)) ordenados.set(nome, valor)
  }
  return ordenados
}

/** Os tipos de sitemap e quem gera cada um: os do tema e os das extensões (`ordenaContribuicoes`). */
export const tiposDeSitemap = (
  doTema: Record<string, GeradorDeSitemap>,
  extensoes: readonly ExtensaoDoEditorial[],
  ordem: readonly string[] = [],
): Map<string, GeradorDeSitemap> => ordenaContribuicoes(doTema, extensoes.map((e) => e.sitemaps), ordem)

/**
 * O índice de busca inteiro: as fontes em paralelo, mas cada uma na PRÓPRIA lista, e o
 * resultado na ordem das fontes. Com uma lista comum, a ordem virava a ordem em que o CMS
 * respondia — os blocos trocavam de lugar a cada reinício e o arquivo mudava sozinho.
 */
export async function juntaIndice(tenant: TenantDTO, fontes: ReadonlyMap<string, FonteDoIndice>): Promise<ItemDoIndice[]> {
  const porFonte = await Promise.all([...fontes.values()].map((fonte) => fonte(tenant)))
  return porFonte.flat()
}
