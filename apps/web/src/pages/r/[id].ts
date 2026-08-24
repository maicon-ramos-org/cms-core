/**
 * Contrato docs/contratos/redirect-afiliado.md — TODO clique de monetização passa aqui.
 * GET /r/{id}?ref={pagina|chat|mcp|grupo-wa|grupo-tg}
 * 1. lookup cupom → produto → oferta
 * 2. builder por programa (@runzos/afflinks), IDs de env do tenant — nunca hardcoded
 * 3. log ANTES do redirect (falha de log nunca bloqueia)
 * 4. 302; falha de lookup → 302 pra página da loja (nunca 500 pro usuário)
 */
import { buildAffiliateUrl, normalizaRef, type Programa } from '@runzos/afflinks'
import type { APIRoute } from 'astro'

import { classificaUserAgent } from '../../lib/agentClass'
import {
  cmsFindById,
  logClique,
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

async function resolveDestino(id: string): Promise<Destino | null> {
  const cupom = await cmsFindById<CupomDTO>('cupons', id)
  if (cupom) return { tipo_doc: 'cupom', urlFonte: cupom.url_afiliado_fonte ?? null, loja: lojaDe(cupom) }
  const produto = await cmsFindById<ProdutoDTO>('produtos', id)
  if (produto) return { tipo_doc: 'produto', urlFonte: produto.url_afiliado_fonte, loja: lojaDe(produto) }
  const oferta = await cmsFindById<OfertaDTO>('ofertas', id, 2)
  if (oferta) {
    const cupomDaOferta = oferta.cupom && typeof oferta.cupom === 'object' ? oferta.cupom : null
    return {
      tipo_doc: 'oferta',
      urlFonte: cupomDaOferta?.url_afiliado_fonte ?? null,
      loja: lojaDe(oferta),
    }
  }
  return null
}

export const GET: APIRoute = async (context) => {
  const { id } = context.params
  const tenant = context.locals.tenant
  const ref = normalizaRef(context.url.searchParams.get('ref'))
  const fallback = (loja?: LojaDTO | null) =>
    context.redirect(loja ? `/cupom-${loja.slug}` : '/', 302)

  if (!id) return fallback()

  const destino = await resolveDestino(id)
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
    console.error('[/r] builder falhou:', (err as Error).message)
    return fallback(destino.loja)
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
