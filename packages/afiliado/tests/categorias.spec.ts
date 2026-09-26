import { describe, expect, it } from 'vitest'
import { registrarCategorias, REGISTRO_CATEGORIAS_PADRAO } from '../src/cms/catalogo/categorias'
import { avaliaMatch, chaveVariante, selecionaMatch } from '../src/cms/catalogo/regras'

const antiga = { sku_fabricante: 'SKU-A', gtin: '1234567890123', material: 'PLA', cor: 'Preto', peso_g: 1000,
  diametro_mm: 1.75, acabamento: 'standard', especificacoes: { origem: 'documentada' } }
const registro = registrarCategorias([{ slug: 'dispositivo', rotulo: 'Dispositivo',
  atributosDeIdentidade: ['especificacoes.capacidade', 'especificacoes.conectado'] }])
const produto = { marca: 'Marca de teste', modelo: 'Modelo documentado', categoria: 'dispositivo' }
const variante = { estado: 'confirmada', gtin: '123', especificacoes: { capacidade: 0, conectado: false, nota: 'editável' } }

describe('registro de categorias por instância', () => {
  it('conserva ordem e políticas padrão sem depender de categorias de um site', () => {
    expect(REGISTRO_CATEGORIAS_PADRAO.map(c => c.slug)).toEqual(['filamento', 'impressora', 'resina', 'acessorio'])
    expect(registro.map(c => c.slug)).toEqual(['filamento', 'impressora', 'resina', 'acessorio', 'dispositivo'])
    expect(registrarCategorias()).toBe(REGISTRO_CATEGORIAS_PADRAO)
  })
  it('copia e congela as políticas, sem reter o array mutável do chamador', () => {
    const atributos = ['especificacoes.capacidade']
    const r = registrarCategorias([{ slug: 'outra', rotulo: 'Outra', atributosDeIdentidade: atributos }])
    atributos.push('especificacoes.injetado')
    expect(r.at(-1)!.atributosDeIdentidade).toEqual(['especificacoes.capacidade'])
    expect(Object.isFrozen(r)).toBe(true)
    expect(Object.isFrozen(r.at(-1))).toBe(true)
    expect(Object.isFrozen(r.at(-1)!.atributosDeIdentidade)).toBe(true)
  })
  it.each([
    { slug: 'filamento', rotulo: 'Substituição proibida' },
    { slug: undefined as never, rotulo: 'Sem slug' },
    { slug: 'Com Espaço', rotulo: 'Inválido' },
    { slug: 'nova', rotulo: '' },
    { slug: 'nova', rotulo: 'Nova', versaoIdentidade: 0 },
    { slug: 'nova', rotulo: 'Nova', atributosDeIdentidade: ['tenant'] },
    { slug: 'nova', rotulo: 'Nova', atributosDeIdentidade: ['especificacoes.__proto__.x'] },
    { slug: 'nova', rotulo: 'Nova', atributosDeIdentidade: ['especificacoes.constructor'] },
    { slug: 'nova', rotulo: 'Nova', atributosDeIdentidade: ['especificacoes.a', 'especificacoes.a.b'] },
    { slug: 'nova', rotulo: 'Nova', atributosDeIdentidade: ['gtin', 'gtin'] },
  ])('rejeita configuração inválida: %j', categoria => expect(() => registrarCategorias([categoria])).toThrow())
})

describe('identidade compatível e extensível', () => {
  it.each([undefined, 'filamento', 'impressora', 'resina', 'acessorio'])('hash legado literal para %s', categoria => {
    expect(chaveVariante(antiga, categoria, registro)).toBe('036b1d3f605a150f67446205012473ff91e07cad5664fa887b07a7cdecc63119')
    expect(chaveVariante({}, categoria)).toBe('4c914928ffd4661b4862a6be3f056eb3a2d045a58549b1f5c014ea2ff2098e0f')
  })
  it('identidade nova usa apenas atributos declarados, identificadores, categoria e versão', () => {
    const chave = chaveVariante(variante, 'dispositivo', registro)
    expect(chaveVariante({ ...variante, especificacoes: { ...variante.especificacoes, nota: 'corrigida' } }, 'dispositivo', registro)).toBe(chave)
    expect(chaveVariante({ ...variante, especificacoes: { ...variante.especificacoes, capacidade: 1 } }, 'dispositivo', registro)).not.toBe(chave)
    expect(chaveVariante({ ...variante, gtin: 'outro' }, 'dispositivo', registro)).not.toBe(chave)
    const v2 = registrarCategorias([{ slug: 'dispositivo', rotulo: 'Dispositivo', versaoIdentidade: 2,
      atributosDeIdentidade: ['especificacoes.capacidade', 'especificacoes.conectado'] }])
    expect(chaveVariante(variante, 'dispositivo', v2)).not.toBe(chave)
    expect(() => chaveVariante(variante, 'desconhecida', registro)).toThrow()
  })
})

describe('matching genérico e conservador', () => {
  it('atributos genéricos completos aceitam zero e false, sem exigir filamento', () => {
    const semGTIN = { ...variante, gtin: undefined }
    expect(avaliaMatch({ ...produto, ...semGTIN }, semGTIN, produto, registro)).toEqual({ automatico: true, metodo: 'atributos', score: 1 })
    expect(avaliaMatch({ marca: produto.marca }, semGTIN, produto, registro).automatico).toBe(false)
  })
  it('não permite conflito de atributo, marca ou identificador mesmo com GTIN exato', () => {
    expect(avaliaMatch({ gtin: '123', especificacoes: { capacidade: 2 } }, variante, produto, registro).automatico).toBe(false)
    expect(avaliaMatch({ gtin: '123', marca: 'Outra' }, variante, produto, registro).automatico).toBe(false)
    expect(avaliaMatch({ ...produto, ...variante, gtin: '456' }, variante, produto, registro).automatico).toBe(false)
    expect(avaliaMatch({ gtin: '123' }, variante, produto, registro)).toEqual({ automatico: true, metodo: 'gtin', score: 1 })
  })
  it('categoria nova explícita deve ser o slug exato, inclusive para GTIN/SKU', () => {
    for (const categoria of ['outra', 'Dispositivo', ' dispositivo ']) {
      expect(avaliaMatch({ gtin: '123', categoria }, variante, produto, registro).automatico).toBe(false)
      expect(avaliaMatch({ sku_fabricante: 'sku', marca: produto.marca, categoria }, { ...variante, sku_fabricante: 'sku' }, produto, registro).automatico).toBe(false)
    }
    expect(avaliaMatch({ gtin: '123', categoria: 'dispositivo' }, variante, produto, registro).automatico).toBe(true)
  })
  it.each([[], {}, NaN, Infinity, '', null])('atributo inválido %j não confirma nem por GTIN', capacidade => {
    const invalida = { ...variante, especificacoes: { ...variante.especificacoes, capacidade } }
    expect(avaliaMatch({ gtin: '123' }, invalida, produto, registro).automatico).toBe(false)
  })
  it('categoria desconhecida, incerta e ambiguidade ficam em revisão', () => {
    expect(avaliaMatch({ gtin: '123' }, variante, produto).automatico).toBe(false)
    expect(avaliaMatch({ gtin: '123' }, { ...variante, estado: 'incerta' }, produto, registro).automatico).toBe(false)
    expect(selecionaMatch({ gtin: '123' }, [{ variante, produto }, { variante, produto }], registro)).toBeUndefined()
  })
  it('não confunde tipo escalar ou objeto com identidade ausente', () => {
    expect(avaliaMatch({ gtin: '123', especificacoes: { conectado: 'false' } }, variante, produto, registro).automatico).toBe(false)
    expect(() => chaveVariante({ especificacoes: { capacidade: {} } }, 'dispositivo', registro)).toThrow('especificacoes.capacidade')
  })
  it.each(['impressora', 'resina', 'acessorio'])('categoria legada %s mantém matching por IDs, não por atributos', categoria => {
    const p = { marca: 'Marca', modelo: 'Modelo', categoria }
    const v = { ...antiga, estado: 'confirmada', gtin: undefined, sku_fabricante: undefined }
    expect(avaliaMatch({ ...p, ...v }, v, p, registro).automatico).toBe(false)
    expect(avaliaMatch({ gtin: antiga.gtin }, { ...v, gtin: antiga.gtin }, p, registro).automatico).toBe(true)
    // A política legada continua ignorando categoria informada na entrada, como antes.
    expect(avaliaMatch({ gtin: antiga.gtin, categoria: 'divergente' }, { ...v, gtin: antiga.gtin }, p, registro).automatico).toBe(true)
    expect(avaliaMatch({ gtin: antiga.gtin, cor: 'Branco' }, { ...v, gtin: antiga.gtin }, p, registro).automatico).toBe(false)
  })
})
