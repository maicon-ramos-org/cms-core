import { describe, expect, it } from 'vitest'
import { validaSiteStripe } from '../src/sitestripe'
const url = 'https://www.amazon.com.br/dp/B0H1DLP121?th=1&linkCode=ll2&tag=exemplo-20&linkId=6626b933d53eacdcd32f659d77b92e54&ref_=as_li_ss_tl'
describe('artefato SiteStripe', () => {
  it('preserva todos os bytes, inclusive ordem e escapes', () => {
    expect(validaSiteStripe('B0H1DLP121', url + '&extra=%2f', 'exemplo-20')).toBe(url + '&extra=%2f')
  })
  it.each([undefined, '', ' exemplo-20', 'exemplo', 'exemplo-20&tag=outra-20'])('recusa env ausente ou fora do formato: %s', tag => {
    expect(() => validaSiteStripe('B0H1DLP121', url, tag)).toThrow()
  })
  it('a etiqueta é a do AMBIENTE, não uma cravada no pacote (PRD 17 RF2)', () => {
    // outro site afiliado, com a própria etiqueta: o pacote não pode recusar por não ser a que estava cravada aqui
    const outra = url.replace('tag=exemplo-20', 'tag=outra-loja-21')
    expect(validaSiteStripe('B0H1DLP121', outra, 'outra-loja-21')).toBe(outra)
  })
  it('recusa o link cuja etiqueta não é a do ambiente', () => {
    expect(() => validaSiteStripe('B0H1DLP121', url, 'outra-loja-21')).toThrow()
  })
  it.each([
    url.replace('B0H1DLP121', 'B0G6KL3SW1'), url.replace('exemplo-20', 'outro-20'),
    url + '&tag=exemplo-20', url.replace('www.amazon.com.br', 'amazon.com.br.evil.test'),
    url.replace('https:', 'http:'), url.replace('https://', 'https://user@'),
    url.replace('linkId=', 'missing='), url + '#fragment', url.replace('/dp/', '/bad/'),
  ])('recusa artefato inválido %s', invalid => {
    expect(() => validaSiteStripe('B0H1DLP121', invalid, 'exemplo-20')).toThrow()
  })
})
