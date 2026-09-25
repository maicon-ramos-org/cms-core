/**
 * Os dados do plugin de afiliado no site (PRD 17 RF3e): loja, cupom, oferta, produto,
 * categoria do catálogo, banner e clique, lidos pela REST do Payload. A parte do núcleo
 * (cliente do CMS, tenant, posts, mídia) mora em `@maicon-ramos-org/editorial/lib/cms` e é reexportada
 * daqui, para as rotas do plugin importarem de um lugar só.
 */
/// <reference path="../virtual.d.ts" />
import config from 'virtual:afiliado/config'

import { type FindResult, type MidiaDTO, type TenantDTO, caminhoCanonico, cmsFetch } from '@maicon-ramos-org/editorial/lib/cms'

export * from '@maicon-ramos-org/editorial/lib/cms'

/* os campos do plugin em `tenants`, no tipo do tenant que o tema lê */
declare module '@maicon-ramos-org/editorial/lib/cms' {
  interface TenantDTO {
    programas_ativos?: Array<{ programa: string; id_afiliado_env: string }>
  }
  interface SeoDoTenant {
    title_pattern_loja?: string
  }
}

export interface LojaDTO {
  id: string | number
  nome: string
  slug: string
  url_site: string
  programa: string
  faq?: Array<{ pergunta: string; resposta: string }>
  logo?: MidiaDTO | string | number | null
  tenant?: string | number | TenantDTO
}

/**
 * Caminho público da oferta. NÃO é sempre `/ofertas/{slug}`: ofertas de uma origem podem ter
 * sido publicadas no site velho noutra pasta (um marketplace de apps, por exemplo), e a URL
 * indexada é a verdade — trocá-las de pasta durante a troca de stack misturaria duas mudanças
 * e cobraria 301 de graça. O site declara a pasta de cada origem em
 * `afiliado({ config: { pastaPorOrigem } })`.
 *
 * Derivado de `wordpress_id` (`app:` vs `product:`) em vez de campo novo: um campo que
 * sempre é igual a uma derivação é duplicata que um dia diverge. Quem decide a rota é a
 * origem do registro, e ela já está gravada.
 */
export const caminhoDaOferta = (o: { slug: string; wordpress_id?: string | null }): string => {
  const id = String(o.wordpress_id ?? '')
  const pasta = Object.entries(config.pastaPorOrigem ?? {}).find(([origem]) => id.startsWith(`${origem}:`))?.[1]
  return `/${pasta ?? 'ofertas'}/${caminhoCanonico(o.slug)}/`
}

export interface CupomDTO {
  id: string | number
  codigo: string
  desconto_tipo: 'percentual' | 'valor' | 'frete' | 'outro'
  desconto_valor?: number | null
  condicoes?: string | null
  validade?: string | null
  estado: string
  verificado_em?: string | null
  metodo?: string | null
  taxa_sucesso?: number | null
  url_afiliado_fonte?: string | null
  /** sobre qual preço o cupom incide — sem isso a composição não afirma total (spec §1) */
  aplica_sobre?: 'preco_cheio' | 'preco_ja_descontado' | 'desconhecido' | null
  loja?: LojaDTO | string | number
}

export interface ProdutoDTO {
  id: string | number
  titulo: string
  slug: string
  url_afiliado_fonte: string
  loja?: LojaDTO | string | number
  imagem?: MidiaDTO | string | number | null
  /**
   * Preço e o INSTANTE em que ele foi observado. Andam juntos por validação da coleção
   * (`precoComTimestamp`) porque aqui não há PA-API: o número veio de leitura manual, e
   * número sem carimbo é afirmação que não podemos sustentar. A página respeita a mesma
   * regra do outro lado: sem `preco_em`, nada de preço na tela.
   */
  preco?: number | null
  preco_em?: string | null
  cupom?: CupomDTO | string | number | null
  /** máquina PRD 08: rascunho → landing (noindex) → indexavel → encerrado */
  estado?: string | null
  /** DERIVADO de `estado` no CMS — é ele que decide o noindex e o sitemap */
  indexavel?: boolean | null
  ancoras_alvo?: string[] | null
  meta?: { title?: string | null; description?: string | null } | null
  gate_antithin?: { alternativas?: boolean | null; faq?: boolean | null; editorial?: boolean | null } | null
  updatedAt?: string | null
}

export interface OfertaDTO {
  /** FAQ que o WP publicava só no JSON-LD; vira FAQPage (import:faq) */
  faq?: Array<{ pergunta: string; resposta: string }> | null
  id: string | number
  titulo: string
  slug: string
  tipo?: 'cupom' | 'credito' | 'lifetime' | 'desconto_api'
  preco?: { valor?: number | null; moeda?: string | null; ciclo?: string | null; preco_em?: string | null } | null
  corpo?: unknown
  cupom?: CupomDTO | string | number | null
  url_afiliado_fonte?: string | null
  ancoras_alvo?: string[] | null
  /** title/description do Rank Math migrados — na virada valem os do WP, não os nossos */
  meta?: { title?: string | null; description?: string | null } | null
  /** desconto que a LOJA já dá — a outra metade do formato empilhado (spec §1) */
  desconto_loja?: {
    valor?: number | null
    tipo?: 'percentual' | 'valor' | null
    moeda?: string | null
    verificado_em?: string | null
    fonte?: string | null
  } | null
  loja?: LojaDTO | string | number
  /** categorias do catálogo (Woo) — é por elas que a vitrine da home agrupa */
  categorias?: Array<CategoriaOfertaDTO | string | number> | null
  /** imagem do cartão — migrada do WP, ver `enriquece-ofertas.ts` */
  imagem?: MidiaDTO | string | number | null
  /** a linha de descrição do cartão (short_description/excerpt do WP) */
  resumo?: string | null
  /**
   * A estrutura da página de LIFETIME (contrato: `ofertas.dados`). Existe só onde
   * `tipo = 'lifetime'`; o richText guarda a introdução, e o que é grade fica aqui.
   */
  dados?: {
    nome?: string
    intro_titulo?: string
    sumo?: string
    tagline?: string
    preco_antigo?: number | null
    once?: string
    selos?: string[]
    features?: Array<{ t?: string; d?: string }>
    veredito?: string
    faq?: Array<{ q?: string; a?: string }>
  } | null
  /** a linha abaixo do H1 e no card lateral (brand_headline do WP) */
  headline?: string | null
  /** o diferencial em destaque no card (affiliate_offer do WP) — rótulo, não medição */
  rotulo_oferta?: string | null
  /** a lista "Funcionalidades" da página do WP (benefit_bullets) */
  beneficios?: Array<{ texto?: string | null }> | null
}

export async function getLojas(tenantId: string | number): Promise<LojaDTO[]> {
  const q = new URLSearchParams({
    'where[tenant][equals]': String(tenantId),
    limit: '100',
    sort: 'nome',
    // depth 1: a home mostra o LOGO das lojas, e com depth 0 vinha só o id
    depth: '1',
  })
  for (const campo of ['nome', 'slug', 'logo']) q.set(`select[${campo}]`, 'true')
  return (await cmsFetch<FindResult<LojaDTO>>(`/api/lojas?${q}`)).docs
}

export async function getLojaBySlug(tenantId: string | number, slug: string): Promise<LojaDTO | null> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][slug][equals]': slug,
    limit: '1',
    // depth 1: o `logo` é upload e a página da loja o exibe no cabeçalho — com depth 0
    // vinha só o id e o cabeçalho ficava sem marca
    depth: '1',
  })
  return (await cmsFetch<FindResult<LojaDTO>>(`/api/lojas?${q}`)).docs[0] ?? null
}

/** Cupons visíveis no site: publicado ou expirando (nunca pendente/expirado/revisao). */
export async function getCuponsDaLoja(lojaId: string | number): Promise<CupomDTO[]> {
  const q = new URLSearchParams({
    'where[and][0][loja][equals]': String(lojaId),
    'where[and][1][estado][in]': 'publicado,expirando',
    'where[and][2][_status][equals]': 'published',
    sort: '-verificado_em',
    limit: '100',
    depth: '0',
  })
  return (await cmsFetch<FindResult<CupomDTO>>(`/api/cupons?${q}`)).docs
}

/** Ids de loja que têm ao menos uma oferta publicada — evita hub vazio no sitemap. */
export async function lojasComOferta(tenantId: string | number): Promise<Set<string>> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][_status][equals]': 'published',
    'select[loja]': 'true',
    limit: '500',
    depth: '0',
  })
  const r = await cmsFetch<FindResult<{ loja?: { id?: string | number } | string | number }>>(`/api/ofertas?${q}`)
  const ids = new Set<string>()
  for (const o of r.docs) {
    const id = o.loja && typeof o.loja === 'object' ? o.loja.id : o.loja
    if (id !== undefined && id !== null) ids.add(String(id))
  }
  return ids
}

export interface BannerDTO {
  id: string | number
  nome: string
  imagem?: MidiaDTO | null
  imagem_mobile?: MidiaDTO | null
  oferta?: OfertaDTO | string | number | null
}

/**
 * Banner ativo de uma posição. A janela de datas é filtrada NO BANCO: banner vencido que
 * chega até o componente é banner que alguém esquece de esconder.
 */
export async function getBannerDaPosicao(
  tenantId: string | number,
  posicao: string,
): Promise<BannerDTO | null> {
  const agora = new Date().toISOString()
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][posicao][equals]': posicao,
    'where[and][2][ativo][equals]': 'true',
    'where[and][3][or][0][inicia_em][less_than_equal]': agora,
    'where[and][3][or][1][inicia_em][exists]': 'false',
    'where[and][4][or][0][termina_em][greater_than]': agora,
    'where[and][4][or][1][termina_em][exists]': 'false',
    limit: '1',
    depth: '1',
  })
  return (await cmsFetch<FindResult<BannerDTO>>(`/api/banners?${q}`)).docs[0] ?? null
}

export interface CategoriaOfertaDTO {
  id: string | number
  nome: string
  slug: string
  pai?: { id: string | number; nome: string; slug: string } | string | number | null
  descricao?: unknown
  navegacao?: string
  meta?: { title?: string | null; description?: string | null } | null
}

/**
 * Maior desconto entre as ofertas de pagamento único — o número do CTA do cabeçalho.
 *
 * Só conta desconto COM `verificado_em`: desconto sem carimbo não é dado confiável, e um
 * CTA que anuncia número sem lastro é a mesma promessa vazia que o projeto existe pra não
 * fazer. Sem nenhum verificado, devolve null e o CTA sai sem número.
 */
export async function maiorDescontoLifetime(tenantId: string | number): Promise<number | null> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][_status][equals]': 'published',
    'where[and][2][tipo][equals]': 'lifetime',
    'where[and][3][desconto_loja.verificado_em][exists]': 'true',
    sort: '-desconto_loja.valor',
    limit: '1',
    depth: '0',
  })
  try {
    const doc = (await cmsFetch<FindResult<OfertaDTO>>(`/api/ofertas?${q}`)).docs[0]
    const v = doc?.desconto_loja?.valor
    return typeof v === 'number' ? v : null
  } catch (e) {
    console.error('[cta] maiorDescontoLifetime falhou:', (e as Error).message)
    return null
  }
}

/**
 * As categorias do CATÁLOGO que entram na navegação — só as marcadas `canonica`, na ordem
 * de `ordem_chip`. O campo existe desde o contrato justamente pra isso: as 33 categorias
 * do WP têm duplicata (`VPS`, `Servidor VPS`, `Hospedagem VPS`), então o menu não sai da
 * lista bruta. A curadoria veio do menu que o site já servia.
 */
export async function categoriasDeNavegacao(
  tenantId: string | number,
): Promise<Array<{ nome: string; href: string }>> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][navegacao][equals]': 'canonica',
    sort: 'ordem_chip',
    limit: '30',
    // depth 1 resolve o `pai`: a URL do catálogo reflete a hierarquia (`pai/filho`)
    depth: '1',
  })
  const docs = (await cmsFetch<FindResult<CategoriaOfertaDTO>>(`/api/categorias_oferta?${q}`)).docs
  return docs.map((c) => {
    const pai = c.pai && typeof c.pai === 'object' ? c.pai.slug : null
    return { nome: c.nome, href: `/categoria-oferta/${pai ? `${pai}/` : ''}${c.slug}/` }
  })
}

/** Todas as categorias do catálogo — alimenta o sitemap (a URL reflete a hierarquia). */
export async function cmsCategoriasOferta(tenantId: string | number): Promise<CategoriaOfertaDTO[]> {
  const q = new URLSearchParams({
    'where[tenant][equals]': String(tenantId),
    sort: 'nome',
    limit: '200',
    depth: '1',
  })
  return (await cmsFetch<FindResult<CategoriaOfertaDTO>>(`/api/categorias_oferta?${q}`)).docs
}

/** Categoria do CATÁLOGO pelo slug — a URL pode ser aninhada (/pai/filha/). */
export async function getCategoriaOfertaBySlug(
  tenantId: string | number,
  slug: string,
): Promise<CategoriaOfertaDTO | null> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][slug][equals]': slug,
    limit: '1',
    depth: '1',
  })
  return (await cmsFetch<FindResult<CategoriaOfertaDTO>>(`/api/categorias_oferta?${q}`)).docs[0] ?? null
}

/** Ofertas de uma categoria do catálogo. */
export async function getOfertasDaCategoria(
  categoriaId: string | number,
  limit = 100,
): Promise<OfertaDTO[]> {
  const q = new URLSearchParams({
    'where[and][0][categorias][equals]': String(categoriaId),
    'where[and][1][_status][equals]': 'published',
    sort: 'titulo',
    limit: String(limit),
    depth: '1',
  })
  return (await cmsFetch<FindResult<OfertaDTO>>(`/api/ofertas?${q}`)).docs
}

/** Filhas de uma categoria (a hierarquia veio do WP). */
export async function getFilhasDaCategoria(
  tenantId: string | number,
  paiId: string | number,
): Promise<CategoriaOfertaDTO[]> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][pai][equals]': String(paiId),
    sort: 'nome',
    limit: '50',
    depth: '0',
  })
  return (await cmsFetch<FindResult<CategoriaOfertaDTO>>(`/api/categorias_oferta?${q}`)).docs
}

/** Loja pelo slug com o meta do WP — a página /empresa/{slug}. */
export async function getLojaComMeta(
  tenantId: string | number,
  slug: string,
): Promise<(LojaDTO & { meta?: { title?: string | null; description?: string | null } | null }) | null> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][slug][equals]': slug,
    limit: '1',
    depth: '1',
  })
  return (
    (await cmsFetch<FindResult<LojaDTO & { meta?: { title?: string | null; description?: string | null } | null }>>(
      `/api/lojas?${q}`,
    )).docs[0] ?? null
  )
}

/** Hub /ofertas: catálogo inteiro do tenant (51 hoje), com loja resolvida. */
export async function getOfertasDoTenant(tenantId: string | number, limit = 200): Promise<OfertaDTO[]> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][_status][equals]': 'published',
    sort: 'titulo',
    limit: String(limit),
    depth: '1',
  })
  return (await cmsFetch<FindResult<OfertaDTO>>(`/api/ofertas?${q}`)).docs
}

/**
 * Uma PÁGINA do catálogo, ordenada e sem o `corpo` — o hub /ofertas.
 *
 * Paginado porque as 108 ofertas numa página só já davam 69,9KB de HTML, e com cartão
 * (imagem + resumo) estourariam o teto do tipo catálogo. Ordena por desconto conferido e
 * depois por preço, a mesma régua da vitrine da home: o que tem número auditável primeiro.
 */
export async function getOfertasPaginadas(
  tenantId: string | number,
  pagina: number,
  porPagina: number,
): Promise<{ docs: OfertaDTO[]; totalDocs: number; totalPages: number }> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][_status][equals]': 'published',
    // `-desconto_loja.valor` não serve sozinho: oferta sem desconto viria antes em alguns
    // bancos e o critério do site é desconto CONFERIDO. A ordenação fina fica no chamador,
    // que tem os dois campos em mãos; aqui o sort só garante página estável.
    sort: 'titulo',
    limit: String(porPagina),
    page: String(pagina),
    depth: '1',
  })
  for (const campo of ['titulo', 'slug', 'tipo', 'preco', 'desconto_loja', 'loja', 'wordpress_id', 'imagem', 'resumo']) {
    q.set(`select[${campo}]`, 'true')
  }
  const r = await cmsFetch<FindResult<OfertaDTO> & { totalPages?: number }>(`/api/ofertas?${q}`)
  return { docs: r.docs, totalDocs: r.totalDocs, totalPages: r.totalPages ?? 1 }
}

/**
 * O catálogo INTEIRO sem o `corpo` — é o que a home precisa para montar as vitrines.
 *
 * `getOfertasDoTenant` traz o rich text de cada oferta: 109 artigos completos para render
 * um punhado de cartões. Aqui o `select` deixa passar só o que o cartão mostra, e a home
 * agrupa em memória em vez de fazer uma chamada por categoria.
 */
export async function getOfertasParaVitrine(tenantId: string | number, limit = 300): Promise<OfertaDTO[]> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][_status][equals]': 'published',
    sort: 'titulo',
    limit: String(limit),
    depth: '1',
  })
  const campos = ['titulo', 'slug', 'tipo', 'preco', 'desconto_loja', 'categorias', 'loja', 'wordpress_id', 'imagem', 'resumo']
  for (const campo of campos) {
    q.set(`select[${campo}]`, 'true')
  }
  return (await cmsFetch<FindResult<OfertaDTO>>(`/api/ofertas?${q}`)).docs
}

/**
 * Mapa `url de afiliado → /r/{id}` de TODO o tenant. O corpo migrado do WP tem link de
 * afiliado cru no meio do texto, e link cru no HTML é proibido — este mapa é o que
 * permite trocá-lo pelo redirect na hora de renderizar.
 */
export async function getMapaAfiliados(tenantId: string | number): Promise<Map<string, string>> {
  const params = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][url_afiliado_fonte][exists]': 'true',
    'select[url_afiliado_fonte]': 'true',
    limit: '500',
    depth: '0',
  }).toString()

  const [ofertas, cupons] = await Promise.all([
    cmsFetch<FindResult<{ id: string | number; url_afiliado_fonte?: string | null }>>(`/api/ofertas?${params}`),
    cmsFetch<FindResult<{ id: string | number; url_afiliado_fonte?: string | null }>>(`/api/cupons?${params}`),
  ])

  const mapa = new Map<string, string>()
  for (const o of ofertas.docs) if (o.url_afiliado_fonte) mapa.set(o.url_afiliado_fonte, `/r/o${o.id}?ref=corpo`)
  // cupom por último: quando os dois têm a mesma URL, o cupom é o destino mais específico
  for (const c of cupons.docs) if (c.url_afiliado_fonte) mapa.set(c.url_afiliado_fonte, `/r/c${c.id}?ref=corpo`)
  return mapa
}

/**
 * Página /ofertas/{slug}: depth 2 para trazer loja, cupom E o upload dentro do corpo
 * (o nó upload do Lexical só vira objeto com url quando o depth alcança).
 */
export async function getOfertaBySlug(tenantId: string | number, slug: string): Promise<OfertaDTO | null> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][slug][equals]': slug,
    'where[and][2][_status][equals]': 'published',
    limit: '1',
    depth: '2',
  })
  return (await cmsFetch<FindResult<OfertaDTO>>(`/api/ofertas?${q}`)).docs[0] ?? null
}

/**
 * Estados de `produtos` que TÊM página pública. `rascunho` não tem: ainda não é conteúdo.
 * `encerrado` tem, e de propósito — a regra do PRD 08 é que a URL nunca some, ela passa a
 * dizer que a oferta acabou (some é o que gera 404 em link já compartilhado no grupo).
 */
export const PRODUTO_COM_PAGINA = new Set(['landing', 'indexavel', 'encerrado'])

/** O mesmo recorte do /r/p{id}: só estes dois estados monetizam (contrato do redirect). */
export const PRODUTO_MONETIZAVEL = new Set(['landing', 'indexavel'])

/**
 * Página /p/{slug} da coleção `produtos` (PRD 08). depth 2 pra trazer loja, cupom e a
 * imagem já como objeto — a página é SSR e o crawler precisa ver tudo no HTML inicial.
 */
export async function getProdutoBySlug(tenantId: string | number, slug: string): Promise<ProdutoDTO | null> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][slug][equals]': slug,
    'where[and][2][_status][equals]': 'published',
    limit: '1',
    depth: '2',
  })
  const produto = (await cmsFetch<FindResult<ProdutoDTO>>(`/api/produtos?${q}`)).docs[0] ?? null
  // cinto e suspensório: o filtro por tenant já foi na query, mas nada cruza tenant aqui
  // por engano de parâmetro — a mesma régua do catálogo físico.
  if (!produto || !PRODUTO_COM_PAGINA.has(produto.estado ?? '')) return null
  return produto
}

/** Outros produtos vivos da mesma loja — alternativas do gate anti-thin, sem página órfã. */
export async function getProdutosDaLoja(
  tenantId: string | number,
  lojaId: string | number,
  excetoId: string | number,
  limit = 6,
): Promise<ProdutoDTO[]> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][loja][equals]': String(lojaId),
    'where[and][2][_status][equals]': 'published',
    'where[and][3][estado][in]': 'landing,indexavel',
    'where[and][4][id][not_equals]': String(excetoId),
    limit: String(limit),
    depth: '1',
    sort: '-updatedAt',
  })
  try {
    const { docs } = await cmsFetch<FindResult<ProdutoDTO>>(`/api/produtos?${q}`)
    // o `not_equals` já foi na query; repetir aqui é o que impede a página de listar a si
    // mesma como "outra opção" se algum dia o filtro do lado de lá mudar de comportamento
    return docs.filter((d) => String(d.id) !== String(excetoId))
  } catch {
    // fileira de alternativas é enfeite: se o CMS tossir, a página do produto continua
    return []
  }
}

/** Outras ofertas da mesma loja — evita página órfã (checklist da skill nova-rota). */
export async function getOfertasDaLoja(
  lojaId: string | number,
  /** id a excluir — a oferta que está sendo lida. A página da LOJA não exclui ninguém. */
  excetoId?: string | number,
  limit = 12,
): Promise<OfertaDTO[]> {
  const q = new URLSearchParams({
    'where[and][0][loja][equals]': String(lojaId),
    'where[and][1][id][not_equals]': String(excetoId ?? 0),
    'where[and][2][_status][equals]': 'published',
    limit: String(limit),
    // depth 1 + select: as relacionadas viram cartão (imagem e resumo), sem trazer o corpo
    depth: '1',
  })
  for (const campo of ['titulo', 'slug', 'tipo', 'preco', 'desconto_loja', 'loja', 'wordpress_id', 'imagem', 'resumo']) {
    q.set(`select[${campo}]`, 'true')
  }
  return (await cmsFetch<FindResult<OfertaDTO>>(`/api/ofertas?${q}`)).docs
}

/**
 * Expirados NUNCA somem: viram acordeão "mantidos por transparência" (design v1.1).
 * É o oposto do padrão do mercado, e é o que sustenta a promessa de verificação.
 */
export async function getCuponsExpiradosDaLoja(lojaId: string | number, limit = 20): Promise<CupomDTO[]> {
  const q = new URLSearchParams({
    'where[and][0][loja][equals]': String(lojaId),
    'where[and][1][estado][equals]': 'expirado',
    'where[and][2][_status][equals]': 'published',
    sort: '-verificado_em',
    limit: String(limit),
    depth: '0',
  })
  return (await cmsFetch<FindResult<CupomDTO>>(`/api/cupons?${q}`)).docs
}

export async function getCuponsRecentes(tenantId: string | number, limit = 12): Promise<CupomDTO[]> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][estado][in]': 'publicado,expirando',
    'where[and][2][_status][equals]': 'published',
    sort: '-verificado_em',
    limit: String(limit),
    depth: '1',
  })
  return (await cmsFetch<FindResult<CupomDTO>>(`/api/cupons?${q}`)).docs
}

export interface CliqueInput {
  tenant: string | number
  tipo_doc: 'cupom' | 'oferta' | 'produto'
  doc_id: string
  loja?: string | number
  programa?: string
  ref: string
  user_agent_class?: 'humano' | 'bot' | 'agente-ia'
  ip_hash?: string
}

/**
 * Quanto o POST do clique pode levar. Em Node, o redirect espera o registro: o teto é curto
 * para o usuário não ficar parado. Nos Workers, o registro termina depois da resposta
 * (`waitUntil`, ver `/r/{id}`) e o teto pode ser folgado — lá o POST ao CMS, também num
 * Worker, leva de 1,3 s a 1,5 s, e o teto de 1,5 s abortava quase todo clique.
 */
export const TETO_DO_CLIQUE_ESPERANDO_MS = 1500
export const TETO_DO_CLIQUE_EM_SEGUNDO_PLANO_MS = 10_000

/**
 * Log de clique — contrato redirect-afiliado.md. Nunca lança: falha vira aviso no log, e o
 * redirect segue. `depth=0`: a resposta do POST não popula o tenant nem a loja (ninguém a
 * lê, e montar o tenant inteiro só atrasa o registro).
 */
export async function logClique(clique: CliqueInput, tetoMs = TETO_DO_CLIQUE_ESPERANDO_MS): Promise<void> {
  try {
    await cmsFetch('/api/cliques?depth=0', {
      method: 'POST',
      body: JSON.stringify(clique),
      signal: AbortSignal.timeout(tetoMs),
    })
  } catch (err) {
    console.warn('[cliques] log falhou (segue o redirect):', (err as Error).message)
  }
}

/**
 * O catálogo de `produtos` para a vitrine da home (PRD 08).
 *
 * As 7 páginas `/p/{slug}` do tenant 2 subiram no PR #56 respondendo 200 e sem NENHUM
 * caminho a partir da home: só quem já tivesse a URL chegava nelas. Elas servem
 * `x-robots-tag: noindex, follow`, e o `follow` é exatamente o que torna esta fileira
 * útil — o campo `indexavel` continua sendo decisão do editor, não desta listagem.
 *
 * Mesmo recorte de `getProdutosDaLoja`: `landing` e `indexavel`. `encerrado` tem página
 * (a URL nunca some) mas não é vitrine — anunciar na home o que acabou é a mesma mentira
 * que este arquivo inteiro está corrigindo.
 */
export async function getProdutosParaVitrine(
  tenantId: string | number,
  limit = 12,
): Promise<ProdutoDTO[]> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][_status][equals]': 'published',
    'where[and][2][estado][in]': 'landing,indexavel',
    limit: String(limit),
    // depth 1: loja e imagem viram objeto pro cartão — o resto do doc não é preciso
    depth: '1',
    sort: '-updatedAt',
  })
  for (const campo of ['titulo', 'slug', 'preco', 'preco_em', 'loja', 'imagem', 'estado']) {
    q.set(`select[${campo}]`, 'true')
  }
  try {
    return (await cmsFetch<FindResult<ProdutoDTO>>(`/api/produtos?${q}`)).docs
  } catch (e) {
    // a home não some porque o catálogo tossiu — ela perde uma fileira
    console.error('[home] getProdutosParaVitrine falhou:', (e as Error).message)
    return []
  }
}
