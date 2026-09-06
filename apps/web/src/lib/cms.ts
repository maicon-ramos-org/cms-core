/**
 * Cliente REST do Payload (server-side only).
 * Autentica com a API key do usuário de serviço `web-server` (papel: sistema).
 */

const CMS_URL = () => process.env.CMS_URL ?? 'http://localhost:3000'
const CMS_API_KEY = () => process.env.CMS_API_KEY ?? ''

/**
 * Base PÚBLICA do CMS (a que o navegador alcança). O Payload devolve a mídia como
 * caminho relativo (`/api/midia/file/x.avif`), que resolveria contra o host do SITE e
 * daria 404 — a imagem mora no CMS. Em produção o host interno costuma ser diferente do
 * público, daí a env separada.
 */
const CMS_PUBLIC_URL = () => process.env.CMS_PUBLIC_URL ?? CMS_URL()

/**
 * Canonical byte a byte igual ao do WordPress: ele publica o caminho percent-encoded com
 * hex MINÚSCULO (`%e2%80%91`). Emitir o caractere cru é equivalente pro navegador, mas o
 * diff de paridade compara string — e o que já está indexado é a forma encodada.
 */
export const caminhoCanonico = (segmento: string): string =>
  encodeURIComponent(segmento).replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase())

/** Caminho de mídia do Payload → URL absoluta que o navegador consegue buscar. */
export const urlMidia = (url?: string | null): string | undefined => {
  if (!url) return undefined
  return /^https?:\/\//i.test(url) ? url : `${CMS_PUBLIC_URL().replace(/\/$/, '')}${url}`
}

/**
 * Imagem do Payload. `sizes.cartao` é o derivado de 640px gerado por `regenera:tamanhos`;
 * pode não existir (upload antigo ainda não reprocessado), e por isso quem consome sempre
 * cai no original.
 */
export interface MidiaDTO {
  url?: string
  alt?: string
  width?: number
  height?: number
  sizes?: { cartao?: { url?: string | null; width?: number | null; height?: number | null } | null } | null
}

export interface TenantDTO {
  id: string | number
  slug: string
  nome: string
  canonical_host: string
  /** papéis do design system (design-tokens.md v1.0.0) — ver contrato colecoes.md */
  tema?: {
    cor_primaria?: string
    /** texto POR CIMA da marca — chip ativo, CTA do cabeçalho */
    cor_sobre_marca?: string
    cor_fundo?: string
    cor_acao?: string
    cor_sobre_acao?: string
    cor_desconto?: string
    cor_verificado?: string
    cor_texto?: string
    cor_apoio?: string
    cor_sutil?: string
    cor_superficie?: string
    cor_superficie_marca?: string
    cor_superficie_verificado?: string
    cor_borda?: string
    cor_borda_codigo?: string
    cor_superficie_expirado?: string
    cor_aviso?: string
    fonte_titulos?: string
    fonte_corpo?: string
    /** letreiro da marca, usado no cabeçalho e no rodapé */
    logo?: MidiaDTO | string | number | null
    /** ícone QUADRADO da aba — não é o logo em tamanho menor; ver colecoes.md */
    favicon?: MidiaDTO | string | number | null
    /** o conjunto de ícones — um por formato que as plataformas pedem */
    icones?: {
      svg?: MidiaDTO | string | number | null
      ico?: MidiaDTO | string | number | null
      apple?: MidiaDTO | string | number | null
      png192?: MidiaDTO | string | number | null
      png512?: MidiaDTO | string | number | null
    } | null
  }
  /**
   * PRD 12 — os mesmos papéis, com os valores de quando o sistema do leitor está no
   * escuro. `ativo` é o interruptor: sem ele o site serve só o claro.
   */
  tema_escuro?: {
    ativo?: boolean | null
    cor_primaria?: string
    cor_sobre_marca?: string
    cor_fundo?: string
    cor_acao?: string
    cor_sobre_acao?: string
    cor_desconto?: string
    cor_verificado?: string
    cor_texto?: string
    cor_apoio?: string
    cor_sutil?: string
    cor_superficie?: string
    cor_superficie_marca?: string
    cor_superficie_verificado?: string
    cor_borda?: string
    cor_borda_codigo?: string
    cor_superficie_expirado?: string
    cor_aviso?: string
    /** letreiro alternativo — só existe pra logo de tinta escura, que some no fundo escuro */
    logo?: MidiaDTO | string | number | null
  } | null
  programas_ativos?: Array<{ programa: string; id_afiliado_env: string }>
  chat_enabled?: boolean
  /** liga o polyfill do WebMCP pra quem não tem suporte nativo (PRD 11 RF10) */
  webmcp_polyfill?: boolean | null
  seo?: { title_pattern_loja?: string; gsc_property?: string; sitemap_enabled?: boolean }
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
 * Caminho público da oferta. NÃO é sempre `/ofertas/{slug}`: os 57 deals do AppSumo foram
 * publicados no WordPress em `/apps/{slug}` e a URL indexada é a verdade — trocá-los de
 * pasta durante a troca de stack misturaria duas mudanças e cobraria 301 de graça.
 *
 * Derivado de `wordpress_id` (`app:` vs `product:`) em vez de campo novo: um campo que
 * sempre é igual a uma derivação é duplicata que um dia diverge. Quem decide a rota é a
 * origem do registro, e ela já está gravada.
 */
export const caminhoDaOferta = (o: { slug: string; wordpress_id?: string | null }): string =>
  `${String(o.wordpress_id ?? '').startsWith('app:') ? '/apps' : '/ofertas'}/${caminhoCanonico(o.slug)}/`

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
}

export interface OfertaDTO {
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

interface FindResult<T> {
  docs: T[]
  totalDocs: number
}

export async function cmsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CMS_URL()}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `users API-Key ${CMS_API_KEY()}`,
      ...(init?.headers ?? {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(8000),
  })
  if (!res.ok) {
    throw new Error(`CMS ${path} → HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

/**
 * Busca UM doc por id, ESCOPADO pelo tenant do host e por _status published —
 * usado no /r/{id}: nada cruza tenant, e draft/despublicado não monetiza.
 * (o nome lembra: o chamador passa o tenant explicitamente, nunca confie no id cru)
 */
export async function cmsFindOneNoTenant<T>(
  colecao: string,
  id: string,
  tenantId: string | number,
  depth = 1,
): Promise<T | null> {
  try {
    const q = new URLSearchParams({
      'where[and][0][id][equals]': id,
      'where[and][1][tenant][equals]': String(tenantId),
      'where[and][2][_status][equals]': 'published',
      limit: '1',
      depth: String(depth),
    })
    const r = await cmsFetch<FindResult<T>>(`/api/${colecao}?${q}`)
    return r.docs[0] ?? null
  } catch {
    return null
  }
}

export async function getTenantByHost(host: string): Promise<TenantDTO | null> {
  // depth 1: o favicon é upload e precisa vir com `url`. Custa uma junção por resolução de
  // tenant, e o middleware cacheia o tenant por 60s — não é por requisição de página.
  const q = new URLSearchParams({ 'where[canonical_host][equals]': host, limit: '1', depth: '1' })
  const r = await cmsFetch<FindResult<TenantDTO>>(`/api/tenants?${q}`)
  return r.docs[0] ?? null
}

export async function getTenantBySlug(slug: string): Promise<TenantDTO | null> {
  const q = new URLSearchParams({ 'where[slug][equals]': slug, limit: '1', depth: '1' })
  const r = await cmsFetch<FindResult<TenantDTO>>(`/api/tenants?${q}`)
  return r.docs[0] ?? null
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

/** Dados do template `apps` — o JSON versionado no vault (fonte da verdade, RF5). */
export interface AppDados {
  slug?: string
  nome?: string
  h1?: string
  tagline?: string
  categoria?: string
  modo?: string
  hero_url?: string
  hero_alt?: string
  requisitos?: Record<string, { v?: number; r?: number; d?: number; cenario?: string }>
  nota_requisitos?: string
  fontes?: Array<{ label?: string; url?: string; conferido?: string }>
  features?: Array<{ t?: string; d?: string }>
  editorial?: string[]
  instalacao?: string[]
  guia_url?: string | { url?: string; titulo?: string; t?: string; u?: string }
  faq?: Array<{ q?: string; a?: string }>
  /** o card de oferta do hero: plano mais barato que atende o app, com a data da conferência */
  destaque?: {
    rotulo?: string
    preco?: string
    sufixo?: string
    specs?: string
    cta_url?: string
    cta_texto?: string
    badges?: string[]
  }
  /**
   * A tabela ranqueada de provedores, UMA POR PORTE (`leve`/`medio`/`pesado`). A ordem é o
   * dado: ela sai dos requisitos do app, e por isso muda entre os portes e entre as fichas.
   */
  planos?: Record<
    string,
    Array<{
      pos: number
      provedor: string
      plano: string
      chips: Array<{ t: string; tipo: string }>
      preco: string
      ciclo: string
      renova: string
      renova_tipo: string
      oferta_url: string
    }>
  >
  /** @deprecated derivado de `planos`; sobrevive porque o `.md` da ficha ainda lê daqui */
  oferta_por_provedor?: Record<string, string>
  relacionados?: Array<{ t?: string; u?: string }>
  termos_match?: string[]
}

export interface PageDTO {
  id: string | number
  titulo: string
  slug: string
  template: 'conteudo' | 'apps' | 'calculadora' | 'institucional' | 'contato' | 'indice'
  corpo?: unknown
  dados?: AppDados | null
  meta?: { title?: string | null; description?: string | null } | null
  updatedAt?: string
}

export async function getPageBySlug(
  tenantId: string | number,
  slug: string,
  template?: PageDTO['template'],
): Promise<PageDTO | null> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][slug][equals]': slug,
    'where[and][2][_status][equals]': 'published',
    limit: '1',
    depth: '1',
  })
  if (template) q.set('where[and][3][template][equals]', template)
  return (await cmsFetch<FindResult<PageDTO>>(`/api/pages?${q}`)).docs[0] ?? null
}

/** Hub /apps/: lista todas as fichas — nenhuma página fica órfã. */
export async function getPagesPorTemplate(
  tenantId: string | number,
  template: PageDTO['template'],
  limit = 200,
): Promise<PageDTO[]> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][template][equals]': template,
    'where[and][2][_status][equals]': 'published',
    sort: 'titulo',
    limit: String(limit),
    depth: '0',
  })
  return (await cmsFetch<FindResult<PageDTO>>(`/api/pages?${q}`)).docs
}

/**
 * Mídia pela URL ANTIGA do WordPress. O JSON dos apps referencia o hero pelo endereço
 * do WP (`/wp-content/uploads/...`), que é justamente o que `wp_url_antiga` guarda.
 */
export async function getMidiaPorUrlAntiga(
  url: string,
): Promise<{ url?: string; alt?: string; width?: number; height?: number } | null> {
  const q = new URLSearchParams({ 'where[wp_url_antiga][equals]': url, limit: '1', depth: '0' })
  const r = await cmsFetch<FindResult<{ url?: string; alt?: string; width?: number; height?: number }>>(
    `/api/midia?${q}`,
  )
  return r.docs[0] ?? null
}

/**
 * Várias mídias pelo `wp_url_antiga` de uma vez — o hub de apps precisa de 43 heros e
 * uma consulta por hero seriam 43 idas ao CMS pra montar uma página.
 */
export async function getMidiaPorUrlsAntigas(urls: string[]): Promise<Map<string, MidiaDTO>> {
  const limpas = [...new Set(urls.filter(Boolean))]
  if (limpas.length === 0) return new Map()
  const q = new URLSearchParams({ limit: String(limpas.length), depth: '0' })
  limpas.forEach((u, i) => q.set(`where[or][${i}][wp_url_antiga][equals]`, u))
  /*
   * `filename` é OBRIGATÓRIO na lista: no Payload a `url` do upload é derivada dele, e
   * pedir `url` sem `filename` devolve `url: null` — silenciosamente, sem erro. Foi assim
   * que o hub de apps ficou sem nenhuma imagem.
   */
  for (const campo of ['url', 'filename', 'alt', 'width', 'height', 'sizes', 'wp_url_antiga']) {
    q.set(`select[${campo}]`, 'true')
  }
  const docs = (await cmsFetch<FindResult<MidiaDTO & { wp_url_antiga?: string }>>(`/api/midia?${q}`)).docs
  return new Map(docs.filter((m) => m.wp_url_antiga).map((m) => [m.wp_url_antiga!, m]))
}

export interface CategoriaChip {
  id: string | number
  nome: string
  slug: string
}

export interface PostDTO {
  id: string | number
  titulo: string
  slug: string
  corpo?: unknown
  categoria?: { id: string | number; nome: string; slug: string } | string | number | null
  tags?: Array<{ id: string | number; nome: string; slug: string }> | string[] | null
  autor?:
    | { id: string | number; nome: string; slug: string; bio?: string; sameAs?: string[]; avatar?: MidiaDTO | string | number | null }
    | string
    | number
    | null
  capa?: MidiaDTO | string | number | null
  meta?: { title?: string | null; description?: string | null } | null
  publicado_em?: string | null
  atualizado_em?: string | null
  createdAt?: string
  updatedAt?: string
}

/** Página /{slug}: depth 2 traz categoria, autor, capa, tags e os uploads do corpo. */
export async function getPostBySlug(tenantId: string | number, slug: string): Promise<PostDTO | null> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][slug][equals]': slug,
    'where[and][2][_status][equals]': 'published',
    limit: '1',
    depth: '2',
  })
  return (await cmsFetch<FindResult<PostDTO>>(`/api/posts?${q}`)).docs[0] ?? null
}

/**
 * Coleta enxuta pro sitemap: só slug e data, em páginas de 500, sem depth. Sem o
 * `select` a resposta traria o corpo Lexical de 735 posts a cada geração.
 */
export async function listarParaSitemap(
  colecao: 'posts' | 'ofertas' | 'pages' | 'lojas',
  tenantId: string | number,
  campoData: string,
  filtros: Array<{ campo: string; operador: 'equals' | 'not_equals'; valor: string }> = [],
): Promise<Array<{ id: string | number; slug: string; lastmod?: string | null; wordpress_id?: string | null }>> {
  const saida: Array<{ id: string | number; slug: string; lastmod?: string | null; wordpress_id?: string | null }> = []
  let pagina = 1
  let totalPages = 1
  do {
    const q = new URLSearchParams({
      'where[and][0][tenant][equals]': String(tenantId),
      'where[and][1][_status][equals]': 'published',
      'select[slug]': 'true',
      // o caminho público da oferta depende da origem (ver caminhoDaOferta)
      'select[wordpress_id]': 'true',
      [`select[${campoData}]`]: 'true',
      limit: '500',
      page: String(pagina),
      depth: '0',
    })
    filtros.forEach((f, idx) => q.set(`where[and][${idx + 2}][${f.campo}][${f.operador}]`, f.valor))
    const r = await cmsFetch<
      FindResult<Record<string, unknown>> & { totalPages?: number }
    >(`/api/${colecao}?${q}`)
    totalPages = r.totalPages ?? 1
    for (const doc of r.docs) {
      if (typeof doc.slug === 'string') {
        saida.push({
          id: doc.id as string | number,
          slug: doc.slug,
          lastmod: (doc[campoData] as string) ?? null,
          wordpress_id: (doc.wordpress_id as string) ?? null,
        })
      }
    }
    pagina += 1
  } while (pagina <= totalPages)
  return saida
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

/** Hub /blog: acervo por data REAL de publicação, paginado (são 735 posts). */
export async function getPostsPaginados(
  tenantId: string | number,
  pagina: number,
  porPagina: number,
  /** filtro do arquivo: categoria OU tag. Objeto e não posicional porque já são dois. */
  filtro: { categoriaId?: string | number; tagId?: string | number } = {},
): Promise<{ docs: PostDTO[]; totalDocs: number; totalPages: number }> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][_status][equals]': 'published',
    sort: '-publicado_em',
    limit: String(porPagina),
    page: String(pagina),
    // depth 1 + select: as listas mostram a CAPA e a categoria, sem trazer o corpo do post
    depth: '1',
  })
  for (const campo of ['titulo', 'slug', 'publicado_em', 'capa', 'categoria', 'meta']) {
    q.set(`select[${campo}]`, 'true')
  }
  if (filtro.categoriaId !== undefined) q.set('where[and][2][categoria][equals]', String(filtro.categoriaId))
  if (filtro.tagId !== undefined) q.set('where[and][2][tags][in]', String(filtro.tagId))
  const r = await cmsFetch<FindResult<PostDTO> & { totalPages?: number }>(`/api/posts?${q}`)
  return { docs: r.docs, totalDocs: r.totalDocs, totalPages: r.totalPages ?? 1 }
}

export interface TagDTO {
  id: string | number
  nome: string
  slug: string
}

/** Tag pelo slug — alimenta /tag/{slug}. */
export async function getTagBySlug(tenantId: string | number, slug: string): Promise<TagDTO | null> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][slug][equals]': slug,
    limit: '1',
    depth: '0',
  })
  return (await cmsFetch<FindResult<TagDTO>>(`/api/tags?${q}`)).docs[0] ?? null
}

/**
 * Título e slug de TODOS os posts publicados — alimenta o índice A-Z do `/glossario/`.
 *
 * `select` de dois campos e depth 0: são 741 linhas, e trazer o post inteiro pra montar
 * uma lista de links seria ler o acervo pra escrever o índice dele. Ordenado no banco.
 */
export async function getPostsParaIndice(tenantId: string | number): Promise<Array<{ titulo: string; slug: string }>> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][_status][equals]': 'published',
    sort: 'titulo',
    limit: '2000',
    depth: '0',
    'select[titulo]': 'true',
    'select[slug]': 'true',
  })
  const r = await cmsFetch<FindResult<{ titulo: string; slug: string }>>(`/api/posts?${q}`)
  return r.docs
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

/** As 7 categorias curadas do blog — a taxonomia dos chips editoriais (spec §3). */
export async function getCategorias(tenantId: string | number): Promise<Array<{ id: string | number; nome: string; slug: string }>> {
  const q = new URLSearchParams({
    'where[tenant][equals]': String(tenantId),
    sort: 'nome',
    limit: '50',
    depth: '0',
  })
  return (await cmsFetch<FindResult<{ id: string | number; nome: string; slug: string }>>(`/api/categorias?${q}`)).docs
}

export async function getCategoriaBySlug(
  tenantId: string | number,
  slug: string,
): Promise<{
  id: string | number
  nome: string
  slug: string
  descricao_seo?: string | null
  meta?: { title?: string | null; description?: string | null } | null
} | null> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][slug][equals]': slug,
    limit: '1',
    depth: '0',
  })
  return (
    (
      await cmsFetch<
        FindResult<{
          id: string | number
          nome: string
          slug: string
          descricao_seo?: string | null
          meta?: { title?: string | null; description?: string | null } | null
        }>
      >(`/api/categorias?${q}`)
    ).docs[0] ?? null
  )
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

/** Todas as categorias do catálogo — alimenta o sitemap (a URL reflete a hierarquia). */
/**
 * As categorias do CATÁLOGO que entram na navegação — só as marcadas `canonica`, na ordem
 * de `ordem_chip`. O campo existe desde o contrato justamente pra isso: as 33 categorias
 * do WP têm duplicata (`VPS`, `Servidor VPS`, `Hospedagem VPS`), então o menu não sai da
 * lista bruta. A curadoria das 10 veio do menu que o runzos.com já serve hoje.
 */
/**
 * Busca por TÍTULO em posts, ofertas e lojas. Simples de propósito: `like` no título, sem
 * corpo e sem relevância. O campo do cabeçalho precisa levar a algum lugar, e é melhor uma
 * busca honesta e limitada — com a limitação dita na página — do que uma que finge ranquear.
 */
export async function buscaSimples(
  tenantId: string | number,
  termo: string,
  limite = 12,
): Promise<{ posts: PostDTO[]; ofertas: OfertaDTO[]; lojas: LojaDTO[] }> {
  /** `temDraft`: só as coleções com versões aceitam filtro por `_status`. `lojas` não tem,
   *  e filtrar por ele lá devolve QueryError — que o catch abaixo transformava em lista
   *  vazia, ou seja, a busca não achava loja nenhuma e não dizia por quê. */
  const busca = async <T>(colecao: string, campo: string, temDraft = true): Promise<T[]> => {
    const q = new URLSearchParams({ 'where[and][0][tenant][equals]': String(tenantId) })
    let i = 1
    if (temDraft) q.set(`where[and][${i++}][_status][equals]`, 'published')
    q.set(`where[and][${i}][${campo}][like]`, termo)
    q.set('limit', String(limite))
    q.set('depth', '0')
    try {
      return (await cmsFetch<FindResult<T>>(`/api/${colecao}?${q}`)).docs
    } catch (e) {
      // uma coleção fora do ar não derruba a página — mas o erro aparece, não some
      console.error(`[busca] ${colecao} falhou:`, (e as Error).message)
      return []
    }
  }
  const [posts, ofertas, lojas] = await Promise.all([
    busca<PostDTO>('posts', 'titulo'),
    busca<OfertaDTO>('ofertas', 'titulo'),
    busca<LojaDTO>('lojas', 'nome', false),
  ])
  return { posts, ofertas, lojas }
}

/**
 * Maior desconto entre as ofertas de pagamento único — o número do CTA do cabeçalho.
 *
 * Só conta desconto COM `verificado_em`: desconto sem carimbo não é dado confiável, e um
 * CTA que anuncia número sem lastro é a mesma promessa vazia que o projeto existe pra não
 * fazer. Sem nenhum verificado, devolve null e o CTA sai sem número.
 */
/**
 * Tudo que a busca instantânea precisa, numa leitura por coleção: slug, título e o
 * `wordpress_id` (que decide a rota da oferta). `select` explícito — sem ele a resposta
 * traria o corpo Lexical de 741 posts, que é o oposto de índice enxuto.
 */
export async function itensParaBusca(
  tenantId: string | number,
): Promise<
  Array<{ colecao: string; id: string | number; slug: string; nome: string; wordpress_id?: string | null; template?: string | null }>
> {
  const colecoes: Array<{ nome: string; campo: string; comStatus: boolean }> = [
    { nome: 'posts', campo: 'titulo', comStatus: true },
    { nome: 'ofertas', campo: 'titulo', comStatus: true },
    { nome: 'pages', campo: 'titulo', comStatus: true },
    { nome: 'lojas', campo: 'nome', comStatus: false },
  ]
  const saida: Array<{
    colecao: string
    id: string | number
    slug: string
    nome: string
    wordpress_id?: string | null
    /** ficha de app é `pages` mas mora em /apps/{slug} — sem isto a busca leva a 404 */
    template?: string | null
  }> = []
  await Promise.all(
    colecoes.map(async ({ nome: colecao, campo, comStatus }) => {
      let pagina = 1
      let totalPages = 1
      do {
        const q = new URLSearchParams({ 'where[and][0][tenant][equals]': String(tenantId) })
        if (comStatus) q.set('where[and][1][_status][equals]', 'published')
        q.set('select[slug]', 'true')
        q.set(`select[${campo}]`, 'true')
        q.set('select[wordpress_id]', 'true')
        if (colecao === 'pages') q.set('select[template]', 'true')
        q.set('limit', '500')
        q.set('page', String(pagina))
        q.set('depth', '0')
        const r = await cmsFetch<FindResult<Record<string, unknown>> & { totalPages?: number }>(
          `/api/${colecao}?${q}`,
        )
        totalPages = r.totalPages ?? 1
        for (const d of r.docs) {
          if (typeof d.slug === 'string' && typeof d[campo] === 'string') {
            saida.push({
              colecao,
              id: d.id as string | number,
              slug: d.slug,
              nome: d[campo] as string,
              wordpress_id: (d.wordpress_id as string) ?? null,
              template: (d.template as string) ?? null,
            })
          }
        }
        pagina += 1
      } while (pagina <= totalPages)
    }),
  )
  return saida
}

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

/** Leitura seguinte: mesma categoria, exceto o atual — nenhuma página fica órfã. */
/**
 * Bloco "Leia também" (PRD 04 — a camada que carrega a cauda longa da linkagem).
 *
 * A regra anterior era "5 mais recentes da mesma categoria". Medida no acervo inteiro, ela
 * alcançava **19 dos 536 posts sem link de entrada (3,5%)** e despejava **495 entradas num
 * único post**: como todo mundo da categoria vê os mesmos recém-publicados, o bloco
 * repetia meia dúzia de destinos e nunca chegava em quem precisava.
 *
 * Agora: parentesco por TAG primeiro, categoria como preenchimento — e janela de rotação
 * determinística pela origem DENTRO de cada faixa, para espalhar sem precisar de contador
 * global. Determinística porque render duas vezes tem que dar o mesmo bloco (RF do PRD 04
 * e requisito de cache por tag). Medido: 89,9% dos órfãos com k=4, maior entrada 43.
 *
 * Os 10% restantes precisam de escolha global (quem já recebeu?), que a renderização não
 * tem de graça — isso pede bloco pré-computado por job, e está proposto, não implementado.
 */
export async function getPostsRelacionados(
  tenantId: string | number,
  post: PostDTO,
  limit = 4,
): Promise<PostDTO[]> {
  const idsTag = (Array.isArray(post.tags) ? post.tags : [])
    .map((t) => (typeof t === 'object' && t ? String(t.id) : String(t)))
    .filter(Boolean)
  const categoriaId =
    typeof post.categoria === 'object' && post.categoria ? String(post.categoria.id) : String(post.categoria ?? '')

  const busca = async (filtro: Record<string, string>): Promise<PostDTO[]> => {
    const q = new URLSearchParams({
      'where[and][0][tenant][equals]': String(tenantId),
      'where[and][1][id][not_equals]': String(post.id),
      'where[and][2][_status][equals]': 'published',
      sort: 'id',
      limit: '200',
      ...filtro,
      depth: '0',
      'select[titulo]': 'true',
      'select[slug]': 'true',
    })
    return (await cmsFetch<FindResult<PostDTO>>(`/api/posts?${q}`)).docs
  }

  const porTag = idsTag.length ? await busca({ 'where[and][3][tags][in]': idsTag.join(',') }) : []
  const escolhidos: PostDTO[] = []
  const vistos = new Set<string>()
  const semente = hashEstavel(String(post.id))

  // as faixas são thunks: a busca por categoria só sai se a faixa de tag não encheu o
  // bloco. Como array literal, a segunda query rodava em TODA renderização de post.
  const faixas: Array<() => Promise<PostDTO[]>> = [
    async () => porTag,
    async () => (categoriaId ? busca({ 'where[and][3][categoria][equals]': categoriaId }) : []),
    // Terceira faixa: o mais recente do site. Existe por causa do leitor, não da métrica —
    // um post pode estar "coberto" (recebe entrada de outros) e ainda assim mostrar um
    // bloco de 2 itens. `Finanças PJ` tem 3 posts no acervo inteiro; sem esta faixa, o
    // post de conta PJ renderiza capenga pra sempre.
    async () => busca({ sort: '-publicado_em', limit: '20' }),
  ]
  for (const faixa of faixas) {
    if (escolhidos.length >= limit) break
    const restantes = (await faixa()).filter((p) => !vistos.has(String(p.id)))
    for (let i = 0; i < restantes.length && escolhidos.length < limit; i += 1) {
      const escolhido = restantes[(semente + i) % restantes.length]!
      if (vistos.has(String(escolhido.id))) continue
      vistos.add(String(escolhido.id))
      escolhidos.push(escolhido)
    }
  }

  /*
   * As buscas acima pedem só título e slug de propósito: elas varrem até 200 candidatos
   * pra ESCOLHER, e trazer capa de 200 posts pra mostrar 4 seria pagar 50x pelo que se usa.
   * A capa vem aqui, numa consulta só, pelos ids já escolhidos.
   */
  if (escolhidos.length === 0) return escolhidos
  const q = new URLSearchParams({
    'where[id][in]': escolhidos.map((p) => String(p.id)).join(','),
    limit: String(escolhidos.length),
    depth: '1',
  })
  for (const campo of ['titulo', 'slug', 'publicado_em', 'capa', 'categoria', 'meta']) q.set(`select[${campo}]`, 'true')
  const cheios = new Map(
    (await cmsFetch<FindResult<PostDTO>>(`/api/posts?${q}`)).docs.map((p) => [String(p.id), p]),
  )
  // mantém a ORDEM da seleção: o `in` do Postgres não devolve na ordem pedida
  return escolhidos.map((p) => cheios.get(String(p.id)) ?? p)
}

/** Mesma família do hash do auto-linker: a janela do bloco tem que ser estável entre renders. */
function hashEstavel(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
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

/** Log de clique — contrato redirect-afiliado.md. Nunca bloqueia o redirect por falha. */
export async function logClique(clique: CliqueInput): Promise<void> {
  try {
    await cmsFetch('/api/cliques', {
      method: 'POST',
      body: JSON.stringify(clique),
      signal: AbortSignal.timeout(1500),
    })
  } catch (err) {
    console.warn('[cliques] log falhou (segue o redirect):', (err as Error).message)
  }
}
