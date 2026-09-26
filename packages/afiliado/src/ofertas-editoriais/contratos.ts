/** Contrato compartilhado entre CMS Node e consumidores Workers; sem dependências Node. */
export type IdOferta = string | number
export type RelacaoOferta = IdOferta | { id: IdOferta }
export interface ProgramaOferta { slug: string; rotulo: string; hostsPermitidos: readonly string[] }
export type RegistroProgramasOferta = readonly Readonly<ProgramaOferta>[]
export interface EvidenciaComercial {
  vendas?: number | null
  numero_avaliacoes?: number | null
  avaliacao?: number | null
  desconto_percentual?: number | null
  fonte?: string | null
  observado_em?: string | null
}
export interface OfertaEditorial {
  id: IdOferta
  tenant: RelacaoOferta
  origem?: string
  slug: string
  nome: string
  nome_exibicao?: string | null
  programa: string
  external_id?: string | null
  estado: 'ativa' | 'quebrada' | 'pausada' | 'encerrada'
  _status?: 'draft' | 'published'
  url_afiliado?: string | null
  url_produto?: string | null
  preco?: string | null
  comissao_taxa?: string | null
  comissao_estimada?: string | null
  contexto_de_uso?: string | null
  disclosure?: boolean | null
  especificacoes?: Array<{ rotulo: string; valor: string }> | null
  pros_contras?: Array<{ tipo: 'pro' | 'con'; texto: string }> | null
  analise_md?: string | null
  imagem_comercial?: { url?: string | null; alt?: string | null } | null
  evidencia_comercial?: EvidenciaComercial | null
  espelho_de?: RelacaoOferta | null
  correspondencia?: 'exato' | 'equivalente' | 'busca' | null
  atualizado_na_origem?: string | null
}
export interface EscolhaEditorial { oferta: RelacaoOferta; papel: string; posicao: number }

export const idOferta = (value: RelacaoOferta | null | undefined): string =>
  value == null ? '' : String(typeof value === 'object' ? value.id : value)

export function registrarProgramasOferta(programas: readonly ProgramaOferta[]): RegistroProgramasOferta {
  const slugs = new Set<string>()
  return Object.freeze(programas.map(p => {
    if (!p || typeof p.slug !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(p.slug) || slugs.has(p.slug) || !p.rotulo?.trim()) throw new Error('Programa de oferta inválido ou duplicado.')
    if (!p.hostsPermitidos.length || p.hostsPermitidos.some(h => typeof h !== 'string' ||
      !/^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)+$/.test(h) || /^\d+(?:\.\d+){3}$/.test(h))) throw new Error('Hosts devem ser nomes exatos, sem wildcard, esquema, porta ou IP.')
    slugs.add(p.slug)
    return Object.freeze({ slug: p.slug, rotulo: p.rotulo, hostsPermitidos: Object.freeze([...new Set(p.hostsPermitidos)]) })
  }))
}

/** Não passa por Number: preserva precisão e nunca transforma null em preço zero. */
export function decimalExato(value: unknown, casas = 2): string | null {
  if (value == null) return null
  if (!Number.isInteger(casas) || casas < 0 || casas > 4 || typeof value !== 'string') throw new Error('Use texto decimal exato ou null.')
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value)
  if (!m || (m[3]?.length ?? 0) > casas) throw new Error('Decimal inválido ou com casas excedentes.')
  const inteiro = m[2]!.replace(/^0+(?=\d)/, '')
  const fracao = (m[3] ?? '').padEnd(casas, '0')
  const sinal = m[1] && /[1-9]/.test(inteiro + fracao) ? '-' : ''
  return `${sinal}${inteiro}${casas ? `.${fracao}` : ''}`
}

export function urlHTTP(value: unknown): string | null {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return null
  try {
    const u = new URL(value)
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && !u.port ? u.href : null
  } catch { return null }
}
export function urlPermitida(value: unknown, programa: string, registro: RegistroProgramasOferta): string | null {
  const url = urlHTTP(value)
  if (!url) return null
  const hosts = registro.find(p => p.slug === programa)?.hostsPermitidos
  return hosts?.includes(new URL(url).hostname) ? url : null
}

export function projetarOfertaEditorial(oferta: OfertaEditorial, tenant: IdOferta, programas: RegistroProgramasOferta, canonica?: OfertaEditorial) {
  if (!idOferta(tenant) || idOferta(oferta.tenant) !== idOferta(tenant) || oferta._status !== 'published') return null
  if (oferta.espelho_de && (!canonica || idOferta(canonica.id) === idOferta(oferta.id) || idOferta(canonica.id) !== idOferta(oferta.espelho_de) || canonica.espelho_de ||
    idOferta(canonica.tenant) !== idOferta(tenant) || canonica._status !== 'published')) return null
  const evidencia = oferta.evidencia_comercial
  // Allowlist em todos os níveis; jamais espalhar documentos CMS em DTO público.
  return {
    id: oferta.id, slug: oferta.slug, nome: oferta.nome, nome_exibicao: oferta.nome_exibicao ?? null,
    programa: oferta.programa, estado: oferta.estado, preco: oferta.preco ?? null,
    contexto_de_uso: oferta.contexto_de_uso ?? null, disclosure: oferta.disclosure ?? null,
    href: `/ofertas/${encodeURIComponent(oferta.slug)}/`, canonicalId: oferta.espelho_de ? canonica!.id : oferta.id,
    correspondencia: oferta.correspondencia ?? null,
    elegivel: oferta.estado === 'ativa' && Boolean(urlPermitida(oferta.url_afiliado, oferta.programa, programas)),
    especificacoes: (oferta.especificacoes ?? []).map(s => ({ rotulo: s.rotulo, valor: s.valor })),
    pros_contras: (oferta.pros_contras ?? []).map(p => ({ tipo: p.tipo, texto: p.texto })),
    analise_md: oferta.analise_md ?? null,
    imagem_comercial: oferta.imagem_comercial ? { url: urlHTTP(oferta.imagem_comercial.url), alt: oferta.imagem_comercial.alt ?? null } : null,
    evidencia_comercial: evidencia ? { vendas: evidencia.vendas, numero_avaliacoes: evidencia.numero_avaliacoes,
      avaliacao: evidencia.avaliacao, desconto_percentual: evidencia.desconto_percentual,
      fonte: evidencia.fonte, observado_em: evidencia.observado_em } : null,
    atualizado_na_origem: oferta.atualizado_na_origem ?? null,
  }
}
export type OfertaEditorialPublica = NonNullable<ReturnType<typeof projetarOfertaEditorial>>

export function resolverEscolhasEditoriais(escolhas: readonly EscolhaEditorial[], ofertas: readonly OfertaEditorial[], tenant: IdOferta, programas: RegistroProgramasOferta) {
  const mapa = new Map(ofertas.filter(o => idOferta(o.tenant) === idOferta(tenant)).map(o => [idOferta(o.id), o]))
  const resolvidas = [...escolhas].sort((a, b) => a.posicao - b.posicao).map(e => {
    const o = mapa.get(idOferta(e.oferta))
    const oferta = o ? projetarOfertaEditorial(o, tenant, programas, o.espelho_de ? mapa.get(idOferta(o.espelho_de)) : undefined) : null
    return { papel: e.papel, posicao: e.posicao, oferta }
  })
  return { escolhas: resolvidas, canonicasElegiveis: new Set(resolvidas.filter(e => e.oferta?.elegivel).map(e => idOferta(e.oferta!.canonicalId))).size }
}
