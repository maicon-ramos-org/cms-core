/** Geração de índice fora do acesso público: somente metadados, nunca listings comerciais. */
import type { FichaMonetizavelDTO } from '../../conteudo'
import { fichaDoCatalogo, type ProdutoFisico } from './catalogo'
import { caminhoCanonico, caminhoDaOferta, cmsFetch, urlMidia, type OfertaDTO, type TenantDTO } from './cms'
import { fichaDaOfertaPublica } from './oferta-ficha'
import { ehLinkDeAfiliado } from './links-de-afiliado'

export interface EntradaFichaLlms { titulo: string; html: string; markdown: string }
type Pagina<T> = { docs: T[]; totalPages: number; page: number }
const LIMITE = 100
const campos = {
  ofertas: ['id', 'tenant', '_status', 'titulo', 'slug', 'wordpress_id', 'indexavel'],
  produtos_fisicos: ['id', 'tenant', '_status', 'nome', 'slug', 'marca', 'modelo', 'estado', 'indexavel'],
} as const
const compara = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const slugPublico = (slug: string) => typeof slug === 'string' && slug.length <= 200 && /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(slug)

/** Mesmo transporte REST dos readers públicos, paginado sem carregar rich text/loja/cupom. */
async function* documentos<T>(collection: keyof typeof campos, tenantId: string | number): AsyncGenerator<T> {
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({ 'where[and][0][tenant][equals]': String(tenantId),
      limit: String(LIMITE), page: String(page), depth: '0', sort: 'id' })
    if (collection === 'ofertas') q.set('where[and][1][_status][equals]', 'published')
    else {
      // O catálogo físico não usa drafts do Payload: publicação é o campo estado.
      q.set('where[and][1][estado][equals]', 'published')
      q.set('where[and][2][indexavel][equals]', 'true')
    }
    for (const campo of campos[collection]) q.set(`select[${campo}]`, 'true')
    const result = await cmsFetch<Pagina<T>>(`/api/${collection}?${q}`)
    // Resposta incompleta/inconsistente não pode virar silenciosamente índice parcial.
    if (!Array.isArray(result.docs) || !Number.isInteger(result.totalPages) || result.totalPages < 1 ||
      result.page !== page || (page < result.totalPages && result.docs.length === 0)) {
      throw new Error(`Paginação inválida do índice de ${collection}`)
    }
    yield* result.docs
    if (page >= result.totalPages) return
  }
}

const linhaMarkdown = (titulo: string) => titulo.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/[\\[\]()`*<>]/g, '\\$&').trim()
export function linhaFichaLlms(entrada: EntradaFichaLlms): string {
  return `- [${linhaMarkdown(entrada.titulo)}](${entrada.html}) — [Markdown](${entrada.markdown})`
}

/** Metadados normalizados pelo mesmo DTO das rotas; não decide persistência nem indexação. */
export async function fichasParaLlms(tenant: TenantDTO): Promise<EntradaFichaLlms[]> {
  const base = new URL(`https://${tenant.canonical_host}`)
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Host canônico inválido para índice de fichas')
  }
  type Candidato = EntradaFichaLlms & { identity: FichaMonetizavelDTO['identity'] }
  const entrada = (dto: FichaMonetizavelDTO | null, caminho: string): Candidato[] => {
    if (!dto || dto.identity.tenantId !== String(tenant.id) || !slugPublico(dto.slug) || !dto.editorial.name.trim() ||
      !/^\/(?!\/)/.test(caminho) || /[?#\\\s]/.test(caminho) || !caminho.endsWith('/')) return []
    return [{ titulo: dto.editorial.name, html: `${base.origin}${caminho}`,
      markdown: `${base.origin}${caminho.slice(0, -1)}.md`, identity: dto.identity }]
  }
  const ofertas = async () => {
    const result: Candidato[] = []
    for await (const oferta of documentos<OfertaDTO>('ofertas', tenant.id)) {
      // A oferta legada publicada é indexável pela rota atual: não existe flag obrigatória
      // na collection. Respeitar opt-out quando fornecido, sem mudar editorial.indexable.
      if (oferta._status !== 'published' || oferta.indexavel === false || !slugPublico(oferta.slug)) continue
      const ficha = fichaDaOfertaPublica(oferta, tenant, { resolveMidia: urlMidia, ehLinkDeAfiliado })
      result.push(...entrada(ficha, caminhoDaOferta(oferta)))
    }
    return result
  }
  const produtos = async () => {
    const result: Candidato[] = []
    for await (const produto of documentos<ProdutoFisico>('produtos_fisicos', tenant.id)) {
      if (!slugPublico(produto.slug)) continue
      const ficha = fichaDoCatalogo({ produto, variantes: [], ofertas: [] }, tenant.id)
      if (!ficha?.editorial.indexable) continue
      result.push(...entrada(ficha, `/p/${caminhoCanonico(ficha.slug)}/`))
    }
    return result
  }
  const candidatos = (await Promise.all([ofertas(), produtos()])).flat().sort((a, b) =>
    compara(a.html, b.html) ||
    // /p resolve o físico primeiro; em colisão REAL de URL, conservar sua ficha.
    (a.identity.source === b.identity.source ? 0 : a.identity.source === 'product' ? -1 : 1) ||
    compara(a.identity.id, b.identity.id) || compara(a.titulo, b.titulo))
  const porCanonical = new Map<string, EntradaFichaLlms>()
  for (const { html, titulo, markdown } of candidatos) {
    // Nunca deduplicar por id, título ou slug: origens diferentes podem ter URLs próprias.
    if (!porCanonical.has(html)) porCanonical.set(html, { titulo, html, markdown })
  }
  return [...porCanonical.values()]
}
