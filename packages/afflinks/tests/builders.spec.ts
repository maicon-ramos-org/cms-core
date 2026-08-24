import { describe, expect, it } from 'vitest'

import { AfflinkError, buildAffiliateUrl, normalizaRef } from '../src/index'

describe('buildAffiliateUrl — fixtures por programa (contrato redirect-afiliado.md)', () => {
  it('amazon: adiciona tag e ascsubtag preservando params existentes', () => {
    const url = buildAffiliateUrl({
      programa: 'amazon',
      urlFonte: 'https://www.amazon.com.br/dp/B0EXEMPLO?th=1',
      afiliadoId: 'runzos-20',
      subid: 'grupo-wa',
    })
    const u = new URL(url)
    expect(u.searchParams.get('tag')).toBe('runzos-20')
    expect(u.searchParams.get('ascsubtag')).toBe('grupo-wa')
    expect(u.searchParams.get('th')).toBe('1')
    expect(u.hostname).toBe('www.amazon.com.br')
  })

  it('amazon: sem afiliadoId é erro (comissão perdida NUNCA silenciosa)', () => {
    expect(() =>
      buildAffiliateUrl({ programa: 'amazon', urlFonte: 'https://www.amazon.com.br/dp/B0EXEMPLO' }),
    ).toThrow(AfflinkError)
  })

  it('hostinger: REFERRALCODE + utm_content como subid', () => {
    const u = new URL(
      buildAffiliateUrl({
        programa: 'hostinger',
        urlFonte: 'https://www.hostinger.com.br/',
        afiliadoId: 'RUNZOS',
        subid: 'pagina',
      }),
    )
    expect(u.searchParams.get('REFERRALCODE')).toBe('RUNZOS')
    expect(u.searchParams.get('utm_content')).toBe('pagina')
  })

  it('awin: decora clickref só em deep-link awin1.com; fora dele não toca', () => {
    const decorado = new URL(
      buildAffiliateUrl({
        programa: 'awin',
        urlFonte: 'https://www.awin1.com/cread.php?awinmid=1234&awinaffid=5678&ued=https%3A%2F%2Floja.com',
        subid: 'mcp',
      }),
    )
    expect(decorado.searchParams.get('clickref')).toBe('mcp')
    expect(decorado.searchParams.get('awinmid')).toBe('1234')

    const intacto = buildAffiliateUrl({
      programa: 'awin',
      urlFonte: 'https://loja.com/produto',
      subid: 'mcp',
    })
    expect(intacto).toBe('https://loja.com/produto')
  })

  it('impact: subId1; hotmart: sck', () => {
    expect(
      new URL(
        buildAffiliateUrl({ programa: 'impact', urlFonte: 'https://track.exemplo.com/c/1', subid: 'chat' }),
      ).searchParams.get('subId1'),
    ).toBe('chat')
    expect(
      new URL(
        buildAffiliateUrl({ programa: 'hotmart', urlFonte: 'https://pay.hotmart.com/X0000000', subid: 'grupo-tg' }),
      ).searchParams.get('sck'),
    ).toBe('grupo-tg')
  })

  it('passthrough: shopee/mercadolivre/direto/outro devolvem a fonte intacta', () => {
    for (const programa of ['shopee', 'mercadolivre', 'direto', 'outro'] as const) {
      expect(
        buildAffiliateUrl({ programa, urlFonte: 'https://exemplo.com/oferta?x=1', subid: 'pagina' }),
      ).toBe('https://exemplo.com/oferta?x=1')
    }
  })

  it('rejeita URL inválida e protocolo não-http', () => {
    expect(() => buildAffiliateUrl({ programa: 'direto', urlFonte: 'nao-e-url' })).toThrow(AfflinkError)
    expect(() => buildAffiliateUrl({ programa: 'direto', urlFonte: 'javascript:alert(1)' })).toThrow(AfflinkError)
  })
})

describe('normalizaRef', () => {
  it('aceita canais válidos e degrada o resto pra "outro"', () => {
    expect(normalizaRef('grupo-wa')).toBe('grupo-wa')
    expect(normalizaRef('chat')).toBe('chat')
    expect(normalizaRef('injecao"><script>')).toBe('outro')
    expect(normalizaRef(null)).toBe('outro')
  })
})
