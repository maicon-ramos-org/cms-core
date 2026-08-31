/**
 * Índice da busca instantânea — UMA requisição, feita só quando o leitor abre a busca.
 *
 * É o que torna a busca ao vivo barata: o navegador não pergunta nada ao servidor a cada
 * tecla; baixa este arquivo uma vez, guarda em memória e filtra ali. Custo no carregamento
 * da página: ZERO, porque nada disso acontece antes de alguém clicar na lupa.
 *
 * Chaves curtas (`t`, `u`, `k`) porque são ~930 itens e cada byte se multiplica por item.
 * `noindex` no cabeçalho: é dado de interface, não página.
 */
import type { APIRoute } from 'astro'

import { caminhoDaOferta, itensParaBusca } from '../lib/cms'

const ROTULO: Record<string, string> = {
  posts: 'artigo',
  ofertas: 'oferta',
  lojas: 'cupons',
  pages: 'página',
}

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const itens = await itensParaBusca(tenant.id)

  const saida = itens.map((i) => ({
    t: i.nome,
    u:
      i.colecao === 'ofertas'
        ? caminhoDaOferta({ slug: i.slug, wordpress_id: i.wordpress_id })
        : i.colecao === 'lojas'
          ? `/cupom-${i.slug}/`
          : // ficha de app é `pages` com template `apps`, e mora em /apps/{slug}
            i.template === 'apps'
            ? `/apps/${i.slug}/`
            : `/${i.slug}/`,
    k: i.template === 'apps' ? 'app' : (ROTULO[i.colecao] ?? ''),
  }))

  if (context.cache.enabled) {
    context.cache.set({ maxAge: 900, swr: 300, tags: [`tenant:${tenant.slug}`, 'busca:indice'] })
  }

  return new Response(JSON.stringify(saida), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=900',
      'x-robots-tag': 'noindex',
    },
  })
}
