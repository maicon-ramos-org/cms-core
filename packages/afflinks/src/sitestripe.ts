import { TAG_AMAZON } from './amazon'

/**
 * Validação do artefato fornecido; nunca reconstrói nem decora a URL.
 *
 * A etiqueta é a do AMBIENTE de quem chama (`AMAZON_TAG`), conferida só no formato. Até o
 * PRD 17 RF2 ela era comparada com uma etiqueta fixa escrita aqui — o que recusaria os links de
 * qualquer outro site afiliado que usasse o pacote. Garantir que o ambiente tem o valor
 * certo é do deploy (infra/README.md, "Contrato AMAZON_TAG"), não do pacote.
 */
export function validaSiteStripe(asin: string, original: string, tag: string | undefined): string {
  if (!tag || !TAG_AMAZON.test(tag)) throw new Error('AMAZON_TAG ausente ou inválida')
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
