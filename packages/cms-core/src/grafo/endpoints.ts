import { APIError, type Endpoint, type PayloadRequest } from 'payload'
import { idGrafo, tenantDaConsulta } from './acesso'
import type { FormatoEditorial } from './contratos'
import { avaliarGates, type ClaimGate, type ConfigGates, type EntradaGates, type ProblemaGate, type RegistroGrafo } from './gates'
import { markdownCanonico } from './markdown'
import { encontraNoTenant, invalidoGrafo } from './validacao'

export async function avaliaPost(req: PayloadRequest, post: RegistroGrafo, formatos: FormatoEditorial[]): Promise<ProblemaGate[]> {
  const tenant = idGrafo(post.tenant)
  if (tenant === undefined) return invalidoGrafo('tenant', 'Tenant obrigatório.')
  const configTenant = await req.payload.findByID({ collection: 'tenants', id: tenant, req, depth: 0, overrideAccess: true })
  const config = (configTenant.gates ?? {}) as ConfigGates
  if (!config.ativo) return []
  const entidades = Array.isArray(post.entidades) ? post.entidades : []
  const entidade = idGrafo(entidades[0])
  const pesquisas = entidade === undefined ? undefined : await req.payload.find({ collection: 'pesquisas' as never, req, depth: 0, limit: 1,
    overrideAccess: true, sort: '-updatedAt', where: { and: [{ tenant: { equals: tenant } }, { entidade: { equals: entidade } }] } })
  const claims: ClaimGate[] = []
  for (const id of Array.isArray(post.claims) ? post.claims : []) {
    const claim = await encontraNoTenant(req, 'claims', id, tenant)
    if (!claim) return invalidoGrafo('claims', 'Claim deve existir no mesmo tenant.')
    const fonte = await encontraNoTenant(req, 'fontes', claim.fonte, tenant)
    if (!fonte) return invalidoGrafo('claims', 'Fonte deve existir no mesmo tenant.')
    claims.push({ id: claim.id, texto: claim.texto, ano_ancora: claim.ano_ancora, status: claim.status, fonte: { url: fonte.url } })
  }
  const canonico = { ...post, corpo_md: markdownCanonico(req, post.corpo) }
  const problemas = avaliarGates({ agora: new Date(), config, post: canonico,
    pesquisa: pesquisas?.docs[0] as EntradaGates['pesquisa'], claims })
  const formato = formatos.find(f => f.slug === (post.tipo ?? 'artigo'))
  if (!formato) problemas.push({ gate: 'formato', severidade: 'P0', path: 'tipo', mensagem: 'Formato não registrado nesta instância.' })
  else if (formato.validarPublicacao) problemas.push(...formato.validarPublicacao(canonico))
  return problemas
}

const recorta = (v: unknown, max = 2000) => typeof v === 'string' ? v.slice(0, max) : null
const entidadeDTO = (d: RegistroGrafo) => ({ id: d.id, nome: recorta(d.nome, 300), slug: recorta(d.slug, 200),
  tipo: recorta(d.tipo, 100), resumo: recorta(d.resumo), wikidata_qid: recorta(d.wikidata_qid, 100), ymyl: d.ymyl === true })

export const contextoGrafo: Endpoint = {
  path: '/grafo/contexto', method: 'get', handler: async req => {
    const tenant = tenantDaConsulta(req)
    const params = new URL(req.url!).searchParams
    if (params.has('profundidade') && params.get('profundidade') !== '1') throw new APIError('Esta entrega suporta profundidade=1.', 400)
    const slug = params.get('entidade')
    if (!slug || slug.length > 200) throw new APIError('Informe o slug da entidade.', 400)
    const entidades = await req.payload.find({ collection: 'entidades' as never, req, overrideAccess: false, depth: 0, limit: 1,
      where: { and: [{ tenant: { equals: tenant } }, { slug: { equals: slug } }] } })
    const entidade = entidades.docs[0]
    if (!entidade) throw new APIError('Entidade não encontrada.', 404)
    const base = { req, overrideAccess: false, depth: 0, limit: 50 }
    const [relacoes, claims, posts, pesquisas] = await Promise.all([
      req.payload.find({ ...base, collection: 'relacoes' as never, where: { and: [{ tenant: { equals: tenant } },
        { or: [{ de: { equals: entidade.id } }, { para: { equals: entidade.id } }] }] } }),
      req.payload.find({ ...base, collection: 'claims' as never, where: { and: [{ tenant: { equals: tenant } },
        { entidade: { equals: entidade.id } }, { status: { equals: 'vigente' } }, { ano_ancora: { greater_than_equal: new Date().getUTCFullYear() - 2 } }] } }),
      req.payload.find({ ...base, collection: 'posts', select: { slug: true, titulo: true, tipo: true, resumo: true, publicado_em: true, _status: true },
        where: { and: [{ tenant: { equals: tenant } }, { entidades: { contains: entidade.id } }] } }),
      req.payload.find({ ...base, collection: 'pesquisas' as never, limit: 1, sort: '-updatedAt',
        where: { and: [{ tenant: { equals: tenant } }, { entidade: { equals: entidade.id } }] } }),
    ])
    const fonteIDs = claims.docs.map(c => idGrafo(c.fonte)).filter(id => id !== undefined)
    const fontes = fonteIDs.length ? await req.payload.find({ ...base, collection: 'fontes' as never,
      where: { and: [{ tenant: { equals: tenant } }, { id: { in: fonteIDs } }] } }) : { docs: [] }
    const porID = new Map(fontes.docs.map(f => [String(f.id), f]))
    const aresta = (r: RegistroGrafo) => ({ id: r.id, de: idGrafo(r.de), para: idGrafo(r.para), tipo: recorta(r.tipo, 100), peso: r.peso })
    const pesquisa = pesquisas.docs[0]
    return Response.json({ tenant, entidade: entidadeDTO(entidade),
      relacoes: { saida: relacoes.docs.filter(r => String(idGrafo(r.de)) === String(entidade.id)).map(aresta),
        entrada: relacoes.docs.filter(r => String(idGrafo(r.para)) === String(entidade.id)).map(aresta) },
      claims: claims.docs.flatMap(c => {
        const fonte = porID.get(String(idGrafo(c.fonte)))
        return fonte ? [{ id: c.id, texto: recorta(c.texto), ano_ancora: c.ano_ancora,
          fonte: { id: fonte.id, url: recorta(fonte.url), publisher: recorta(fonte.publisher, 300), tier: fonte.tier } }] : []
      }),
      posts: posts.docs.map(p => ({ id: p.id, slug: recorta(p.slug, 200), titulo: recorta(p.titulo, 300),
        tipo: recorta(p.tipo, 100), resumo: recorta(p.resumo), publicado_em: p.publicado_em, _status: p._status })),
      pesquisa: pesquisa ? { id: pesquisa.id, qualidade: pesquisa.qualidade, validade_dias: pesquisa.validade_dias,
        atualizado_em: pesquisa.updatedAt, corpo_md: recorta(pesquisa.corpo_md, 8000), corpo_truncado: String(pesquisa.corpo_md ?? '').length > 8000 } : null,
      truncado: { relacoes: relacoes.hasNextPage, claims: claims.hasNextPage, posts: posts.hasNextPage },
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  },
}

export const endpointGates = (formatos: FormatoEditorial[]): Endpoint => ({
  path: '/:id/gates', method: 'post', handler: async req => {
    const tenant = tenantDaConsulta(req)
    const id = req.routeParams?.id
    if (typeof id !== 'string' && typeof id !== 'number') throw new APIError('Informe o id do post.', 400)
    const posts = await req.payload.find({ collection: 'posts', req, overrideAccess: false, depth: 0, limit: 1, draft: true,
      where: { and: [{ tenant: { equals: tenant } }, { id: { equals: id } }] } })
    const post = posts.docs[0]
    if (!post) throw new APIError('Post não encontrado.', 404)
    return Response.json(await avaliaPost(req, post, formatos), { headers: { 'Cache-Control': 'private, no-store' } })
  },
})
