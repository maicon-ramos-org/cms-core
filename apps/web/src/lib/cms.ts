/**
 * Cliente REST do Payload (server-side only).
 * Autentica com a API key do usuário de serviço `web-server` (papel: sistema).
 */

const CMS_URL = () => process.env.CMS_URL ?? 'http://localhost:3000'
const CMS_API_KEY = () => process.env.CMS_API_KEY ?? ''

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
  cupom?: CupomDTO | string | number | null
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

/** Busca um doc por id sem estourar exceção em 404 (usado no /r/{id}). */
export async function cmsFindById<T>(colecao: string, id: string, depth = 1): Promise<T | null> {
  try {
    return await cmsFetch<T>(`/api/${colecao}/${encodeURIComponent(id)}?depth=${depth}`)
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
    sort: '-verificado_em',
    limit: '100',
    depth: '0',
  })
  return (await cmsFetch<FindResult<CupomDTO>>(`/api/cupons?${q}`)).docs
}

export async function getCuponsRecentes(tenantId: string | number, limit = 12): Promise<CupomDTO[]> {
  const q = new URLSearchParams({
    'where[and][0][tenant][equals]': String(tenantId),
    'where[and][1][estado][in]': 'publicado,expirando',
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
