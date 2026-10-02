/**
 * O que o plugin de afiliado acrescenta ao tema editorial em CÓDIGO (PRD 17 RF3d/RF3e). O
 * site lista este módulo em `editorial({ extensoes: ['@maicon-ramos-org/afiliado/web/extensao', …] })`.
 *
 * - `linksDoCorpo`: o corpo de posts e páginas migrados tem link de loja cru, e link de
 *   afiliado cru no HTML é proibido — ele sai como `/r/{id}`, pelo mapa do catálogo do
 *   tenant. O link de rastreio sem destino no mapa vira texto.
 * - `sitemaps`: os sub-sitemaps de ofertas, lojas e catálogo.
 * - `llms`: gancho legado; o tema não o executa mais no `llms.txt` público.
 * - `indiceDeBusca` e `busca`: ofertas e lojas na busca instantânea e na página `/busca/`.
 */
import type {
  FonteDoIndice,
  GeradorDeSitemap,
  LinksDoCorpo,
  LlmsDaExtensao,
  SecaoDaBusca,
} from '@maicon-ramos-org/editorial'
import { buscaPorTitulo, itensDaColecao } from '@maicon-ramos-org/editorial/lib/cms'

import {
  caminhoDaOferta,
  cmsCategoriasOferta,
  getLojas,
  getMapaAfiliados,
  listarParaSitemap,
  lojasComOferta,
  type LojaDTO,
  type OfertaDTO,
  type TenantDTO,
} from './lib/cms'
import { ehLinkDeAfiliado } from './lib/links-de-afiliado'
import { fichasParaLlms, linhaFichaLlms } from './lib/llms-fichas'

export async function linksDoCorpo(tenant: TenantDTO): Promise<LinksDoCorpo> {
  const mapa = await getMapaAfiliados(tenant.id)
  return {
    reescreve: (url) => mapa.get(url) ?? mapa.get(url.replace(/\/$/, '')) ?? null,
    ehRastreio: ehLinkDeAfiliado,
  }
}

export const sitemaps: Record<string, GeradorDeSitemap> = {
  ofertas: async (tenant, base) => {
    const ofertas = await listarParaSitemap('ofertas', tenant.id, 'updatedAt')
    return ofertas.map((o) => ({ loc: `${base}${caminhoDaOferta(o)}`, lastmod: o.lastmod }))
  },

  lojas: async (tenant, base) => {
    const [lojas, comOferta] = await Promise.all([getLojas(tenant.id), lojasComOferta(tenant.id)])
    return lojas
      .filter((l) => comOferta.has(String(l.id)))
      .map((l) => ({ loc: `${base}/cupom-${l.slug}/`, lastmod: null }))
  },

  catalogo: async (tenant, base) => {
    const [cats, lojas, produtos, fisicosPublicados, fisicosIndexaveis] = await Promise.all([
      cmsCategoriasOferta(tenant.id),
      getLojas(tenant.id),
      /*
       * /p/{slug} entra no sitemap SÓ quando `indexavel` (PRD 08 RF6). O campo é derivado
       * de `estado` no CMS — um catálogo novo devolve zero URLs aqui de propósito. Quem liga
       * a chave é o editor, no portão de demanda; a rota e o sitemap apenas obedecem.
       */
      listarParaSitemap('produtos', tenant.id, 'updatedAt', [
        { campo: 'indexavel', operador: 'equals', valor: 'true' },
      ]),
      listarParaSitemap('produtos_fisicos', tenant.id, 'updatedAt', [
        { campo: 'estado', operador: 'equals', valor: 'published' },
      ]),
      listarParaSitemap('produtos_fisicos', tenant.id, 'updatedAt', [
        { campo: 'estado', operador: 'equals', valor: 'published' },
        { campo: 'indexavel', operador: 'equals', valor: 'true' },
      ]),
    ])
    const porId = new Map(cats.map((c) => [String(c.id), c]))
    const ocupadosPeloFisico = new Set(fisicosPublicados.map(p => p.slug))
    return [
      ...cats.map((c) => {
        const paiId = c.pai && typeof c.pai === 'object' ? String(c.pai.id) : c.pai ? String(c.pai) : null
        const pai = paiId ? porId.get(paiId) : null
        const caminho = pai ? `${pai.slug}/${c.slug}` : c.slug
        return { loc: `${base}/categoria-oferta/${caminho}/`, lastmod: null }
      }),
      ...lojas.map((l) => ({ loc: `${base}/empresa/${l.slug}/`, lastmod: null })),
      ...produtos.filter(p => !ocupadosPeloFisico.has(p.slug)).map((p) => ({ loc: `${base}/p/${p.slug}/`, lastmod: p.lastmod })),
      ...fisicosIndexaveis.map((p) => ({ loc: `${base}/p/${p.slug}/`, lastmod: p.lastmod })),
    ]
  },
}

/** Gerador para snapshot/build; NÃO reativar este gancho na requisição fria de /llms.txt. */
export async function llms(tenant: TenantDTO, _base: string): Promise<LlmsDaExtensao> {
  const fichas = await fichasParaLlms(tenant)
  return {
    indices: [],
    secoes: [{ titulo: 'Fichas monetizáveis', linhas: fichas.map(linhaFichaLlms) }],
  }
}

export const indiceDeBusca: Record<string, FonteDoIndice> = {
  ofertas: async (tenant) =>
    (await itensDaColecao(tenant.id, 'ofertas', 'titulo')).map((i) => ({
      t: i.nome,
      u: caminhoDaOferta({ slug: i.slug, wordpress_id: i.wordpress_id }),
      k: 'oferta',
    })),
  // `lojas` não tem versões: filtrar por `_status` lá devolve erro
  lojas: async (tenant) =>
    (await itensDaColecao(tenant.id, 'lojas', 'nome', false)).map((i) => ({ t: i.nome, u: `/cupom-${i.slug}/`, k: 'cupons' })),
}

export async function busca(tenant: TenantDTO, termo: string, limite: number): Promise<SecaoDaBusca[]> {
  const [ofertas, lojas] = await Promise.all([
    buscaPorTitulo<OfertaDTO>(tenant.id, 'ofertas', 'titulo', termo, limite),
    buscaPorTitulo<LojaDTO>(tenant.id, 'lojas', 'nome', termo, limite, false),
  ])
  return [
    { titulo: 'Lojas', itens: lojas.map((l) => ({ nome: l.nome, url: `/cupom-${l.slug}/` })) },
    { titulo: 'Ofertas', itens: ofertas.map((o) => ({ nome: o.titulo, url: caminhoDaOferta(o) })) },
  ]
}
