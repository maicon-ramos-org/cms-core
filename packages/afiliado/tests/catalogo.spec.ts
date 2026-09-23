import { describe, expect, it } from 'vitest'
import { selecionaMatch, avaliaMatch, canonicalizaURL, cupomElegivel, identidadeListing } from '../src/cms/catalogo/regras'

const produto = { marca: 'TestBrand', modelo: 'PLA Basic', categoria: 'filamento' }
const variante = { estado: 'confirmada', material: 'pla', cor: 'preto', peso_g: 1000, diametro_mm: 1.75, acabamento: 'standard', gtin: '1234567890123' }
const entrada = { ...produto, ...variante }
describe('matching conservador', () => {
  it('confirma marca/modelo e todos os atributos; rejeita ambiguidade', () => {
    expect(avaliaMatch(entrada, variante, produto).automatico).toBe(true)
    expect(avaliaMatch({ marca: 'TestBrand' }, variante, produto).automatico).toBe(false)
    expect(avaliaMatch(entrada, { ...variante, estado: 'incerta' }, produto).automatico).toBe(false)
  })
  it('mais de um candidato nunca confirma automaticamente', () => {
    expect(selecionaMatch(entrada, [{ produto, variante }, { produto, variante }])).toBeUndefined()
  })
  it.each([{ gtin: '9999999999999' }, { peso_g: 500 }, { diametro_mm: 2.85 }, { cor: 'branco' }, { acabamento: 'silk' }, { marca: 'Outra' }])('não ignora conflito %j mesmo com GTIN', change => {
    expect(avaliaMatch({ ...entrada, ...change }, variante, produto).automatico).toBe(false)
  })
})
describe('identidade natural e URLs', () => {
  it('remove tracking, preserva SKU/unknown e valores repetidos', () => {
    expect(canonicalizaURL('https://SHOP.test/item?sku=black&ref=variant&utm_source=ad#foo')).toBe('https://shop.test/item?ref=variant&sku=black#foo')
    expect(canonicalizaURL('https://shop.test/p?a=2&a=1')).toBe('https://shop.test/p?a=2&a=1')
    const a = { loja: 1, seller_normalizado: ' Seller ', url_origem: 'https://shop.test/item?sku=black&utm_source=ad' }
    expect(identidadeListing(a).chave_listing).toBe(identidadeListing({ ...a, seller_normalizado: 'seller', url_origem: 'https://shop.test/item?sku=black' }).chave_listing)
    expect(identidadeListing({ ...a, url_origem: 'https://shop.test/item#black' }).chave_listing).not.toBe(identidadeListing({ ...a, url_origem: 'https://shop.test/item#white' }).chave_listing)
    expect(identidadeListing(a).chave_listing).not.toBe(identidadeListing({ ...a, url_origem: 'https://shop.test/item?sku=white' }).chave_listing)
    expect(identidadeListing({ ...a, external_listing_id: 'A' }).chave_listing).toBe(identidadeListing({ ...a, external_listing_id: 'A', url_origem: 'https://shop.test/changed' }).chave_listing)
  })
  it.each(['javascript:alert(1)', 'https://user:password@shop.test', 'not a URL'])('rejeita %s', url => expect(() => canonicalizaURL(url)).toThrow())
})
describe('eligibilidade física não concede desconto por ausência de regra', () => {
  const cupom = { id: 1, tenant: 1, loja: 1, codigo: 'PLA10', estado: 'publicado', _status: 'published', verificado_em: '2026-09-01', metodo: 'manual' }
  const oferta = { id: 11, tenant: 1, loja: 1, estado: 'ativa', disponibilidade: 'disponivel' }
  const regra = { tenant: 1, cupom: 1, oferta: 11, verificado_em: '2026-09-01', minimo_pedido: 100 }
  const args = { cupom, oferta, regra, agora: '2026-09-13', totalPedido: 100 }
  it('A elegível, B inelegível, mínimo desconhecido falha fechado', () => {
    expect(cupomElegivel(args)).toBe(true)
    expect(cupomElegivel({ ...args, oferta: { ...oferta, id: 12 } })).toBe(false)
    expect(cupomElegivel({ ...args, regra: undefined })).toBe(false)
    expect(cupomElegivel({ ...args, totalPedido: undefined })).toBe(false)
    expect(cupomElegivel({ ...args, oferta: { ...oferta, tenant: 2 } })).toBe(false)
    expect(cupomElegivel({ ...args, regra: { ...regra, fim: '2026-09-12' } })).toBe(false)
    expect(cupomElegivel({ ...args, cupom: { ...cupom, _status: 'draft' } })).toBe(false)
  })
})
