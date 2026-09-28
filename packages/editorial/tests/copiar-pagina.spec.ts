import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const fonte = readFileSync(new URL('../src/componentes/CopiarPagina.astro', import.meta.url), 'utf8')

describe('CopiarPagina compartilhado', () => {
  it('oferece links reais e busca Markdown somente no clique', () => {
    expect(fonte).toContain('href={md}')
    expect(fonte).toContain('https://chatgpt.com/')
    expect(fonte).toContain('https://claude.ai/')
    expect(fonte).toContain('fetch(md)')
    expect(fonte).toContain("botao.addEventListener('click'")
  })

  it('tem fallback visual para temas que não usam tokens rz', () => {
    expect(fonte).toContain('var(--rz-borda, var(--border, currentColor))')
    expect(fonte).toContain('var(--rz-bg, var(--surface, transparent))')
  })
})
