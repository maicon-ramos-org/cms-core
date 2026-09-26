import { describe, expect, it } from 'vitest'
import type { CollectionConfig, Config } from 'payload'
import { ofertasEditoriais } from '../src/cms/ofertas-editoriais/plugin'

const base = { secret: 'fixture', collections: ['posts', 'tenants', 'entidades'].map(slug => ({ slug, fields: [] })) } as unknown as Config
const programa = (slug: string) => ({ slug, rotulo: slug, hostsPermitidos: [`${slug}.example`] })
const nomes = (config: Config) => config.collections!.map(c => c.slug)
const nomesCampos = (collection: CollectionConfig) => collection.fields.flatMap(f => 'name' in f ? [f.name] : [])
describe('ofertas editoriais só por instalação explícita', () => {
  it('não toca a config original nem o registro de outra instância', async () => {
    const snapshot = JSON.stringify(base)
    const a = await ofertasEditoriais({ programas: [programa('a')] })(base)
    const b = await ofertasEditoriais({ programas: [programa('b')] })(base)
    expect(JSON.stringify(base)).toBe(snapshot)
    expect(nomes(base)).toEqual(['posts', 'tenants', 'entidades'])
    expect(nomes(a)).toContain('ofertas_editoriais')
    expect(nomes(a)).toContain('verificacoes_ofertas_editoriais')
    expect(nomesCampos(a.collections!.find(c => c.slug === 'posts')!)).toContain('escolhas')
    const options = (c: Config) => {
      const field = c.collections!.find(c => c.slug === 'ofertas_editoriais')!.fields.find(f => 'name' in f && f.name === 'programa')!
      return field.type === 'select' ? field.options : []
    }
    expect(options(a)).toEqual([{ label: 'a', value: 'a' }])
    expect(options(b)).toEqual([{ label: 'b', value: 'b' }])
    expect(a.endpoints).toBeUndefined()
  })
  it('exige grafo/tenant/posts e não instala duas vezes', async () => {
    const plugin = ofertasEditoriais({ programas: [programa('a')] })
    expect(() => plugin({ ...base, collections: [] })).toThrow('grafoEditorial')
    const aplicado = await plugin(base)
    expect(() => plugin(aplicado)).toThrow('duplicada')
    expect(() => ofertasEditoriais({ programas: [] })).toThrow('programa')
  })
})
