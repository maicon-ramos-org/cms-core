import { describe, expect, it } from 'vitest'
import { validaSiteStripe } from '../src/sitestripe'
const url = 'https://www.amazon.com.br/dp/B0H1DLP121?th=1&linkCode=ll2&tag=runzos-20&linkId=6626b933d53eacdcd32f659d77b92e54&ref_=as_li_ss_tl'
describe('artefato SiteStripe', () => {
  it('preserva todos os bytes, inclusive ordem e escapes', () => {
    expect(validaSiteStripe('B0H1DLP121', url + '&extra=%2f', 'runzos-20')).toBe(url + '&extra=%2f')
  })
  it.each([undefined, '', 'almafitnessx-20'])('recusa env ausente/diferente: %s', tag => {
    expect(() => validaSiteStripe('B0H1DLP121', url, tag)).toThrow()
  })
  it.each([
    url.replace('B0H1DLP121', 'B0G6KL3SW1'), url.replace('runzos-20', 'outro-20'),
    url + '&tag=runzos-20', url.replace('www.amazon.com.br', 'amazon.com.br.evil.test'),
    url.replace('https:', 'http:'), url.replace('https://', 'https://user@'),
    url.replace('linkId=', 'missing='), url + '#fragment', url.replace('/dp/', '/bad/'),
  ])('recusa artefato inválido %s', invalid => {
    expect(() => validaSiteStripe('B0H1DLP121', invalid, 'runzos-20')).toThrow()
  })
})
