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

/** Caminho de mídia do Payload → URL absoluta que o navegador consegue buscar. */
export const urlMidia = (url?: string | null): string | undefined => {
  if (!url) return undefined
  return /^https?:\/\//i.test(url) ? url : `${CMS_PUBLIC_URL().replace(/\/$/, '')}${url}`
}

export interface TenantDTO {
  id: string | number
  slug: string
  nome: string
  canonical_host: string
  tema?: { cor_primaria?: string; cor_fundo?: string; fonte?: string }
  programas_ativos?: Array<{ programa: string; id_afiliado_env: string }>
  chat_enabled?: boolean
  seo?: { title_pattern_loja?: string }
}

export interface LojaDTO {
  id: string | number
  nome: string
  slug: string
  url_site: string
  programa: string
  faq?: Array<{ pergunta: string; resposta: string }>
  tenant?: string | number | TenantDTO
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
  loja?: LojaDTO | string | number
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
  const q = new URLSearchParams({ 'where[canonical_host][equals]': host, limit: '1', depth: '0' })
  const r = await cmsFetch<FindResult<TenantDTO>>(`/api/tenants?${q}`)
  return r.docs[0] ?? null
}

export async function getTenantBySlug(slug: string): Promise<TenantDTO | null> {
  const q = new URLSearchParams({ 'where[slug][equals]': slug, limit: '1', depth: '0' })
  const r = await cmsFetch<FindResult<TenantDTO>>(`/api/tenants?${q}`)
  return r.docs[0] ?? null
}

export async function getLojas(tenantId: string | number): Promise<LojaDTO[]> {
  const q = new URLSearchParams({
    'where[tenant][equals]': String(tenantId),
    limit: '100',
    sort: 'nome',
    depth: '0',
  })
  return (await cmsFetch<FindResult<LojaDTO>>(`/api/lojas?${q}`)).docs
}

export async function getLojaBySlug(tenantId: string | number, slug: string): Promise<LojaDTO | null> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][slug][equals]': slug,
    limit: '1',
    depth: '0',
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

export interface PostDTO {
  id: string | number
  titulo: string
  slug: string
  corpo?: unknown
  categoria?: { id: string | number; nome: string; slug: string } | string | number | null
  tags?: Array<{ id: string | number; nome: string; slug: string }> | string[] | null
  autor?: { id: string | number; nome: string; slug: string; bio?: string; sameAs?: string[] } | string | number | null
  capa?: { url?: string; alt?: string; width?: number; height?: number } | string | number | null
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

/** Leitura seguinte: mesma categoria, exceto o atual — nenhuma página fica órfã. */
export async function getPostsRelacionados(
  categoriaId: string | number,
  excetoId: string | number,
  limit = 5,
): Promise<PostDTO[]> {
  const q = new URLSearchParams({
    'where[and][0][categoria][equals]': String(categoriaId),
    'where[and][1][id][not_equals]': String(excetoId),
    'where[and][2][_status][equals]': 'published',
    sort: '-publicado_em',
    limit: String(limit),
    depth: '0',
  })
  return (await cmsFetch<FindResult<PostDTO>>(`/api/posts?${q}`)).docs
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
  excetoId: string | number,
  limit = 6,
): Promise<OfertaDTO[]> {
  const q = new URLSearchParams({
    'where[and][0][loja][equals]': String(lojaId),
    'where[and][1][id][not_equals]': String(excetoId),
    'where[and][2][_status][equals]': 'published',
    limit: String(limit),
    depth: '0',
  })
  return (await cmsFetch<FindResult<OfertaDTO>>(`/api/ofertas?${q}`)).docs
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
