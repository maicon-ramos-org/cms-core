import { describe, expect, it } from 'vitest'

import { catalogoArdPublico, textoLlmsPublico } from '../src/lib/descoberta'

const site = { nome: 'Exemplo', canonicalHost: 'exemplo.test' }

describe('descoberta pública multi-site', () => {
  it('publica ARD básico sem exigir recursos do nicho', () => {
    const catalogo = catalogoArdPublico(site)
    expect(catalogo.host.identifier).toBe('exemplo.test')
    expect(catalogo.entries.map((entrada) => entrada.url)).toEqual(['https://exemplo.test/llms.txt'])
  })

  it('aceita recursos locais do site sem vazar para outro domínio', () => {
    const recursos = [{ id: 'modelos', nome: 'Modelos', tipo: 'text/html', caminho: '/modelos/',
      descricao: 'Fichas públicas.', consultas: ['Quais modelos existem?', 'Como ler um modelo?'] as [string, string] }]
    const catalogo = catalogoArdPublico(site, recursos)
    expect(catalogo.entries[1]?.url).toBe('https://exemplo.test/modelos/')
    expect(catalogoArdPublico({ nome: 'Outro', canonicalHost: 'outro.test' }).entries).toHaveLength(1)
    expect(() => catalogoArdPublico(site, [{ ...recursos[0]!, caminho: 'https://privado.test/' }])).toThrow()
    expect(() => catalogoArdPublico(site, [recursos[0]!, recursos[0]!])).toThrow()
  })

  it('gera llms.txt só a partir de configuração estável', () => {
    const texto = textoLlmsPublico(site, {
      intro: ['Guias públicos.'],
      indices: [{ titulo: 'Sitemap', caminho: '/sitemap.xml' }],
    })
    expect(texto).toContain('# Exemplo')
    expect(texto).toContain('[Sitemap](https://exemplo.test/sitemap.xml)')
    expect(texto).not.toContain('outro.test')
  })
})
