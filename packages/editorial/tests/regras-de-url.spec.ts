/**
 * As regras de URL do middleware do tema com a config de um site de exemplo. O site de
 * verdade passou pela comparação com as regras antigas, caminho a caminho (PRD 17 RF3b); aqui
 * fica o comportamento que precisa continuar valendo.
 */
import { describe, expect, it } from 'vitest'

import type { ConfigDoEditorial } from '../src/config'
import { caminhoDoMd, querMarkdown, regrasDeUrl, slugPeloSufixo, tenantPadrao } from '../src/regras-de-url'

const config: ConfigDoEditorial = {
  tenantPadrao: 'principal',
  sufixosDeHost: ['.exemplo.local'],
  semBarra: ['r'],
  pastasComMd: ['ofertas', 'apps'],
  semMd: ['/glossario/'],
}
const { precisaDeBarra, temGemeoMd } = regrasDeUrl(config)

describe('precisaDeBarra', () => {
  it.each(['/blog', '/post-qualquer', '/categoria/x', '/ofertas/x', '/rr'])('%s leva 301 para a barra', (p) => {
    expect(precisaDeBarra(p)).toBe(true)
  })
  it.each(['/', '/blog/', '/api/contato', '/r/123', '/healthz', '/post.md', '/sitemap_index.xml', '/fontes/a.woff2'])(
    '%s fica como está',
    (p) => {
      expect(precisaDeBarra(p)).toBe(false)
    },
  )
  it('sem `semBarra` na config, só a API fica sem barra', () => {
    expect(regrasDeUrl({ tenantPadrao: 'x' }).precisaDeBarra('/r/123')).toBe(true)
    expect(regrasDeUrl({ tenantPadrao: 'x' }).precisaDeBarra('/api/x')).toBe(false)
  })
})

describe('temGemeoMd', () => {
  it.each(['/post-qualquer/', '/ofertas/x/', '/apps/y/'])('%s tem gêmeo .md', (p) => {
    expect(temGemeoMd(p)).toBe(true)
  })
  it.each(['/', '/blog/', '/busca/', '/ofertas/', '/apps/', '/glossario/', '/ofertas/x/y/', '/categoria/x/', '/post'])(
    '%s não tem',
    (p) => {
      expect(temGemeoMd(p)).toBe(false)
    },
  )
  it('pasta que o site não declarou é página de raiz só no primeiro nível', () => {
    expect(temGemeoMd('/modelos/')).toBe(true)
    expect(temGemeoMd('/modelos/a/')).toBe(false)
  })
})

describe('negociação de markdown', () => {
  it('markdown só vence se vier antes de html', () => {
    expect(querMarkdown('text/markdown')).toBe(true)
    expect(querMarkdown('text/markdown, text/html')).toBe(true)
    expect(querMarkdown('text/html, text/markdown')).toBe(false)
    expect(querMarkdown('text/html,application/xhtml+xml,*/*;q=0.8')).toBe(false)
  })
  it('o gêmeo é o caminho sem a barra, com .md', () => {
    expect(caminhoDoMd('/post-qualquer/')).toBe('/post-qualquer.md')
  })
})

describe('tenant pelo host', () => {
  it('subdomínio do sufixo é o slug; o sufixo nu é o tenant padrão', () => {
    expect(slugPeloSufixo('3d.exemplo.local', config, {})).toBe('3d')
    expect(slugPeloSufixo('exemplo.local', config, {})).toBe('principal')
    expect(slugPeloSufixo('exemplo.com', config, {})).toBeNull()
  })
  it('as variáveis de ambiente ganham da config', () => {
    const env = { DEFAULT_TENANT: 'outro', HOST_SUFIXOS_TENANT: '.a.local, .dev.b.com' }
    expect(tenantPadrao(config, env)).toBe('outro')
    expect(slugPeloSufixo('x.dev.b.com', config, env)).toBe('x')
    expect(slugPeloSufixo('dev.b.com', config, env)).toBe('outro')
    expect(slugPeloSufixo('y.exemplo.local', config, env)).toBeNull()
  })
})
