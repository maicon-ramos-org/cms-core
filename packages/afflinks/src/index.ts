/**
 * @runzos/afflinks — monta o deep-link do programa de afiliado.
 *
 * Contrato (docs/contratos/redirect-afiliado.md):
 * - IDs/tags de afiliado vêm de fora (tenant/env) — NUNCA hardcoded aqui.
 * - `subid` = o `ref` do /r/{id} — liga a comissão ao canal (teste F0-T1).
 * - Builder novo de programa = PR próprio com teste de fixture + entrada em colecoes.md.
 */

export type Programa =
  | 'hostinger'
  | 'cloudways'
  | 'amazon'
  | 'shopee'
  | 'awin'
  | 'impact'
  | 'mercadolivre'
  | 'hotmart'
  | 'direto'
  | 'outro'

export interface BuildAffiliateUrlInput {
  programa: Programa
  /** URL fonte cadastrada no doc (url_afiliado_fonte) — destino real do clique. */
  urlFonte: string
  /** Canal de origem (pagina|chat|mcp|grupo-wa|grupo-tg) — vira subid quando o programa suporta. */
  subid?: string
  /** ID/tag de afiliado do programa (resolvido de env pelo chamador — ver tenants.programas_ativos). */
  afiliadoId?: string
}

export class AfflinkError extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'AfflinkError'
  }
}

const parseUrl = (urlFonte: string): URL => {
  let url: URL
  try {
    url = new URL(urlFonte)
  } catch {
    throw new AfflinkError(`url_afiliado_fonte inválida: "${urlFonte}"`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AfflinkError(`protocolo não permitido em link de afiliado: ${url.protocol}`)
  }
  return url
}

type Builder = (url: URL, input: BuildAffiliateUrlInput) => URL

const setParam = (url: URL, chave: string, valor: string | undefined): void => {
  if (valor) url.searchParams.set(chave, valor)
}

/**
 * Builders por programa. Regra: preservar os params existentes da URL fonte,
 * sobrescrevendo apenas os de atribuição.
 */
const builders: Record<Programa, Builder> = {
  // Amazon Associates: tag= (obrigatória p/ comissão) + ascsubtag= (subid de canal)
  amazon: (url, { afiliadoId, subid }) => {
    if (!afiliadoId) throw new AfflinkError('programa amazon exige afiliadoId (tag) — configure a env do tenant')
    setParam(url, 'tag', afiliadoId)
    setParam(url, 'ascsubtag', subid)
    return url
  },
  // Hostinger: links de referral usam REFERRALCODE
  hostinger: (url, { afiliadoId, subid }) => {
    setParam(url, 'REFERRALCODE', afiliadoId)
    setParam(url, 'utm_content', subid)
    return url
  },
  /*
   * Cloudways: `id=` é o afiliado e `data1`/`data2` são os campos de subid do programa.
   *
   * `id` OBRIGATÓRIO, com erro — mesma regra da Amazon e pela mesma razão: sem ele o link
   * FUNCIONA, leva o visitante à loja e não paga nada. Comissão perdida em silêncio é o
   * pior resultado possível, porque só aparece quando o relatório do programa não fecha,
   * semanas depois, sem nada pra correlacionar.
   *
   * `data2` fica livre de propósito: o contrato do redirect só define UM canal de origem, e
   * ocupar o segundo campo agora tiraria a folga de quem for medir campanha ou teste A/B
   * depois — que é justamente o que dois campos de subid servem pra permitir.
   */
  cloudways: (url, { afiliadoId, subid }) => {
    if (!afiliadoId) throw new AfflinkError('programa cloudways exige afiliadoId (id) — configure a env do tenant')
    setParam(url, 'id', afiliadoId)
    setParam(url, 'data1', subid)
    return url
  },
  // Awin: só decoramos se a fonte JÁ é um deep-link awin1.com/cread.php (gerado no painel)
  awin: (url, { subid }) => {
    if (url.hostname.endsWith('awin1.com')) setParam(url, 'clickref', subid)
    return url
  },
  // Impact: subId1 é o campo de subid padrão
  impact: (url, { subid }) => {
    setParam(url, 'subId1', subid)
    return url
  },
  // Hotmart: sck= carrega o rastreio de origem
  hotmart: (url, { subid }) => {
    setParam(url, 'sck', subid)
    return url
  },
  // Sem builder confiável por enquanto — passthrough documentado (link vem pronto do painel)
  shopee: (url) => url,
  mercadolivre: (url) => url,
  direto: (url) => url,
  outro: (url) => url,
}

export function buildAffiliateUrl(input: BuildAffiliateUrlInput): string {
  const builder = builders[input.programa]
  if (!builder) throw new AfflinkError(`programa desconhecido: ${input.programa}`)
  return builder(parseUrl(input.urlFonte), input).toString()
}

/** Canais válidos de origem — espelha o select `ref` da coleção cliques. */
export const REFS_VALIDOS = ['pagina', 'chat', 'mcp', 'grupo-wa', 'grupo-tg', 'outro'] as const
export type Ref = (typeof REFS_VALIDOS)[number]

export const normalizaRef = (valor: string | null | undefined): Ref =>
  REFS_VALIDOS.includes((valor ?? '') as Ref) ? ((valor ?? '') as Ref) : 'outro'

export { validaSiteStripe } from './sitestripe'
export { amazonLink, validaAmazonLink } from './amazon'
