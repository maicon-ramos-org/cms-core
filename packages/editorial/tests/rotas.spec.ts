import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { normalizaPadrao, padraoDoArquivo, rotasDoSite } from '../src/rotas'

describe('padraoDoArquivo', () => {
  it.each([
    ['index.astro', '/'],
    ['blog.astro', '/blog'],
    ['blog/index.astro', '/blog'],
    ['[slug].astro', '/[slug]'],
    ['[slug].md.ts', '/[slug].md'],
    ['categoria/[slug].astro', '/categoria/[slug]'],
    ['categoria-oferta/[...caminho].astro', '/categoria-oferta/[...caminho]'],
    ['sitemap-[tipo].xml.ts', '/sitemap-[tipo].xml'],
    ['.well-known/mcp.json.ts', '/.well-known/mcp.json'],
    ['robots.txt.ts', '/robots.txt'],
    ['api/cupom/[id].ts', '/api/cupom/[id]'],
  ])('%s → %s', (arquivo, padrao) => {
    expect(padraoDoArquivo(arquivo)).toBe(padrao)
  })

  it.each(['_parcial.astro', '_util/x.ts', 'tipos.d.ts', 'LEIAME.txt', 'estilo.css'])('%s não é rota', (arquivo) => {
    expect(padraoDoArquivo(arquivo)).toBeNull()
  })
})

describe('normalizaPadrao', () => {
  it('o nome do parâmetro não importa; o formato sim', () => {
    expect(normalizaPadrao('/[slug]')).toBe(normalizaPadrao('/[id]'))
    expect(normalizaPadrao('/cat/[...a]')).toBe(normalizaPadrao('/cat/[...b]'))
    expect(normalizaPadrao('/cat/[...a]')).not.toBe(normalizaPadrao('/cat/[a]'))
    expect(normalizaPadrao('/[slug].md')).not.toBe(normalizaPadrao('/[slug]'))
    expect(normalizaPadrao('/cupom-[loja]')).toBe(normalizaPadrao('/cupom-[x]'))
  })

  it('barra final não muda a rota', () => {
    expect(normalizaPadrao('/blog/')).toBe('/blog')
    expect(normalizaPadrao('/')).toBe('/')
  })
})

describe('rotasDoSite', () => {
  let pasta: string
  afterEach(() => rmSync(pasta, { recursive: true, force: true }))

  it('lê a pasta inteira; pasta inexistente é site sem rota própria', () => {
    pasta = mkdtempSync(path.join(os.tmpdir(), 'paginas-'))
    mkdirSync(path.join(pasta, 'tag'))
    writeFileSync(path.join(pasta, 'index.astro'), '')
    writeFileSync(path.join(pasta, 'tag', '[nome].astro'), '')
    writeFileSync(path.join(pasta, '_rascunho.astro'), '')
    expect([...rotasDoSite(pasta)].sort()).toEqual(['/', '/tag/[]'])
    expect(rotasDoSite(path.join(pasta, 'nao-existe')).size).toBe(0)
  })
})
