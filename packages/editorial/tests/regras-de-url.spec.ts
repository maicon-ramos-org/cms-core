/**
 * As regras de URL do middleware do tema com a config de um site de exemplo. O site de
 * verdade passou pela comparação com as regras antigas, caminho a caminho (PRD 17 RF3b); aqui
 * fica o comportamento que precisa continuar valendo.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ConfigDoEditorial } from '../src/config'
import {
  caminhoDoMd,
  juntaVary,
  querMarkdown,
  regrasDeUrl,
  respostaCacheavel,
  slugPeloSufixo,
  tenantPadrao,
} from '../src/regras-de-url'

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
  it('`semTenant` também tira a barra final da regra (PRD 24)', () => {
    const { precisaDeBarra } = regrasDeUrl({ tenantPadrao: 'x', semTenant: ['/wp-content/uploads'] })
    expect(precisaDeBarra('/wp-content/uploads/2022/foo.jpg')).toBe(false)
    expect(precisaDeBarra('/wp-content/uploads-sem-extensao')).toBe(false)
    expect(precisaDeBarra('/outra-coisa')).toBe(true)
  })
})

describe('precisaPularTenant (PRD 24: `semTenant` genérico da config)', () => {
  it('sem `semTenant` na config, nunca pula', () => {
    expect(regrasDeUrl({ tenantPadrao: 'x' }).precisaPularTenant('/qualquer/coisa')).toBe(false)
  })
  it('casa por prefixo, com um ou mais prefixos declarados', () => {
    const { precisaPularTenant } = regrasDeUrl({ tenantPadrao: 'x', semTenant: ['/wp-content/uploads', '/velho'] })
    expect(precisaPularTenant('/wp-content/uploads/2022/12/foo.jpg')).toBe(true)
    expect(precisaPularTenant('/velho/x')).toBe(true)
    expect(precisaPularTenant('/wp-content/outra-pasta')).toBe(false)
    expect(precisaPularTenant('/')).toBe(false)
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

describe('tenant pelo host, sem env explícito (PRD 24 RF3: lê por `variavel`)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })
  it('sem a variável, vale a config', () => {
    vi.stubEnv('DEFAULT_TENANT', undefined)
    vi.stubEnv('HOST_SUFIXOS_TENANT', undefined)
    expect(tenantPadrao(config)).toBe('principal')
    expect(slugPeloSufixo('3d.exemplo.local', config)).toBe('3d')
  })
  it('com a variável no ambiente do processo, ela ganha', () => {
    vi.stubEnv('DEFAULT_TENANT', 'outro')
    vi.stubEnv('HOST_SUFIXOS_TENANT', '.dev.b.com')
    expect(tenantPadrao(config)).toBe('outro')
    expect(slugPeloSufixo('x.dev.b.com', config)).toBe('x')
    expect(slugPeloSufixo('3d.exemplo.local', config)).toBeNull()
  })
})

describe('juntaVary', () => {
  it('sem Vary anterior, só os nomes pedidos', () => {
    expect(juntaVary(null, ['Host'])).toBe('Host')
    expect(juntaVary(null, ['Accept', 'Host'])).toBe('Accept, Host')
  })
  it('acrescenta ao que já estava, sem repetir e sem olhar a caixa', () => {
    expect(juntaVary('Accept', ['Accept', 'Host'])).toBe('Accept, Host')
    expect(juntaVary('host', ['Host'])).toBe('host')
  })
  it('Accept-Encoding não é Accept', () => {
    expect(juntaVary('Accept-Encoding', ['Accept'])).toBe('Accept-Encoding, Accept')
  })
  it('Vary: * já varia por tudo: fica como está', () => {
    expect(juntaVary('*', ['Host'])).toBe('*')
  })
})

describe('respostaCacheavel', () => {
  it.each([
    ['GET', null],
    ['HEAD', null],
    ['GET', 'public, max-age=3600'],
    ['GET', 'max-age=0, must-revalidate'],
    ['get', 's-maxage=300'],
  ])('%s com Cache-Control %s pode ir para cache', (metodo, cc) => {
    expect(respostaCacheavel(metodo, cc)).toBe(true)
  })
  it.each([
    ['POST', null],
    ['GET', 'no-store'],
    ['GET', 'private, max-age=60'],
    ['GET', 'No-Store'],
    ['HEAD', 'no-cache, no-store, must-revalidate'],
  ])('%s com Cache-Control %s não vai', (metodo, cc) => {
    expect(respostaCacheavel(metodo, cc)).toBe(false)
  })

  it('`private` COM lista de campos não desqualifica (RFC 9111 §5.2.2.7): só aqueles campos são privados', () => {
    expect(respostaCacheavel('GET', 'private=set-cookie')).toBe(true)
    expect(respostaCacheavel('GET', 'private="set-cookie, x-outro"')).toBe(true)
  })

  it('`private` SEM lista continua desqualificando', () => {
    expect(respostaCacheavel('GET', 'private')).toBe(false)
    expect(respostaCacheavel('GET', 'max-age=60, private')).toBe(false)
  })

  it('Cloudflare-CDN-Cache-Control com public/max-age guarda mesmo com Cache-Control: private', () => {
    expect(respostaCacheavel('GET', 'private', 'public, max-age=3600')).toBe(true)
    expect(respostaCacheavel('GET', 'no-store', 'max-age=60')).toBe(true)
  })

  it('CDN-Cache-Control (sem o prefixo Cloudflare-) também vale quando é o único presente', () => {
    expect(respostaCacheavel('GET', null, 'public')).toBe(true)
  })

  it('sem CDN-Cache-Control nenhum, vale só o Cache-Control (comportamento de antes)', () => {
    expect(respostaCacheavel('GET', 'private', null)).toBe(false)
    expect(respostaCacheavel('GET', 'public, max-age=60', undefined)).toBe(true)
  })
})
