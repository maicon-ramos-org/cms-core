/** O mesmo contrato de categorias, provado em duas verticais sem que o núcleo conheça nenhuma. */
import { describe, expect, it } from 'vitest'
import type { CollectionConfig, Config } from 'payload'
import { registrarCategorias, REGISTRO_CATEGORIAS_PADRAO } from '../src/cms/catalogo/categorias'
import { avaliaMatch, chaveVariante } from '../src/cms/catalogo/regras'
import { criaCatalogoFisico } from '../src/cms/collections/CatalogoFisico'
import { afiliado } from '../src/cms/plugin'

const config = { secret: 'fixture', collections: [] } as unknown as Config
const select = (colecoes: CollectionConfig[]) => {
  const campo = colecoes.find(c => c.slug === 'produtos_fisicos')!.fields.find(f => 'name' in f && f.name === 'categoria')!
  if (campo.type !== 'select') throw new Error('categoria deve ser select')
  return campo.options.map(o => (typeof o === 'string' ? o : o.value))
}

const fitness = [
  { slug: 'equipamento', rotulo: 'Equipamento', atributosDeIdentidade: ['especificacoes.carga_max_kg'] },
  { slug: 'suplemento', rotulo: 'Suplemento', atributosDeIdentidade: ['especificacoes.sabor', 'especificacoes.peso_g_liquido'] },
  // reaproveita um slug histórico do catálogo: só é possível sem herdar as categorias padrão
  { slug: 'acessorio', rotulo: 'Acessório', atributosDeIdentidade: ['especificacoes.material'] },
]
const verticais = [
  { nome: 'padrão (categorias históricas)', opcoes: {}, categorias: ['filamento', 'impressora', 'resina', 'acessorio'], nova: 'filamento', legada: true,
    produto: { marca: 'Marca', modelo: 'Modelo', categoria: 'filamento' },
    variante: { estado: 'confirmada', material: 'PLA', cor: 'Preto', peso_g: 1000, diametro_mm: 1.75, acabamento: 'fosco' } },
  { nome: 'fitness (só categorias do site)', opcoes: { catalogo: { categoriasAdicionais: fitness, incluirCategoriasPadrao: false } },
    categorias: ['equipamento', 'suplemento', 'acessorio'], nova: 'suplemento', legada: false,
    produto: { marca: 'Marca', modelo: 'Modelo', categoria: 'suplemento' },
    variante: { estado: 'confirmada', especificacoes: { sabor: 'Baunilha', peso_g_liquido: 900 } } },
]

describe.each(verticais)('vertical $nome', v => {
  it('o plugin monta o select de categoria só com as categorias da instância', async () => {
    const c = await afiliado(v.opcoes)(config)
    expect(select(c.collections!)).toEqual(v.categorias)
  })
  it('identidade de variante é determinística e sensível ao atributo de identidade (metadado só é neutro nas categorias novas)', () => {
    const registro = registrarCategorias(v.opcoes.catalogo?.categoriasAdicionais, { incluirPadrao: v.opcoes.catalogo?.incluirCategoriasPadrao })
    const chave = chaveVariante(v.variante, v.nova, registro)
    expect(chaveVariante({ ...v.variante }, v.nova, registro)).toBe(chave)
    // legado: `especificacoes` inteiro faz parte do hash (compatibilidade); nas novas, só os atributos declarados
    const comNota = chaveVariante({ ...v.variante, especificacoes: { ...(v.variante as any).especificacoes, nota: 'editável' } }, v.nova, registro)
    if (v.legada) expect(comNota).not.toBe(chave)
    else expect(comNota).toBe(chave)
    const alterada = 'material' in v.variante ? { ...v.variante, material: 'PETG' } : { ...v.variante, especificacoes: { sabor: 'Chocolate', peso_g_liquido: 900 } }
    expect(chaveVariante(alterada, v.nova, registro)).not.toBe(chave)
    expect(() => chaveVariante(v.variante, 'inexistente', registro)).toThrow('Categoria não registrada')
  })
  it('match automático exige atributos completos e sem conflito; categoria fora do registro nunca casa', () => {
    const registro = registrarCategorias(v.opcoes.catalogo?.categoriasAdicionais, { incluirPadrao: v.opcoes.catalogo?.incluirCategoriasPadrao })
    const entrada = { marca: 'Marca', modelo: 'Modelo', ...v.variante }
    expect(avaliaMatch(entrada, v.variante, v.produto, registro)).toMatchObject({ automatico: true })
    expect(avaliaMatch({ ...entrada, marca: 'Outra' }, v.variante, v.produto, registro)).toMatchObject({ automatico: false })
    expect(avaliaMatch(entrada, v.variante, { ...v.produto, categoria: 'inexistente' }, registro)).toMatchObject({ automatico: false, motivo: 'categoria não registrada' })
  })
})

describe('extensão sem quebrar quem já consome', () => {
  it('o padrão continua idêntico: quatro categorias históricas, mesma referência e mesmos hashes', () => {
    expect(registrarCategorias()).toBe(REGISTRO_CATEGORIAS_PADRAO)
    expect(registrarCategorias([], { incluirPadrao: true })).toBe(REGISTRO_CATEGORIAS_PADRAO)
    expect(select(criaCatalogoFisico())).toEqual(['filamento', 'impressora', 'resina', 'acessorio'])
  })
  it('adicionar categorias mantém as históricas e a ordem (site que já consome não muda o enum)', () => {
    const r = registrarCategorias([{ slug: 'equipamento', rotulo: 'Equipamento' }])
    expect(r.map(c => c.slug)).toEqual(['filamento', 'impressora', 'resina', 'acessorio', 'equipamento'])
    expect(select(criaCatalogoFisico(r))).toEqual(['filamento', 'impressora', 'resina', 'acessorio', 'equipamento'])
  })
  it('sem as categorias padrão, o slug histórico é livre; com elas, continua reservado', () => {
    expect(() => registrarCategorias([{ slug: 'acessorio', rotulo: 'Acessório' }])).toThrow('duplicada')
    expect(registrarCategorias([{ slug: 'acessorio', rotulo: 'Acessório' }], { incluirPadrao: false })[0]).toMatchObject({ slug: 'acessorio', legada: false })
  })
  it('sem categorias padrão exige ao menos uma categoria própria', () => {
    expect(() => registrarCategorias([], { incluirPadrao: false })).toThrow('ao menos uma')
    expect(() => registrarCategorias(undefined, { incluirPadrao: false })).toThrow('ao menos uma')
  })
  it('duas instâncias no mesmo processo não vazam categorias entre si', async () => {
    const a = await afiliado(verticais[1]!.opcoes)(config)
    const b = await afiliado()(config)
    const c = await afiliado(verticais[1]!.opcoes)(config)
    expect(select(b.collections!)).toEqual(['filamento', 'impressora', 'resina', 'acessorio'])
    expect(select(a.collections!)).toEqual(select(c.collections!))
  })
})
