import { validaSiteStripe, validaAmazonLink } from '@runzos/afflinks'
import { sql } from '@payloadcms/db-postgres'
import { ValidationError, type CollectionBeforeChangeHook, type CollectionAfterChangeHook, type PayloadRequest, type CollectionSlug } from 'payload'
import { avaliaMatch, atributosFilamento, chaveVariante, idRel, identidadeListing, normaliza } from './regras'
import { hasRole, isSuperAdmin } from '@runzos/cms-core'

type Doc = Record<string, any>
export const invalido = (path: string, message: string): never => {
  throw new ValidationError({ errors: [{ path, message }] })
}

/** Somente código servidor pode autorizar a escrita interna do histórico. */
const historyRequests = new WeakSet<object>()
export const historicoInterno: CollectionBeforeChangeHook = ({ req, operation, data }) => {
  if (operation !== 'create' || !historyRequests.has(req)) invalido('oferta', 'Histórico é append-only e gerado pela observação do listing.')
  return data
}
export const appendOnly: CollectionBeforeChangeHook = ({ operation, data }) => {
  if (operation !== 'create') invalido('id', 'Registro de auditoria é imutável.')
  return data
}
export const semDelete = () => invalido('id', 'Histórico/auditoria não pode ser apagado.')

export async function lockListing(req: PayloadRequest, tenant: unknown, chave: string, shared = false) {
  const transactionID = await req.transactionID
  if (!transactionID) throw new Error('Catálogo exige transação Postgres (push não substitui migrations).')
  const db = req.payload.db as typeof req.payload.db & {
    sessions: Record<string, { db: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } }>
  }
  const session = db.sessions[String(transactionID)]
  if (!session) throw new Error('Transação Postgres ausente')
  const key = `${idRel(tenant)}:${chave}`
  await session.db.execute(shared
    ? sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${key}, 0))`
    : sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
}

export const lockReferencia = (req: PayloadRequest, collection: CollectionSlug, id: unknown, shared = true) =>
  lockListing(req, 'catalogo-relacao', `${collection}:${idRel(id)}`, shared)

export const validaRelacoes = (relations: Record<string, CollectionSlug>): CollectionBeforeChangeHook =>
  async ({ data, originalDoc, req }) => {
    const effective = { ...originalDoc, ...data }
    const tenant = idRel(effective.tenant)
    if (!tenant) invalido('tenant', 'Tenant obrigatório.')
    if (originalDoc?.id && idRel(originalDoc.tenant) !== tenant) invalido('tenant', 'Tenant é imutável.')
    await lockReferencia(req, 'tenants', tenant)
    for (const [field, collection] of Object.entries(relations)) {
      if (field !== 'imagem' && originalDoc?.id && idRel(originalDoc[field]) !== idRel(effective[field])) invalido(field, 'Relação é imutável; registre revisão em novo vínculo.')
      if (!effective[field]) continue
      await lockReferencia(req, collection, effective[field])
      const related = await req.payload.findByID({ collection, id: idRel(effective[field]), req, depth: 0, overrideAccess: true }) as unknown as Doc
      if (idRel(related.tenant) !== tenant) invalido(field, 'Relação deve pertencer ao mesmo tenant.')
    }
    return data
  }

export const validaProduto: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (originalDoc?.id) {
    for (const key of ['marca', 'modelo', 'categoria']) {
      if (key in data && normaliza(data[key]) !== normaliza(originalDoc[key])) invalido(key, 'Identidade do produto é imutável.')
    }
  }
  if (hasRole(req.user, 'ingestao') && !isSuperAdmin(req.user) && data.estado === 'published') invalido('estado', 'Ingestão cria draft.')
  return data
}

export const validaVariante: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const effective = { ...originalDoc, ...data }
  for (const k of ['material', 'cor', 'acabamento']) if (k in data) data[k] = normaliza(data[k])
  Object.assign(effective, data)
  if (effective.estado === 'confirmada') {
    const produto = await req.payload.findByID({ collection: 'produtos_fisicos', id: idRel(effective.produto), req, depth: 0 })
    if (produto.categoria === 'filamento') {
      for (const k of atributosFilamento) if (!effective[k]) invalido(k, 'Filamento confirmado exige atributo comparável.')
    }
  }
  data.chave_normalizada = chaveVariante(effective)
  if (originalDoc?.id && data.chave_normalizada !== originalDoc.chave_normalizada) invalido('chave_normalizada', 'Identidade da variante é imutável.')
  return data
}

/** Valida o contrato público já existente /r/{c|p|o}{id}; não inventa redirect novo. */
export const validaRedirect: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const effective = { ...originalDoc, ...data }
  if (!effective.url_redirect) return data
  const match = /^\/r\/([cpo])(\d{1,12})$/.exec(effective.url_redirect)
  if (!match) return invalido('url_redirect', 'Use /r/{c|p|o}{id} existente.')
  const collection = ({ c: 'cupons', p: 'produtos', o: 'ofertas' } as const)[match[1] as 'c' | 'p' | 'o']
  await lockReferencia(req, collection, match[2])
  const target = await req.payload.findByID({ collection, id: match[2]!, req, depth: 0, overrideAccess: true })
  if (idRel(target.tenant) !== idRel(effective.tenant) || idRel(target.loja) !== idRel(effective.loja)) {
    invalido('url_redirect', 'Redirect deve pertencer ao tenant e loja do listing.')
  }
  return data
}

const snapshotFields = ['preco', 'frete', 'disponibilidade', 'fonte'] as const
const sameSnapshot = (a: Doc, b: Doc) => snapshotFields.every(k => (a[k] ?? null) === (b[k] ?? null))

/** O lock acontece ANTES de reler: originalDoc pode ter sido lido antes de outro commit. */
export const observaListing: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  let effective = { ...originalDoc, ...data }
  if (['amazon-manual-sitestripe', 'amazon-manual-revisado'].includes(effective.fonte)) {
    try {
      const validate = effective.fonte === 'amazon-manual-revisado' ? validaAmazonLink : validaSiteStripe
      validate(String(effective.external_listing_id ?? ''), String(effective.url_afiliado ?? ''), process.env.AMAZON_TAG)
      if (effective.url_origem !== `https://www.amazon.com.br/dp/${effective.external_listing_id}`) throw new Error('Origem deve ser canônica por ASIN')
    } catch { return invalido('url_afiliado', 'Amazon exige ASIN correspondente e tag igual a AMAZON_TAG configurada.') }
  }
  let identity: ReturnType<typeof identidadeListing>
  try { identity = identidadeListing(effective) } catch { return invalido('url_origem', 'URL deve ser HTTP(S) válida, sem credenciais.') }
  if (originalDoc?.id && originalDoc.chave_listing !== identity.chave_listing) invalido('chave_listing', 'Identidade natural é imutável.')
  Object.assign(data, identity)
  await lockListing(req, effective.tenant, identity.chave_listing)
  const found = await req.payload.find({ collection: 'ofertas_produto', req, depth: 0, overrideAccess: true,
    where: { and: [{ tenant: { equals: idRel(effective.tenant) } }, { chave_listing: { equals: identity.chave_listing } }] }, limit: 1 })
  const current = found.docs[0]
  if (current && (!originalDoc?.id || idRel(current.id) !== idRel(originalDoc.id))) invalido('chave_listing', 'Listing já existe; use ingerirListing para reingestão.')
  if (current && ['amazon-manual-sitestripe', 'amazon-manual-revisado'].includes(current.fonte) && hasRole(req.user, 'ingestao') && !isSuperAdmin(req.user) && current.estado !== 'draft') invalido('estado', 'Piloto de ingestão só altera listings draft.')
  if (current) effective = { ...current, ...data }
  // Rejeita publicação automática por ingestão; ativação do piloto é revisão explícita.
  if (effective.estado === 'ativa') {
    if (hasRole(req.user, 'ingestao') && !isSuperAdmin(req.user) && current?.estado !== 'ativa') invalido('estado', 'Ingestão não ativa listing.')
    const variant = await req.payload.findByID({ collection: 'variantes_produto', id: idRel(effective.variante), req, depth: 0 })
    if (variant.estado !== 'confirmada') invalido('variante', 'Listing ativo exige variante confirmada.')
  }
  const hasObservation = !current || snapshotFields.some(k => k in data) || 'observado_em' in data
  if (!hasObservation) return data
  for (const field of ['preco', 'fonte', 'observado_em']) {
    if (!(field in data) || data[field] == null || data[field] === '') invalido(field, 'Observação exige preço, fonte e timestamp explícitos.')
  }
  const time = Date.parse(String(data.observado_em))
  if (!Number.isFinite(time)) invalido('observado_em', 'Timestamp inválido.')
  data.observado_em = new Date(time).toISOString()
  const observation = { ...effective, ...data }
  if (current && time <= Date.parse(current.observado_em)) {
    const old = await req.payload.find({ collection: 'historico_preco_oferta', req, depth: 0, overrideAccess: true,
      where: { and: [{ tenant: { equals: idRel(effective.tenant) } }, { oferta: { equals: current.id } }, { observado_em: { equals: data.observado_em } }] }, limit: 1 })
    if (old.docs[0] && !sameSnapshot(old.docs[0], observation)) invalido('observado_em', 'Mesmo timestamp com valores conflitantes.')
    if (!old.docs[0]) await gravaHistorico(req, current.id, observation)
    // PATCH inteiro stale/retry não altera estado ou metadados atuais.
    return { ...current, id: current.id }
  }
  return data
}

async function gravaHistorico(req: PayloadRequest, oferta: number, doc: Doc) {
  historyRequests.add(req)
  try {
    await req.payload.create({ collection: 'historico_preco_oferta', req, overrideAccess: true,
      data: { tenant: Number(idRel(doc.tenant)), oferta, preco: doc.preco, frete: doc.frete,
        disponibilidade: doc.disponibilidade, fonte: doc.fonte, observado_em: doc.observado_em } })
  } finally { historyRequests.delete(req) }
}
export const depoisListing: CollectionAfterChangeHook = async ({ doc, req }) => {
  const existing = await req.payload.find({ collection: 'historico_preco_oferta', req, depth: 0, overrideAccess: true,
    where: { and: [{ tenant: { equals: idRel(doc.tenant) } }, { oferta: { equals: doc.id } }, { observado_em: { equals: doc.observado_em } }] }, limit: 1 })
  if (!existing.docs.length) await gravaHistorico(req, doc.id, doc)
  return doc
}

export const validaElegibilidade: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const effective = { ...originalDoc, ...data }
  const cupom = await req.payload.findByID({ collection: 'cupons', id: idRel(effective.cupom), req, depth: 0 })
  const oferta = await req.payload.findByID({ collection: 'ofertas_produto', id: idRel(effective.oferta), req, depth: 0 })
  if (idRel(cupom.loja) !== idRel(oferta.loja)) invalido('cupom', 'Cupom deve pertencer à loja do listing.')
  if (effective.inicio && effective.fim && Date.parse(effective.inicio) > Date.parse(effective.fim)) invalido('fim', 'Intervalo inválido.')
  return data
}
export const validaVinculo: CollectionBeforeChangeHook = async ({ data, req }) => {
  if (data.decisao === 'confirmado' && data.metodo !== 'humano') {
    const variante = await req.payload.findByID({ collection: 'variantes_produto', id: idRel(data.variante), req, depth: 0 })
    const produto = await req.payload.findByID({ collection: 'produtos_fisicos', id: idRel(variante.produto), req, depth: 0 })
    const match = avaliaMatch(data.evidencia?.entrada ?? {}, { ...variante }, { ...produto })
    const candidates = await req.payload.find({ collection: 'variantes_produto', req, depth: 0, overrideAccess: true,
      where: { and: [{ tenant: { equals: idRel(data.tenant) } }, { estado: { equals: 'confirmada' } }] }, limit: 1000 })
    // Piloto conservador: catálogos maiores requerem matching indexado antes de automatizar.
    if (candidates.hasNextPage) invalido('evidencia', 'Catálogo excede limite do piloto; revisão humana necessária.')
    let qualifying = 0
    for (const candidate of candidates.docs) {
      const parent = await req.payload.findByID({ collection: 'produtos_fisicos', id: idRel(candidate.produto), req, depth: 0 })
      if (avaliaMatch(data.evidencia?.entrada ?? {}, { ...candidate }, { ...parent }).automatico) qualifying++
    }
    if (qualifying !== 1) invalido('evidencia', 'Matching ambíguo exige revisão humana.')
    if (!match.automatico || match.metodo !== data.metodo || data.score !== match.score) {
      invalido('evidencia', 'Match automático exige identificador exato ou atributos completos sem conflito em evidencia.entrada; ambiguidade requer revisão humana.')
    }
  }
  if (data.oferta) {
    const oferta = await req.payload.findByID({ collection: 'ofertas_produto', id: idRel(data.oferta), req, depth: 0 })
    if (idRel(oferta.variante) !== idRel(data.variante)) invalido('variante', 'Vínculo deve referenciar a variante do listing.')
  }
  return data
}
