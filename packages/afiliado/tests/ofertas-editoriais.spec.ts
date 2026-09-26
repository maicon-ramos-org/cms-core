import { describe, expect, it } from 'vitest'
import { decimalExato, registrarProgramasOferta, urlPermitida, projetarOfertaEditorial, resolverEscolhasEditoriais, type OfertaEditorial } from '../src/ofertas-editoriais/contratos'

const programas = registrarProgramasOferta([{ slug: 'loja', rotulo: 'Loja', hostsPermitidos: ['loja.example'] }])
const oferta: OfertaEditorial = { id: 1, tenant: 10, origem: 'legacy:offer:1', slug: 'oferta', nome: 'Nome documentado',
  programa: 'loja', estado: 'ativa', _status: 'published', url_afiliado: 'https://loja.example/p?privado=nao-expor',
  comissao_taxa: '0.1000', comissao_estimada: '10.00', preco: null,
  especificacoes: [{ rotulo: 'Segunda', valor: 'B' }, { rotulo: 'Primeira', valor: 'A' }],
  evidencia_comercial: { vendas: null, numero_avaliacoes: 12, observado_em: null } }

describe('decimal exato e programas explícitos', () => {
  it('preserva null e decimal sem round-trip por float', () => {
    expect(decimalExato(null)).toBeNull()
    expect(decimalExato('00012345678901234567890.1')).toBe('12345678901234567890.10')
    expect(decimalExato('-0.00')).toBe('0.00')
    expect(decimalExato('0.1234', 4)).toBe('0.1234')
  })
  it.each([0, 12.3, '1e2', 'NaN', '1.999', '', '1,20'])('não inventa ou arredonda %j', value => expect(() => decimalExato(value)).toThrow())
  it.each(['https://loja.example.evil.test/p', 'https://user:pass@loja.example/p', 'https://loja.example:8443/p', 'javascript:alert(1)', '//loja.example/p'])('rejeita destino %s', url => {
    expect(urlPermitida(url, 'loja', programas)).toBeNull()
  })
  it('exige programa conhecido e hostname exato, sem wildcard', () => {
    expect(urlPermitida('https://loja.example/p', 'loja', programas)).toBe('https://loja.example/p')
    expect(urlPermitida('https://loja.example/p', 'outra', programas)).toBeNull()
    expect(() => registrarProgramasOferta([{ slug: 'loja', rotulo: 'Loja', hostsPermitidos: ['*.example'] }])).toThrow()
    expect(() => registrarProgramasOferta([{ slug: 'loja', rotulo: 'Loja', hostsPermitidos: ['loja.example'] }, { slug: 'loja', rotulo: 'Outra', hostsPermitidos: ['outro.example'] }])).toThrow()
    expect(Object.isFrozen(programas)).toBe(true)
    expect(Object.isFrozen(programas[0]!.hostsPermitidos)).toBe(true)
  })
  it('hosts afiliados auditados no snapshot são explícitos; produto/imagem não viram destino', () => {
    const registros = registrarProgramasOferta([
      { slug: 'shopee', rotulo: 'Shopee', hostsPermitidos: ['s.shopee.com.br', 'shopee.com.br'] },
      { slug: 'amazon', rotulo: 'Amazon', hostsPermitidos: ['www.amazon.com.br'] },
      { slug: 'mercadolivre', rotulo: 'Mercado Livre', hostsPermitidos: ['meli.la'] },
      { slug: 'hotmart', rotulo: 'Hotmart', hostsPermitidos: ['go.hotmart.com'] },
    ])
    for (const p of registros) for (const host of p.hostsPermitidos) expect(urlPermitida(`https://${host}/fixture`, p.slug, registros)).toBeTruthy()
    expect(urlPermitida('https://www.mercadolivre.com.br/fixture', 'mercadolivre', registros)).toBeNull()
    expect(urlPermitida('https://cf.shopee.com.br/fixture', 'shopee', registros)).toBeNull()
  })
})

describe('projeção pública e escolhas', () => {
  it('não expõe destino/comissão/origem e não inventa preço, vendas ou observação', () => {
    const dto = projetarOfertaEditorial(oferta, 10, programas)!
    expect(dto.href).toBe('/ofertas/oferta/')
    expect(dto.preco).toBeNull()
    expect(dto.evidencia_comercial).toEqual({ vendas: null, numero_avaliacoes: 12, observado_em: null })
    expect(dto.especificacoes).toEqual(oferta.especificacoes)
    expect(JSON.stringify(dto)).not.toContain('nao-expor')
    expect(dto).not.toHaveProperty('comissao_taxa')
    expect(dto).not.toHaveProperty('origem')
  })
  it('draft e outro tenant nunca viram DTO público', () => {
    expect(projetarOfertaEditorial({ ...oferta, _status: 'draft' }, 10, programas)).toBeNull()
    expect(projetarOfertaEditorial(oferta, 20, programas)).toBeNull()
  })
  it('espelhos não aumentam contagem canônica; quebrada mantém escolha inelegível', () => {
    const espelho = { ...oferta, id: 2, slug: 'espelho', espelho_de: 1, correspondencia: 'busca' as const }
    const quebrada = { ...oferta, id: 3, slug: 'quebrada', estado: 'quebrada' as const }
    const r = resolverEscolhasEditoriais([{ oferta: 2, papel: 'alternativa', posicao: 0 }, { oferta: 1, papel: 'principal', posicao: -1 }, { oferta: 3, papel: 'anterior', posicao: 1 }], [oferta, espelho, quebrada], 10, programas)
    expect(r.canonicasElegiveis).toBe(1)
    expect(r.escolhas.map(c => c.papel)).toEqual(['principal', 'alternativa', 'anterior'])
    expect(r.escolhas[2]!.oferta!.elegivel).toBe(false)
  })
})
