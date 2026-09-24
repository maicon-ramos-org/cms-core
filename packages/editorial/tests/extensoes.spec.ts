import { describe, expect, it } from 'vitest'

import { linksDoCorpo, type ExtensaoDoEditorial } from '../src/extensoes'

const tenant = { id: 1, slug: 'exemplo', nome: 'Exemplo', canonical_host: 'exemplo.test' }

describe('linksDoCorpo', () => {
  it('sem extensão, nada é reescrito e nada é rastreio: o tema funciona sozinho', async () => {
    const l = await linksDoCorpo([], tenant)
    expect(l.reescreve('https://loja.exemplo.test/x')).toBeNull()
    expect(l.ehRastreio('https://loja.exemplo.test/x')).toBe(false)
  })

  it('a primeira extensão que reescreve ganha; basta uma dizer que é rastreio', async () => {
    const a: ExtensaoDoEditorial = {
      linksDoCorpo: async () => ({ reescreve: (u) => (new URL(u).host === 'a.test' ? '/r/1' : null) }),
    }
    const b: ExtensaoDoEditorial = {
      linksDoCorpo: async () => ({ reescreve: () => '/r/2', ehRastreio: (u) => u.includes('rastreio') }),
    }
    const semGancho: ExtensaoDoEditorial = {}
    const l = await linksDoCorpo([semGancho, a, b], tenant)
    expect(l.reescreve('https://a.test/')).toBe('/r/1')
    expect(l.reescreve('https://outra.test/')).toBe('/r/2')
    expect(l.ehRastreio('https://rastreio.test/')).toBe(true)
    expect(l.ehRastreio('https://normal.test/')).toBe(false)
  })

  it('a extensão recebe o tenant da requisição', async () => {
    const vistos: unknown[] = []
    await linksDoCorpo([{ linksDoCorpo: async (t) => (vistos.push(t.slug), {}) }], tenant)
    expect(vistos).toEqual(['exemplo'])
  })
})
