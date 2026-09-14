/** Validação do artefato fornecido; nunca reconstrói nem decora a URL. */
export function validaSiteStripe(asin: string, original: string, tag: string | undefined): string {
  if (tag !== 'runzos-20') throw new Error('AMAZON_TAG deve ser runzos-20')
  if (!/^[A-Z0-9]{10}$/.test(asin)) throw new Error('ASIN inválido')
  const u = new URL(original)
  if (original.trim() !== original || /[\r\n\t]/.test(original) || u.protocol !== 'https:' ||
    !['www.amazon.com.br', 'amazon.com.br'].includes(u.hostname) || u.port || u.username || u.password || u.hash ||
    !new RegExp(`^/(?:dp|gp/product)/${asin}/?$`).test(u.pathname)) throw new Error('URL/ASIN Amazon Brasil inválido')
  if (u.searchParams.getAll('tag').length !== 1 || u.searchParams.get('tag') !== tag ||
    u.searchParams.getAll('linkId').length !== 1 || !u.searchParams.get('linkId') ||
    u.searchParams.get('linkCode') !== 'll2' || u.searchParams.get('ref_') !== 'as_li_ss_tl') {
    throw new Error('Artefato SiteStripe/tag inválido')
  }
  return original
}
