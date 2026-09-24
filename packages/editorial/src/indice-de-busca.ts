/**
 * As fontes do `/search-index.json`: `posts` e `pages` do tema e as que as extensões
 * acrescentam (`ExtensaoDoEditorial.indiceDeBusca`), na ordem de `config.busca.ordem`.
 *
 * ORDEM FIXA. As fontes são lidas em paralelo, mas cada uma enche a PRÓPRIA lista e o
 * resultado sai na ordem das fontes. Com uma lista comum, a ordem do índice virava a ordem
 * em que o CMS respondia: os blocos trocavam de lugar a cada reinício do site, e o arquivo
 * mudava sem ninguém ter mexido em nada.
 */
import config from 'virtual:editorial/config'
import extensoes from 'virtual:editorial/extensoes'

import { juntaIndice, ordenaContribuicoes, type FonteDoIndice, type ItemDoIndice } from './extensoes'
import { itensDaColecao, type TenantDTO } from './lib/cms'

const DO_TEMA: Record<string, FonteDoIndice> = {
  posts: async (tenant) =>
    (await itensDaColecao(tenant.id, 'posts', 'titulo')).map((i) => ({ t: i.nome, u: `/${i.slug}/`, k: 'artigo' })),
  pages: async (tenant) =>
    (await itensDaColecao(tenant.id, 'pages', 'titulo')).map((i) => {
      // ficha é `pages` mas mora na pasta dela: sem isto a busca levaria a 404
      const ficha = i.template ? config.fichas?.[i.template] : undefined
      return ficha
        ? { t: i.nome, u: `/${ficha.pasta}/${i.slug}/`, k: ficha.rotulo }
        : { t: i.nome, u: `/${i.slug}/`, k: 'página' }
    }),
}

export const FONTES_DO_INDICE = ordenaContribuicoes(
  DO_TEMA,
  extensoes.map((e) => e.indiceDeBusca),
  config.busca?.ordem,
)

/** O índice inteiro do tenant, fonte a fonte na ordem declarada. */
export const indiceDeBusca = (tenant: TenantDTO): Promise<ItemDoIndice[]> => juntaIndice(tenant, FONTES_DO_INDICE)
