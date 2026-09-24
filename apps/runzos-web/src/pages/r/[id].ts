import { getDestinoFisico } from '../../lib/catalogo'
/**
 * Contrato docs/contratos/redirect-afiliado.md — TODO clique de monetização passa aqui.
 * GET /r/{tipo}{id}?ref=...  →  tipo ∈ {c: cupom, p: produto, o: oferta} (IDs seriais
 * colidem entre coleções, então o tipo faz parte do id público).
 *
 * Regras:
 * 1. lookup ESCOPADO pelo tenant do host (nada cruza tenant) e por _status published
 * 2. só monetiza estado apto: cupom publicado|expirando|expirado; produto landing|indexavel
 * 3. builder por programa (@runzos/afflinks); sem ID de afiliado configurado → redireciona
 *    a URL fonte CRUA (sem comissão) e loga mesmo assim — nunca 500 pro usuário
 * 4. log ANTES do redirect (falha de log nunca bloqueia)
 */
import { AfflinkError, buildAffiliateUrl, normalizaRef, type Programa } from '@runzos/afflinks'
import type { APIRoute } from 'astro'

import { classificaUserAgent } from '../../lib/agentClass'
import {
  cmsFindOneNoTenant,
  logClique,
  PRODUTO_MONETIZAVEL,
  type CupomDTO,
  type LojaDTO,
  type OfertaDTO,
  type ProdutoDTO,
} from '../../lib/cms'
import { ipHash } from '../../lib/hash'

interface Destino {
  tipo_doc: 'cupom' | 'oferta' | 'produto'
  urlFonte: string | null
  loja: LojaDTO | null
}

const lojaDe = (doc: { loja?: LojaDTO | string | number }): LojaDTO | null =>
  doc.loja && typeof doc.loja === 'object' ? doc.loja : null

const CUPOM_MONETIZAVEL = new Set(['publicado', 'expirando', 'expirado'])
// PRODUTO_MONETIZAVEL mora em lib/cms: a página /p/{slug} decide mostrar o CTA pela
// MESMA lista. Duas cópias da regra é a forma de as duas divergirem.

async function resolveDestino(idPublico: string, tenantId: string | number): Promise<Destino | null> {
  const m = /^([cpo])(\d{1,12})$/.exec(idPublico)
  if (!m) return null
  const [, tipo, id] = m as unknown as [string, 'c' | 'p' | 'o', string]

  if (tipo === 'c') {
    const cupom = await cmsFindOneNoTenant<CupomDTO>('cupons', id!, tenantId)
    if (!cupom || !CUPOM_MONETIZAVEL.has(cupom.estado)) return null
    return { tipo_doc: 'cupom', urlFonte: cupom.url_afiliado_fonte ?? null, loja: lojaDe(cupom) }
  }
  if (tipo === 'p') {
    const produto = await cmsFindOneNoTenant<ProdutoDTO & { estado?: string }>('produtos', id!, tenantId)
    if (!produto || !PRODUTO_MONETIZAVEL.has(produto.estado ?? '')) return null
    return { tipo_doc: 'produto', urlFonte: produto.url_afiliado_fonte, loja: lojaDe(produto) }
  }
  const oferta = await cmsFindOneNoTenant<OfertaDTO>('ofertas', id!, tenantId, 2)
  if (!oferta) return null
  const cupomDaOferta = oferta.cupom && typeof oferta.cupom === 'object' ? oferta.cupom : null
  return {
    tipo_doc: 'oferta',
    // cupom vinculado tem precedência; sem cupom (crédito, lifetime, desconto já no
    // link) a oferta carrega o próprio destino — senão ela não monetizaria (contrato).
    urlFonte: cupomDaOferta?.url_afiliado_fonte ?? oferta.url_afiliado_fonte ?? null,
    loja: lojaDe(oferta),
  }
}

export const GET: APIRoute = async (context) => {
  const { id } = context.params
  const tenant = context.locals.tenant
  const ref = normalizaRef(context.url.searchParams.get('ref'))
  const fallback = (loja?: LojaDTO | null) =>
    context.redirect(loja ? `/cupom-${loja.slug}` : '/', 302)

  if (!id) return fallback()

  if (/^f\d{1,12}$/.test(id)) {
    const location = await getDestinoFisico(tenant.id, id.slice(1))
    if (!location) return new Response('Oferta não encontrada.', { status: 404 })
    return new Response(null, { status: 302, headers: {
      Location: location, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer-when-downgrade',
    } })
  }
  const destino = await resolveDestino(id, tenant.id)
  if (!destino) return fallback()

  const urlFonte = destino.urlFonte ?? destino.loja?.url_site ?? null
  if (!urlFonte) return fallback(destino.loja)

  const programa = (destino.loja?.programa ?? 'outro') as Programa
  // resolve o ID de afiliado: tenants.programas_ativos aponta o NOME da env var
  const envName = tenant.programas_ativos?.find((p) => p.programa === programa)?.id_afiliado_env
  const afiliadoId = envName ? process.env[envName] : undefined

  let destinoFinal: string
  try {
    destinoFinal = buildAffiliateUrl({ programa, urlFonte, subid: ref, afiliadoId })
  } catch (err) {
    if (err instanceof AfflinkError) {
      // sem ID de afiliado (ou builder recusou): serve o usuário mesmo assim,
      // sem parâmetros de comissão — e o log registra o clique perdido
      console.warn(`[/r] sem monetização (${programa}): ${err.message}`)
      destinoFinal = urlFonte
    } else {
      console.error('[/r] builder falhou:', (err as Error).message)
      return fallback(destino.loja)
    }
  }

  // log ANTES do redirect (contrato) — falha não bloqueia
  await logClique({
    tenant: tenant.id,
    tipo_doc: destino.tipo_doc,
    doc_id: id,
    loja: destino.loja?.id,
    programa,
    ref,
    user_agent_class: classificaUserAgent(context.request.headers.get('user-agent')),
    ip_hash: ipHash(context.clientAddress),
  })

  return new Response(null, {
    status: 302,
    headers: {
      Location: destinoFinal,
      'Referrer-Policy': 'no-referrer-when-downgrade',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  })
}
