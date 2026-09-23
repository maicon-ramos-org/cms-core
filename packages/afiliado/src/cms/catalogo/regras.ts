import { createHash } from 'node:crypto'

export const idRel = (value: unknown): string => {
  if (value && typeof value === 'object' && 'id' in value) return String(value.id)
  return value == null ? '' : String(value)
}
export const normaliza = (value: unknown): string =>
  String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
export const hash = (parts: unknown[]): string => createHash('sha256').update(JSON.stringify(parts)).digest('hex')

/** Denylist pequena: parâmetros desconhecidos, ordem de valores repetidos e SKU sobrevivem. */
export function canonicalizaURL(input: string): string {
  const url = new URL(input)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('URL deve ser HTTP(S) sem credenciais')
  }
  // Fragmentos podem identificar SKU em lojas SPA; preservá-los evita falso merge.
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|gclid|gbraid|wbraid|fbclid|msclkid)$/i.test(key)) url.searchParams.delete(key)
  }
  url.searchParams.sort()
  return url.toString()
}
export function identidadeListing(data: Record<string, unknown>) {
  const url_canonica = canonicalizaURL(String(data.url_origem ?? ''))
  const seller_normalizado = normaliza(data.seller_normalizado)
  const external_listing_id = String(data.external_listing_id ?? '').trim()
  return {
    seller_normalizado, external_listing_id: external_listing_id || null, url_canonica,
    chave_listing: hash([idRel(data.loja), seller_normalizado,
      external_listing_id ? ['external', external_listing_id] : ['url', url_canonica]]),
  }
}
export const atributosFilamento = ['material', 'cor', 'peso_g', 'diametro_mm', 'acabamento'] as const
export function chaveVariante(data: Record<string, unknown>) {
  return hash([normaliza(data.sku_fabricante), normaliza(data.gtin), ...atributosFilamento.map(k => normaliza(data[k])), data.especificacoes ?? null])
}
export type Candidato = Record<string, unknown>
/** Identificador exato não autoriza colapsar atributos contraditórios. */
export function avaliaMatch(entrada: Candidato, variante: Candidato, produto: Candidato) {
  if (variante.estado !== 'confirmada') return { automatico: false, motivo: 'variante incerta' }
  if (atributosFilamento.some(k => entrada[k] != null && normaliza(entrada[k]) !== normaliza(variante[k]))) {
    return { automatico: false, motivo: 'atributos conflitantes' }
  }
  if (['marca', 'modelo'].some(k => entrada[k] != null && normaliza(entrada[k]) !== normaliza(produto[k]))) {
    return { automatico: false, motivo: 'produto conflitante' }
  }
  if (['gtin', 'sku_fabricante'].some(k => entrada[k] && variante[k] && normaliza(entrada[k]) !== normaliza(variante[k]))) {
    return { automatico: false, motivo: 'identificadores conflitantes' }
  }
  const gtin = entrada.gtin && normaliza(entrada.gtin) === normaliza(variante.gtin)
  const sku = entrada.sku_fabricante && normaliza(entrada.marca) === normaliza(produto.marca) &&
    normaliza(entrada.sku_fabricante) === normaliza(variante.sku_fabricante)
  if (gtin || sku) return { automatico: true, metodo: gtin ? 'gtin' : 'sku', score: 1 }
  const completo = produto.categoria === 'filamento' && ['marca', 'modelo'].every(k =>
    entrada[k] && normaliza(entrada[k]) === normaliza(produto[k])) &&
    atributosFilamento.every(k => entrada[k] != null && normaliza(entrada[k]) === normaliza(variante[k]))
  return completo ? { automatico: true, metodo: 'atributos', score: 1 } : { automatico: false, motivo: 'revisao necessaria' }
}

/** O chamador fornece todos os candidatos tenant-scoped: mais de um match é revisão. */
export function selecionaMatch(entrada: Candidato, candidatos: Array<{ variante: Candidato; produto: Candidato }>) {
  const matches = candidatos.filter(c => avaliaMatch(entrada, c.variante, c.produto).automatico)
  return matches.length === 1 ? matches[0] : undefined
}

export function cupomElegivel({ cupom, oferta, regra, agora, totalPedido }: {
  cupom: Candidato; oferta: Candidato; regra?: Candidato; agora: string; totalPedido?: number
}): boolean {
  const time = Date.parse(agora)
  if (!Number.isFinite(time) || !regra || !idRel(cupom.tenant) || !idRel(cupom.loja)) return false
  if (![oferta, regra].every(x => idRel(x.tenant) === idRel(cupom.tenant)) ||
    idRel(cupom.loja) !== idRel(oferta.loja) || idRel(regra.cupom) !== idRel(cupom.id) ||
    idRel(regra.oferta) !== idRel(oferta.id)) return false
  if (cupom.estado !== 'publicado' || cupom._status !== 'published' || !cupom.verificado_em || !cupom.metodo ||
    oferta.estado !== 'ativa' || oferta.disponibilidade !== 'disponivel' || !regra.verificado_em) return false
  const before = (value: unknown) => !value || (Number.isFinite(Date.parse(String(value))) && time <= Date.parse(String(value)))
  const after = (value: unknown) => !value || (Number.isFinite(Date.parse(String(value))) && time >= Date.parse(String(value)))
  if (!before(cupom.validade) || !before(oferta.validade) || !before(regra.fim) || !after(regra.inicio) ||
    !after(regra.verificado_em) || !after(cupom.verificado_em)) return false
  const min = Number(regra.minimo_pedido ?? 0)
  return Number.isFinite(min) && min >= 0 && (min === 0 ||
    (typeof totalPedido === 'number' && Number.isFinite(totalPedido) && totalPedido >= min))
}
