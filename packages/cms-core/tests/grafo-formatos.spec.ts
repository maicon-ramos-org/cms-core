import { describe, expect, it } from 'vitest'
import { grafoEditorial, registrarFormatos } from '../src/grafo'
import type { Config } from 'payload'

describe('registro de formatos editoriais', () => {
  it('núcleo registra apenas artigo; extensões declaram os seus formatos', () => {
    expect(registrarFormatos().map(f => f.slug)).toEqual(['artigo'])
    expect(registrarFormatos([{ slug: 'guia', rotulo: 'Guia', intencao: 'aprender' }]).map(f => f.slug)).toEqual(['artigo', 'guia'])
  })
  it.each(['artigo', 'Com Espaço'])('rejeita slug duplicado ou inválido: %s', slug => {
    expect(() => registrarFormatos([{ slug, rotulo: 'Formato', intencao: 'aprender' }])).toThrow()
  })
  it('plugin exige núcleo e não aceita registro duplo', async () => {
    const vazio = { collections: [] } as unknown as Config
    expect(() => grafoEditorial()(vazio)).toThrow('exige cmsCore')
    const base = { collections: [{ slug: 'posts', fields: [] }, { slug: 'tenants', fields: [] }] } as unknown as Config
    const montado = await grafoEditorial()(base)
    expect(base.collections).toHaveLength(2)
    expect(montado.collections).toHaveLength(9)
    expect(() => grafoEditorial()(montado)).toThrow('duplicada')
  })
})
