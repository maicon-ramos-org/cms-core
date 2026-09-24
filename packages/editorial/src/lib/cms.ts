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

/** Um derivado de `midia.imageSizes`, como a REST devolve. `url` vazia = não foi gerado. */
export interface DerivadoDTO {
  url?: string | null
  width?: number | null
  height?: number | null
  mimeType?: string | null
}

/**
 * Imagem do Payload, com os três derivados do PRD 18 RF4 (tabela em colecoes.md):
 * `cartao` (640, AVIF, proporção da original), `capa` (1600×900 AVIF, hero do post) e
 * `og` (1200×630 JPEG, compartilhamento). Qualquer um pode não existir — upload antigo
 * ainda não reprocessado pelo `regenera:tamanhos` —, e por isso quem consome sempre tem
 * um caminho sem ele.
 */
export interface MidiaDTO {
  url?: string
  alt?: string
  width?: number
  height?: number
  sizes?: { cartao?: DerivadoDTO | null; capa?: DerivadoDTO | null; og?: DerivadoDTO | null } | null
}

/**
 * O tenant como o site lê — só os campos do núcleo. Campo que um plugin ou o site acrescenta
 * em `tenants` entra no tipo por ampliação (`declare module '@runzos/editorial/lib/cms'`,
 * `interface TenantDTO { ... }`), no pacote ou no site dono dele.
 */
export interface TenantDTO {
  id: string | number
  slug: string
  nome: string
  canonical_host: string
  /**
   * O tema da casa na forma que cabe depois de "de" ("software e hospedagem", "impressão
   * 3D"). Vazio é válido e significa "não emita a frase" — ver `lib/nicho.ts` e PRD 14 D4.
   */
  nicho?: string | null
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
  /** liga o polyfill do WebMCP pra quem não tem suporte nativo (PRD 11 RF10) */
  webmcp_polyfill?: boolean | null
  seo?: SeoDoTenant
}

/** O grupo `seo` do tenant, ampliável do mesmo jeito que o `TenantDTO`. */
export interface SeoDoTenant {
  gsc_property?: string
  sitemap_enabled?: boolean
}

export interface FindResult<T> {
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

/**
 * Os templates de `pages`. O núcleo declara os dele; plugin e site acrescentam os seus por
 * ampliação (`interface TemplatesDePagina { meu_template: true }`) — o mesmo caminho do
 * `TenantDTO`.
 */
export interface TemplatesDePagina {
  conteudo: true
  institucional: true
  contato: true
  indice: true
}
export type TemplateDePagina = keyof TemplatesDePagina

/** A forma de `pages.dados` por template — ampliável como `TemplatesDePagina`. */
export interface DadosDasPaginas {}
export type DadosDePagina = DadosDasPaginas[keyof DadosDasPaginas]

export interface PageDTO {
  id: string | number
  titulo: string
  slug: string
  template: TemplateDePagina
  corpo?: unknown
  /* uma união, não `unknown`: cada template tem a sua forma, e o consumidor faz o cast
     para a que corresponde ao `template` que ele pediu */
  dados?: DadosDePagina | null
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

/** Hub de um template: lista todas as páginas dele — nenhuma fica órfã. */
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
 * Mídia pelo ID do Payload — o vínculo que os templates novos usam.
 *
 * As fichas de app referenciam o hero pela URL antiga do WordPress porque nasceram da
 * migração. `modelos` e `automacoes` nascem no Payload e guardam o id, que é o vínculo
 * certo: não depende de um endereço de outro servidor continuar existindo.
 */
export async function getMidiaPorId(id: number | string): Promise<MidiaDTO | null> {
  if (!id) return null
  try {
    return await cmsFetch<MidiaDTO>(`/api/midia/${id}?depth=0`)
  } catch {
    // mídia apagada não derruba a página: o hero some, o conteúdo fica
    return null
  }
}

export interface CategoriaChip {
  id: string | number
  nome: string
  slug: string
}

export interface PostDTO {
  /**
   * O subtipo de `Article` que o WordPress declarava nesta URL. Vazio = `BlogPosting`.
   * Existe porque 63% do acervo mudaria de tipo na virada sem ele (ver contrato).
   */
  tipo_schema?: string[] | null
  /** FAQ que o WP publicava só no JSON-LD; vira FAQPage (import:faq) */
  faq?: Array<{ pergunta: string; resposta: string }> | null
  /**
   * Nós de JSON-LD que não se deduzem do documento — hoje `Review`, com a nota editorial
   * que o WordPress declarava. Existia na coleção e nenhum template lia (import:review).
   */
  schema_extra?: unknown[] | null
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
  colecao: string,
  tenantId: string | number,
  campoData: string,
  // `not_in` existe por causa das pastas próprias: `not_equals` só exclui UM template, e
  // mais de um pode ter rota fora da raiz
  filtros: Array<{ campo: string; operador: 'equals' | 'not_equals' | 'not_in'; valor: string }> = [],
): Promise<Array<{ id: string | number; slug: string; lastmod?: string | null; wordpress_id?: string | null }>> {
  const saida: Array<{ id: string | number; slug: string; lastmod?: string | null; wordpress_id?: string | null }> = []
  let pagina = 1
  let totalPages = 1
  do {
    const q = new URLSearchParams({
      'where[and][0][tenant][equals]': String(tenantId),
      'where[and][1][_status][equals]': 'published',
      'select[slug]': 'true',
      // o caminho público de alguns tipos depende da origem do documento
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

/** Um documento de uma coleção, no formato enxuto do índice de busca. */
export interface ItemDaColecao {
  colecao: string
  id: string | number
  slug: string
  nome: string
  wordpress_id?: string | null
  /** só em `pages`: a ficha que mora numa pasta própria precisa do template para o endereço */
  template?: string | null
}

/**
 * Todos os documentos publicados de UMA coleção, só slug e título (ou nome), em páginas de
 * 500 — a matéria-prima do índice de busca. A ordem é a do CMS, página a página; quem junta
 * várias coleções junta em ordem fixa (ver `indice-de-busca.ts`), nunca na ordem em que as
 * respostas chegam.
 */
export async function itensDaColecao(
  tenantId: string | number,
  colecao: string,
  campo: string,
  comStatus = true,
): Promise<ItemDaColecao[]> {
  const saida: ItemDaColecao[] = []
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
    const r = await cmsFetch<FindResult<Record<string, unknown>> & { totalPages?: number }>(`/api/${colecao}?${q}`)
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
  return saida
}

/**
 * Busca por TÍTULO numa coleção (`like`), a da página `/busca/`. `temDraft`: só as coleções
 * com versões aceitam filtro por `_status` — filtrar por ele numa coleção sem versões devolve
 * QueryError, que viraria lista vazia sem dizer por quê.
 */
export async function buscaPorTitulo<T>(
  tenantId: string | number,
  colecao: string,
  campo: string,
  termo: string,
  limite = 12,
  temDraft = true,
): Promise<T[]> {
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
