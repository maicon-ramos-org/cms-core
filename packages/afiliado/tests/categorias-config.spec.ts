import { describe, expect, it } from 'vitest'
import { registrarCategorias } from '../src/cms/catalogo/categorias'
import { catalogoFisico, criaCatalogoFisico } from '../src/cms/collections/CatalogoFisico'
import { afiliado } from '../src/cms/plugin'
import type { CollectionConfig, Config } from 'payload'

const opcoes = (collections: CollectionConfig[]) => {
  const campo = collections.find(c => c.slug === 'produtos_fisicos')!.fields.find(f => 'name' in f && f.name === 'categoria')!
  if (campo.type !== 'select') throw new Error('categoria deve ser select')
  return campo.options
}
describe('configuração isolada das categorias', () => {
  it('a fábrica sem extensão conserva exatamente as coleções e campos padrão', () => {
    expect(criaCatalogoFisico()).toBe(catalogoFisico)
    expect(criaCatalogoFisico(registrarCategorias([]))).toBe(catalogoFisico)
    expect(opcoes(catalogoFisico)).toEqual(['filamento', 'impressora', 'resina', 'acessorio'])
  })
  it('dois plugins independentes não vazam opções nem políticas', async () => {
    const config = { secret: 'fixture', collections: [] } as unknown as Config
    const antes = await afiliado()(config)
    const personalizado = await afiliado({ catalogo: { categoriasAdicionais: [{ slug: 'dispositivo', rotulo: 'Dispositivo' }] } })(config)
    const depois = await afiliado()(config)
    expect(opcoes(personalizado.collections!)).toEqual(['filamento', 'impressora', 'resina', 'acessorio', { value: 'dispositivo', label: 'Dispositivo' }])
    expect(opcoes(antes.collections!)).toEqual(['filamento', 'impressora', 'resina', 'acessorio'])
    // protegeReferencias cria closures novas por montagem; o schema continua igual.
    expect(JSON.stringify(depois)).toBe(JSON.stringify(antes))
    const variante = (c: Config) => c.collections!.find(c => c.slug === 'variantes_produto')!.hooks!.beforeChange!.at(-1)
    expect(variante(depois)).toBe(variante(antes))
    expect(variante(personalizado)).not.toBe(variante(antes))
  })
})
