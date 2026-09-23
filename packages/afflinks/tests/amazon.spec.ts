import { describe, expect, it } from 'vitest'
import { amazonLink, validaAmazonLink } from '../src/amazon'
describe('Amazon próprio', () => {
  it('extracts ASIN and removes every competitor tracking parameter', () => {
    expect(amazonLink('https://www.amazon.com.br/titulo/dp/B012345678?tag=competitor-20&linkId=foreign&th=1', 'exemplo-20')).toEqual({ asin: 'B012345678', canonical: 'https://www.amazon.com.br/dp/B012345678', affiliate: 'https://www.amazon.com.br/dp/B012345678?tag=exemplo-20' })
    expect(amazonLink('https://amazon.com.br/gp/product/B012345678?th=1&tag=foreign', 'exemplo-20', true).affiliate).toBe('https://www.amazon.com.br/dp/B012345678?th=1&tag=exemplo-20')
  })
  it.each(['https://evil.test/dp/B012345678', 'https://amazon.com.br.evil.test/dp/B012345678', 'https://www.amazon.com.br/dp/bad', 'https://user@amazon.com.br/dp/B012345678', 'https://amazon.com.br/dp/B012345678?th=1&th=2'])('rejects unsafe or ambiguous input %s', url => expect(() => amazonLink(url, 'exemplo-20', true)).toThrow())
  it.each([undefined, '', 'unsafe&tag=foreign'])('requires configured own tag %s', tag => expect(() => amazonLink('https://amazon.com.br/dp/B012345678', tag)).toThrow())
  it('validates only clean own links with matching ASIN', () => {
    const url = amazonLink('https://amazon.com.br/dp/B012345678', 'exemplo-20').affiliate
    expect(validaAmazonLink('B012345678', url, 'exemplo-20')).toBe(url)
    for (const bad of [url.replace('exemplo-20', 'other-20'), url + '&linkId=foreign', url.replace('B012345678', 'B012345679'), url.split('?')[0]!]) expect(() => validaAmazonLink('B012345678', bad, 'exemplo-20')).toThrow()
  })
})
