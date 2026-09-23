/**
 * Formato da etiqueta de associado (docs/contratos/hermes-amazon.md). O VALOR vem só do
 * ambiente (`AMAZON_TAG`) de cada site — nenhuma etiqueta mora neste pacote (PRD 17 RF2).
 */
export const TAG_AMAZON = /^[A-Za-z0-9][A-Za-z0-9-]{0,99}-[0-9]{2}$/

/** Discovery URLs are untrusted input, never affiliate artifacts to reuse. No network. */
export function amazonLink(input: string, tag: string | undefined, preserveVariant = false) {
  if (!tag || !TAG_AMAZON.test(tag)) throw new Error('AMAZON_TAG ausente ou inválida')
  const u = new URL(input)
  if (input.trim() !== input || /[\r\n\t\\]/.test(input) || /(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(input) || u.protocol !== 'https:' ||
    !['www.amazon.com.br', 'amazon.com.br'].includes(u.hostname) || u.port || u.username || u.password || u.hash) throw new Error('URL Amazon Brasil inválida')
  const match = /^\/(?:[^/]+\/)?dp\/([A-Z0-9]{10})(?:\/ref=[^/]*)?\/?$/.exec(u.pathname) ?? /^\/gp\/product\/([A-Z0-9]{10})\/?$/.exec(u.pathname)
  if (!match) throw new Error('ASIN inválido ou ambíguo')
  const asin = match[1]!
  if (preserveVariant && (u.searchParams.getAll('th').length !== 1 || u.searchParams.get('th') !== '1')) throw new Error('Seletor de variante inválido')
  const canonical = `https://www.amazon.com.br/dp/${asin}`
  return { asin, canonical, affiliate: `${canonical}?${preserveVariant ? 'th=1&' : ''}tag=${tag}` }
}
export function validaAmazonLink(asin: string, url: string, tag: string | undefined) {
  const result = amazonLink(url, tag, new URL(url).searchParams.has('th'))
  if (result.asin !== asin || result.affiliate !== url) throw new Error('Link Amazon próprio/ASIN inválido')
  return url
}
