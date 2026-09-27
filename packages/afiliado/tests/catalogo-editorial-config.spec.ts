import { describe, expect, it } from 'vitest'
import type { CollectionConfig, Config } from 'payload'
import { catalogoEditorial } from '../src/cms/ofertas-editoriais/catalogo'
import { ofertasEditoriais } from '../src/cms/ofertas-editoriais/plugin'

const base = { secret: 'fixture', collections: ['posts', 'tenants', 'entidades'].map(slug => ({ slug, fields: [] })) } as unknown as Config
const offers = ofertasEditoriais({ programas: [{ slug: 'loja', rotulo: 'Loja', hostsPermitidos: ['loja.example'] }] })
const campos = (c: CollectionConfig) => c.fields.flatMap(field => 'name' in field ? [field.name] : [])

describe('catálogo editorial opt-in', () => {
  it('acrescenta lojas, cupons e categorias à única oferta, sem produto paralelo ou cron', async () => {
    const snapshot = JSON.stringify(base)
    const somenteOfertas = await offers(base)
    const config = await catalogoEditorial()(somenteOfertas)
    expect(JSON.stringify(base)).toBe(snapshot)
    expect(somenteOfertas.collections?.map(c => c.slug)).not.toContain('lojas')
    expect(config.collections?.map(c => c.slug)).toEqual(expect.arrayContaining([
      'ofertas_editoriais', 'verificacoes_ofertas_editoriais', 'lojas', 'cupons', 'categorias_oferta',
    ]))
    expect(config.collections?.map(c => c.slug)).not.toContain('ofertas')
    expect(config.collections?.map(c => c.slug)).not.toContain('produtos')
    expect(config.collections?.map(c => c.slug)).not.toContain('historico_desconto')
    expect(config.jobs).toEqual(somenteOfertas.jobs)
    const oferta = config.collections!.find(c => c.slug === 'ofertas_editoriais')!
    expect(campos(oferta)).toEqual(expect.arrayContaining(['loja', 'cupom', 'categorias']))
    expect(oferta.hooks?.afterChange).toHaveLength(1)
    expect(config.collections!.find(c => c.slug === 'verificacoes_ofertas_editoriais')?.hooks?.afterChange).toHaveLength(1)
  })

  it('exige ofertas editoriais e não permite catálogo clássico ou instalação duplicada', async () => {
    expect(() => catalogoEditorial()(base)).toThrow('exige ofertasEditoriais')
    const config = await offers(base)
    expect(() => catalogoEditorial()({ ...config, collections: [...(config.collections ?? []), { slug: 'lojas', fields: [] }] })).toThrow('conflita')
    expect(() => catalogoEditorial()(catalogoEditorial()(config) as Config)).toThrow('conflita')
  })
})
