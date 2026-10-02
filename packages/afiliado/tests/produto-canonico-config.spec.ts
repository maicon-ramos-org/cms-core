import { describe, expect, it, vi } from 'vitest'
import type { CollectionConfig, Config } from 'payload'
import { produtoCanonico } from '../src/cms/produto-canonico'

const collection = (slug: string): CollectionConfig => ({ slug: slug as CollectionConfig['slug'], fields: [] })

describe('produto canônico opt-in', () => {
  it('instala apenas a identidade física, sem duplicar as coleções comerciais do site', () => {
    const base = { secret: 'teste', collections: [collection('tenants'), collection('midia'),
      collection('lojas'), collection('ofertas_editoriais')] } as Config
    const result = produtoCanonico({ incluirCategoriasPadrao: false,
      categoriasAdicionais: [{ slug: 'suplemento', rotulo: 'Suplemento' }] })(base) as Config
    expect(result.collections!.map(c => c.slug)).toEqual(['tenants', 'midia', 'lojas', 'ofertas_editoriais', 'produtos_fisicos'])
    const produto = result.collections!.at(-1)!
    expect(produto.hooks?.afterChange).toHaveLength(1)
    const categoria = produto.fields.find(f => 'name' in f && f.name === 'categoria')
    expect(categoria).toMatchObject({ options: [{ label: 'Suplemento', value: 'suplemento' }] })
    expect(result.collections![2]).toBe(base.collections![2])
    expect(result.collections![3]).toBe(base.collections![3])
    expect(result.collections![1]).not.toBe(base.collections![1]) // mídia referenciada é protegida
  })

  it('falha quando não há núcleo ou quando o catálogo físico já está instalado', () => {
    expect(() => produtoCanonico()({ secret: 'teste', collections: [] } as unknown as Config)).toThrow('cmsCore')
    expect(() => produtoCanonico()({ secret: 'teste', collections: [collection('tenants'),
      collection('midia'), collection('produtos_fisicos')] } as Config)).toThrow('conflita')
  })

  it('vincula ofertas editoriais opcionalmente e recusa produto de outro tenant', async () => {
    const base = { secret: 'teste', collections: [collection('tenants'), collection('midia'),
      collection('ofertas_editoriais')] } as Config
    const result = produtoCanonico({ vincularOfertasEditoriais: true })(base) as Config
    const ofertas = result.collections!.find(c => c.slug === 'ofertas_editoriais')!
    expect(ofertas.fields).toContainEqual(expect.objectContaining({ name: 'produto', relationTo: 'produtos_fisicos' }))
    expect(ofertas.indexes).toContainEqual({ fields: ['tenant', 'produto'] })
    const hook = ofertas.hooks!.beforeValidate!.at(-1)!
    const findByID = vi.fn().mockResolvedValue({ id: 4, tenant: 2 })
    const args = { data: { tenant: 2, produto: 4 }, req: { payload: { findByID } } }
    await expect(hook(args as never)).resolves.toMatchObject(args.data)
    await expect(hook({ ...args, data: { tenant: 3, produto: 4 } } as never))
      .rejects.toMatchObject({ data: { errors: [{ path: 'produto' }] } })
    findByID.mockRejectedValueOnce(new Error('não encontrado'))
    await expect(hook(args as never)).rejects.toMatchObject({ data: { errors: [{ path: 'produto' }] } })
    await expect(hook({ ...args, data: { tenant: 2, produto: null } } as never))
      .resolves.toMatchObject({ produto: null })
    expect(base.collections![2]!.fields).toEqual([])
  })
})
