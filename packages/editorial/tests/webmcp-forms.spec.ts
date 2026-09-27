import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const componente = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8')

describe('formulários WebMCP padrão do tema editorial', () => {
  it('a busca do cabeçalho identifica a ferramenta e seu parâmetro', () => {
    const fonte = componente('../src/componentes/Cabecalho.astro')
    expect(fonte).toContain('toolname="buscar_no_site"')
    expect(fonte).toContain('tooldescription=')
    expect(fonte).toMatch(/<input[^>]*name="q"[^>]*toolparamdescription="[^"]+"/)
  })

  it('a busca de resultados descreve o novo termo', () => {
    const fonte = componente('../src/rotas/busca.astro')
    expect(fonte).toContain('toolname="refinar_busca"')
    expect(fonte).toMatch(/<input[^>]*name="q"[^>]*toolparamdescription="[^"]+"/)
  })

  it('o contato conserva a descrição de cada campo', () => {
    const fonte = componente('../src/componentes/FormularioContato.astro')
    for (const nome of ['nome', 'email', 'mensagem']) {
      expect(fonte).toMatch(new RegExp(`<[^>]+name="${nome}"[^>]*toolparamdescription="[^"]+"`))
    }
  })
})
