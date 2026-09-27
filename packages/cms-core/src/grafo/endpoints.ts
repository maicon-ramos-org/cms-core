import { APIError, type Endpoint } from 'payload'
import { idGrafo, tenantDaConsulta } from './acesso'
import { dataFrescorPesquisa } from './frescor'
import { pesquisaMaisRecente } from './pesquisas'

type RegistroGrafo = Record<string, unknown>
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
    const [relacoes, claims, posts, pesquisa] = await Promise.all([
      req.payload.find({ ...base, collection: 'relacoes' as never, where: { and: [{ tenant: { equals: tenant } },
        { or: [{ de: { equals: entidade.id } }, { para: { equals: entidade.id } }] }] } }),
      // O agente editorial decide quais claims usar. O CMS entrega os registros
      // e seus metadados, sem esconder fontes por status ou ano.
      req.payload.find({ ...base, collection: 'claims' as never, where: { and: [{ tenant: { equals: tenant } },
        { entidade: { equals: entidade.id } }] } }),
      req.payload.find({ ...base, collection: 'posts', select: { slug: true, titulo: true, tipo: true, resumo: true, publicado_em: true, _status: true },
        where: { and: [{ tenant: { equals: tenant } }, { entidades: { contains: entidade.id } }] } }),
      pesquisaMaisRecente(req, tenant, entidade.id),
    ])
    const fonteIDs = claims.docs.map(c => idGrafo(c.fonte)).filter(id => id !== undefined)
    const fontes = fonteIDs.length ? await req.payload.find({ ...base, collection: 'fontes' as never,
      where: { and: [{ tenant: { equals: tenant } }, { id: { in: fonteIDs } }] } }) : { docs: [] }
    const porID = new Map(fontes.docs.map(f => [String(f.id), f]))
    const aresta = (r: RegistroGrafo) => ({ id: r.id, de: idGrafo(r.de), para: idGrafo(r.para), tipo: recorta(r.tipo, 100), peso: r.peso })
    return Response.json({ tenant, entidade: entidadeDTO(entidade),
      relacoes: { saida: relacoes.docs.filter(r => String(idGrafo(r.de)) === String(entidade.id)).map(aresta),
        entrada: relacoes.docs.filter(r => String(idGrafo(r.para)) === String(entidade.id)).map(aresta) },
      claims: claims.docs.flatMap(c => {
        const fonte = porID.get(String(idGrafo(c.fonte)))
        return fonte ? [{ id: c.id, texto: recorta(c.texto), ano_ancora: c.ano_ancora, status: c.status,
          fonte: { id: fonte.id, url: recorta(fonte.url), publisher: recorta(fonte.publisher, 300), tier: fonte.tier } }] : []
      }),
      posts: posts.docs.map(p => ({ id: p.id, slug: recorta(p.slug, 200), titulo: recorta(p.titulo, 300),
        tipo: recorta(p.tipo, 100), resumo: recorta(p.resumo), publicado_em: p.publicado_em, _status: p._status })),
      pesquisa: pesquisa ? { id: pesquisa.id, qualidade: pesquisa.qualidade, validade_dias: pesquisa.validade_dias,
        revisado_em: pesquisa.revisado_em ?? null, data_frescor: dataFrescorPesquisa(pesquisa),
        base_frescor: pesquisa.revisado_em != null ? 'revisado_em' : 'updatedAt-legado',
        atualizado_em: pesquisa.updatedAt, corpo_md: recorta(pesquisa.corpo_md, 8000), corpo_truncado: String(pesquisa.corpo_md ?? '').length > 8000 } : null,
      truncado: { relacoes: relacoes.hasNextPage, claims: claims.hasNextPage, posts: posts.hasNextPage },
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  },
}
