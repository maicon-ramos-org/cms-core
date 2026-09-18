import { describe, expect, it } from 'vitest'
import { amazonLink, validaAmazonLink } from '../src/amazon'

describe('reviewed Amazon URL runtime contract', () => {
  it.each(['another-store-20', 'runzos-21'])('uses only the configured tag %s', tag => {
    const result = amazonLink('https://amazon.com.br/title/dp/B012345678/ref=foreign?tag=competitor-20&linkCode=abc&linkId=xyz&th=1&psc=1', tag, true)
    expect(result).toEqual({ asin: 'B012345678', canonical: 'https://www.amazon.com.br/dp/B012345678', affiliate: `https://www.amazon.com.br/dp/B012345678?th=1&tag=${tag}` })
    expect(validaAmazonLink(result.asin, result.affiliate, tag)).toBe(result.affiliate)
    expect(() => validaAmazonLink(result.asin, result.affiliate, 'different-20')).toThrow()
  })
  it.each([undefined, '', ' own-20', 'own-20 ', 'own&tag=other', 'own?x=1', 'own/20', 'own\n20', 'own'])('rejects unsafe/missing configured tags %s', tag => {
    expect(() => amazonLink('https://amazon.com.br/dp/B012345678', tag)).toThrow()
  })
  it.each([
    'http://amazon.com.br/dp/B012345678',
    'https://amzn.to/example',
    'https://amazon.com.br:8443/dp/B012345678',
    'https://amazon.com.br/dp/B012345678#other',
    'https://amazon.com.br/dp/B012345678/dp/B012345679',
    'https://amazon.com.br/title/../dp/B012345678',
    'https://amazon.com.br/dp/B012345678?th=2',
    'https://amazon.com.br/dp/B012345678?th=1&th=1',
    'https://amazon.com.br/dp/B012345678?%74h=1&th=1',
  ])('rejects unsafe or ambiguous URL %s', url => {
    expect(() => amazonLink(url, 'store-20', true)).toThrow()
  })
  it('never retains variant selectors unless explicitly confirmed', () => {
    expect(amazonLink('https://amazon.com.br/dp/B012345678?th=2&psc=1&tag=other-20', 'store-20').affiliate).toBe('https://www.amazon.com.br/dp/B012345678?tag=store-20')
  })
})
