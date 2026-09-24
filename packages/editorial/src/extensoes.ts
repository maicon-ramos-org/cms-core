/**
 * O que o tema aceita de CÓDIGO vindo de fora (PRD 17 RF3d): cada extensão é um módulo que
 * o site lista em `editorial({ extensoes })` e que exporta alguns destes ganchos. O plugin de
 * afiliado, por exemplo, sabe reescrever o link de loja do corpo de um post para `/r/{id}` —
 * o tema não sabe, e não deve saber, o que é uma loja.
 *
 * Um gancho que nenhuma extensão exporta simplesmente não roda: o tema funciona sozinho.
 */
import type { TenantDTO } from './lib/cms'

/** Como tratar os links do corpo (Lexical) de posts e páginas. */
export interface LinksDoCorpo {
  /** Destino no lugar do link cru — `null` deixa o link como está. */
  reescreve?: (url: string) => string | null
  /** Link de rastreio que ficou sem destino não pode sair no HTML: vira texto. */
  ehRastreio?: (url: string) => boolean
}

export interface ExtensaoDoEditorial {
  /** Chamado uma vez por página com corpo, com o tenant da requisição. */
  linksDoCorpo?: (tenant: TenantDTO) => Promise<LinksDoCorpo>
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
