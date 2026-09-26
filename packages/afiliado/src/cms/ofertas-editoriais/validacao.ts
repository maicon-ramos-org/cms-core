import { APIError, ValidationError, type CollectionBeforeChangeHook, type CollectionBeforeValidateHook, type PayloadRequest, type Where } from 'payload'
import { hasRole, isSuperAdmin } from '@maicon-ramos-org/cms-core'
import { lockListing } from '../catalogo/hooks'
import { decimalExato, idOferta, urlHTTP, urlPermitida, type RegistroProgramasOferta } from '../../ofertas-editoriais/contratos'

type Doc = Record<string, any>
export const invalidaOferta = (path: string, message: string): never => { throw new ValidationError({ errors: [{ path, message }] }) }
export const internoOferta = (user: unknown) => isSuperAdmin(user) || hasRole(user, 'sistema')
export const semDeleteOferta = () => invalidaOferta('id', 'Registro editorial/auditoria não pode ser apagado.')

function tenantEfetivo(data: Doc, originalDoc: Doc | undefined, req: PayloadRequest): string {
  const tenant = idOferta(data.tenant)
  if (!tenant) return invalidaOferta('tenant', 'Tenant obrigatório.')
  if (originalDoc?.id && tenant !== idOferta(originalDoc.tenant)) invalidaOferta('tenant', 'Tenant é imutável.')
  if (req.user && !isSuperAdmin(req.user)) {
    const permissoes = (req.user as unknown as { tenants?: Array<{ tenant?: any }> }).tenants ?? []
    if (!permissoes.some(p => idOferta(p.tenant) === tenant)) throw new APIError('Tenant não autorizado.', 403)
  }
  return tenant
}
async function relacao(req: PayloadRequest, colecao: string, id: unknown, tenant: string, path: string): Promise<Doc> {
  const found = await req.payload.find({ collection: colecao as never, req, overrideAccess: true, draft: true, depth: 0, limit: 1,
    where: { and: [{ id: { equals: idOferta(id as never) } }, { tenant: { equals: tenant } }] } })
  if (!found.docs[0]) return invalidaOferta(path, 'Referência deve existir no mesmo tenant.')
  return found.docs[0] as Doc
}
async function unico(req: PayloadRequest, colecao: string, tenant: string, data: Doc, originalDoc: Doc | undefined, campos: string[]) {
  if (campos.some(c => data[c] == null || data[c] === '')) return
  const where: Where[] = [{ tenant: { equals: tenant } }, ...campos.map(c => ({ [c]: { equals: data[c] } }))]
  if (originalDoc?.id) where.push({ id: { not_equals: originalDoc.id } })
  const found = await req.payload.find({ collection: colecao as never, req, overrideAccess: true, draft: true, depth: 0, limit: 1, where: { and: where } })
  if (found.totalDocs) invalidaOferta(campos.at(-1)!, 'Identidade já existe no tenant; compare o registro antes de repetir o import.')
}
const camposPrivados = ['url_afiliado', 'comissao_taxa', 'comissao_estimada']
const lista = (valor: unknown, path: string): Doc[] => {
  if (valor == null) return []
  if (!Array.isArray(valor) || valor.some(v => !v || typeof v !== 'object' || Array.isArray(v))) return invalidaOferta(path, 'Use lista de objetos tipados.')
  return valor
}

export const normalizaOfertaEditorial: CollectionBeforeValidateHook = ({ data, originalDoc, operation, req }) => {
  if (!data) return data
  if (operation === 'create') {
    if (data._status === 'published' && !isSuperAdmin(req.user)) throw new APIError('Oferta nova entra em draft; publicação exige atualização explícita.', 403)
    if (!data._status) data._status = 'draft'
  }
  if (req.user && !internoOferta(req.user) && camposPrivados.some(c => c in data && JSON.stringify(data[c]) !== JSON.stringify(originalDoc?.[c]))) {
    throw new APIError('Campos comerciais internos exigem credencial de sistema.', 403)
  }
  for (const [campo, casas] of [['preco', 2], ['comissao_taxa', 4], ['comissao_estimada', 2]] as const) {
    if (campo in data) try { data[campo] = decimalExato(data[campo], casas) } catch { invalidaOferta(campo, 'Use string decimal exata ou null; não arredondamos preços/comissões.') }
  }
  if ('external_id' in data && data.external_id === '') data.external_id = null
  return data
}

export const validaOfertaEditorial = (programas: RegistroProgramasOferta): CollectionBeforeChangeHook => async ({ data, originalDoc, req }) => {
  let efetivo = { ...originalDoc, ...data }
  const tenant = tenantEfetivo(efetivo, originalDoc, req)
  // Serializa identidade e grafo de espelhos do tenant, inclusive create/create e A↔B.
  await lockListing(req, tenant, 'ofertas-editoriais')
  if (originalDoc?.id) {
    const atual = await relacao(req, 'ofertas_editoriais', originalDoc.id, tenant, 'id')
    efetivo = { ...atual, ...data }
    for (const campo of ['origem', 'slug']) if (efetivo[campo] !== atual[campo]) invalidaOferta(campo, 'Identidade editorial é imutável.')
  }
  for (const campo of ['origem', 'slug', 'nome']) if (typeof efetivo[campo] !== 'string' || !efetivo[campo].trim()) invalidaOferta(campo, 'Campo obrigatório.')
  if (typeof efetivo.disclosure !== 'boolean') invalidaOferta('disclosure', 'Disclosure exige boolean explícito; false não é ausência.')
  if (!programas.some(p => p.slug === efetivo.programa)) invalidaOferta('programa', 'Programa não registrado nesta instância.')
  await unico(req, 'ofertas_editoriais', tenant, efetivo, originalDoc, ['origem'])
  await unico(req, 'ofertas_editoriais', tenant, efetivo, originalDoc, ['slug'])
  await unico(req, 'ofertas_editoriais', tenant, efetivo, originalDoc, ['programa', 'external_id'])
  for (const campo of ['url_afiliado', 'url_produto']) if (efetivo[campo] != null && !urlHTTP(efetivo[campo])) invalidaOferta(campo, 'URL deve ser HTTP(S), sem credenciais ou porta não padrão.')
  if (efetivo.imagem_comercial?.url != null && !urlHTTP(efetivo.imagem_comercial.url)) invalidaOferta('imagem_comercial.url', 'Imagem comercial exige URL HTTP(S) sem credenciais.')
  if (efetivo._status === 'published' && efetivo.estado === 'ativa' && !urlPermitida(efetivo.url_afiliado, efetivo.programa, programas)) {
    invalidaOferta('url_afiliado', 'Oferta ativa publicada exige destino permitido pelo programa.')
  }
  const vistos = new Set<string>()
  for (const [i, e] of lista(efetivo.entidades, 'entidades').entries()) {
    const id = idOferta(e.entidade)
    if (!id || vistos.has(id)) invalidaOferta(`entidades.${i}.entidade`, 'Entidade obrigatória e única por oferta.')
    vistos.add(id)
    if (!Number.isSafeInteger(e.prioridade)) invalidaOferta(`entidades.${i}.prioridade`, 'Prioridade deve ser inteiro.')
    await relacao(req, 'entidades', e.entidade, tenant, `entidades.${i}.entidade`)
  }
  if (efetivo.espelho_de) {
    if (idOferta(efetivo.espelho_de) === idOferta(originalDoc?.id)) invalidaOferta('espelho_de', 'Oferta não pode espelhar a si própria.')
    const pai = await relacao(req, 'ofertas_editoriais', efetivo.espelho_de, tenant, 'espelho_de')
    if (pai.espelho_de) invalidaOferta('espelho_de', 'Espelho só aponta para canônica; cadeia/ciclo não é permitido.')
    if (originalDoc?.id) {
      const filhos = await req.payload.find({ collection: 'ofertas_editoriais' as never, req, overrideAccess: true, draft: true, depth: 0, limit: 1,
        where: { and: [{ tenant: { equals: tenant } }, { espelho_de: { equals: originalDoc.id } }] } })
      if (filhos.totalDocs) invalidaOferta('espelho_de', 'Canônica com espelhos não pode virar espelho.')
    }
    if (!['exato', 'equivalente', 'busca'].includes(efetivo.correspondencia)) invalidaOferta('correspondencia', 'Informe a semântica do espelho, sem inferir identidade física.')
  } else if (efetivo.correspondencia != null) invalidaOferta('correspondencia', 'Canônica não tem tipo de correspondência.')
  return data
}

export const normalizaVerificacao: CollectionBeforeValidateHook = ({ data, operation, req }) => {
  if (operation !== 'create') return invalidaOferta('id', 'Verificação é append-only.')
  if (!data) return data
  try { data.preco_visto = decimalExato(data.preco_visto) } catch { invalidaOferta('preco_visto', 'Use string decimal exata ou null.') }
  data.ator = req.user?.id ?? null
  for (const campo of ['link_ativo', 'disponivel']) {
    if (data[campo] == null) data[campo] = null
    else if (typeof data[campo] !== 'boolean') invalidaOferta(campo, 'Use boolean ou null; ausência não significa false.')
  }
  return data
}
export const validaVerificacao: CollectionBeforeChangeHook = async ({ data, originalDoc, req, operation }) => {
  if (operation !== 'create') return invalidaOferta('id', 'Verificação é append-only.')
  const tenant = tenantEfetivo(data, originalDoc, req)
  if (!data.origem || !data.verificado_em || !Number.isFinite(Date.parse(data.verificado_em))) invalidaOferta(!data.origem ? 'origem' : 'verificado_em', 'Identidade e data original são obrigatórias.')
  await lockListing(req, tenant, `verificacao-editorial:${data.origem}`)
  await unico(req, 'verificacoes_ofertas_editoriais', tenant, data, undefined, ['origem'])
  await relacao(req, 'ofertas_editoriais', data.oferta, tenant, 'oferta')
  return data
}

export const validaEscolhas: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const efetivo = { ...originalDoc, ...data }
  const tenant = tenantEfetivo(efetivo, originalDoc, req)
  const config = await req.payload.findByID({ collection: 'tenants', id: tenant, req, overrideAccess: true, depth: 0 }) as Doc
  const papeis = new Set((config.ofertas_editoriais?.papeis_escolha ?? []).map((p: Doc) => p.slug))
  const vistos = new Set<string>()
  for (const [i, e] of lista(efetivo.escolhas, 'escolhas').entries()) {
    if (!papeis.has(e.papel) || vistos.has(e.papel)) invalidaOferta(`escolhas.${i}.papel`, 'Papel deve ser único e constar no vocabulário do tenant.')
    vistos.add(e.papel)
    if (!Number.isSafeInteger(e.posicao)) invalidaOferta(`escolhas.${i}.posicao`, 'Posição deve ser inteiro.')
    const oferta = await relacao(req, 'ofertas_editoriais', e.oferta, tenant, `escolhas.${i}.oferta`)
    if (efetivo._status === 'published' && oferta._status !== 'published') invalidaOferta(`escolhas.${i}.oferta`, 'Post publicado não pode escolher oferta draft.')
  }
  return data
}
