/**
 * Uma fixture por regra do PRD 04 (RF3-RF6, RF8) — critério de aceite do próprio PRD.
 * TDD: este arquivo existiu antes da implementação.
 */
import { describe, expect, it } from 'vitest'

import { aplicaLinks, derivaAncora } from '../src/index'
import { citacao, destino, heading, link, linksDe, paragrafo, raiz, regra, tabela, texto } from './fixtures'

const origem = { colecao: 'posts' as const, id: 1, url: '/um-post/', tenant: 1 }
const base = { origem, maxLinks: 5 }

describe('RF3 — onde e quantas vezes linkar', () => {
  it('linka a âncora encontrada no parágrafo', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('Rodar n8n numa VPS é barato.'))), { ...base, regras: [regra(['n8n'])] })
    expect(linksDe(r.arvore)).toEqual([{ url: '/ofertas/hostinger-vps-n8n/', ancora: 'n8n' }])
  })

  it('a frase MAIS ESPECÍFICA vence a genérica', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('Quero uma VPS para n8n hoje.'))), {
      ...base,
      regras: [
        regra(['n8n'], { destino: destino({ id: 1, url: '/a/' }) }),
        regra(['VPS para n8n'], { destino: destino({ id: 2, url: '/b/' }) }),
      ],
    })
    expect(linksDe(r.arvore)).toEqual([{ url: '/b/', ancora: 'VPS para n8n' }])
  })

  it('só a PRIMEIRA ocorrência vira link', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('n8n aqui e n8n de novo e n8n'))), { ...base, regras: [regra(['n8n'])] })
    expect(linksDe(r.arvore)).toHaveLength(1)
  })

  it('um link por DESTINO por página, mesmo com âncoras diferentes', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('n8n na Hostinger')), paragrafo(texto('mais sobre hostinger vps'))), {
      ...base,
      regras: [regra(['n8n', 'hostinger vps'])],
    })
    expect(linksDe(r.arvore)).toHaveLength(1)
  })

  it('respeita o TETO de links da página', () => {
    const r = aplicaLinks(
      raiz(paragrafo(texto('n8n e coolify e docker')), ),
      {
        ...base,
        maxLinks: 2,
        regras: [
          regra(['n8n'], { destino: destino({ id: 1, url: '/a/' }) }),
          regra(['coolify'], { destino: destino({ id: 2, url: '/b/' }) }),
          regra(['docker'], { destino: destino({ id: 3, url: '/c/' }) }),
        ],
      },
    )
    expect(linksDe(r.arvore)).toHaveLength(2)
  })

  it.each([
    ['heading', heading('n8n no título')],
    ['citação', citacao('n8n na citação')],
    ['tabela', tabela('n8n na tabela')],
  ])('NUNCA linka dentro de %s', (_nome, no) => {
    const r = aplicaLinks(raiz(no), { ...base, regras: [regra(['n8n'])] })
    expect(linksDe(r.arvore)).toHaveLength(0)
  })

  it('não linka dentro de um link que já existe', () => {
    const r = aplicaLinks(raiz(paragrafo(link('/outro/', 'guia de n8n'))), { ...base, regras: [regra(['n8n'])] })
    expect(linksDe(r.arvore)).toEqual([{ url: '/outro/', ancora: 'guia de n8n' }])
  })

  it('não linka texto em código (format de code do Lexical)', () => {
    const codigo = { type: 'text', text: 'docker run n8n', format: 16, version: 1 }
    const r = aplicaLinks(raiz(paragrafo(codigo)), { ...base, regras: [regra(['n8n'])] })
    expect(linksDe(r.arvore)).toHaveLength(0)
  })

  it('respeita a stoplist do tenant', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('falando de n8n'))), {
      ...base,
      stoplist: ['n8n'],
      regras: [regra(['n8n'])],
    })
    expect(linksDe(r.arvore)).toHaveLength(0)
  })

  it('casa âncora ignorando caixa, mas preserva o texto original', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('O N8N é ótimo'))), { ...base, regras: [regra(['n8n'])] })
    expect(linksDe(r.arvore)).toEqual([{ url: '/ofertas/hostinger-vps-n8n/', ancora: 'N8N' }])
  })

  it('não casa no meio de palavra (n8nzão não vira link)', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('usei n8nzao ontem'))), { ...base, regras: [regra(['n8n'])] })
    expect(linksDe(r.arvore)).toHaveLength(0)
  })
})

describe('as três formas de virar link podre', () => {
  it('NUNCA linka pra destino não publicado (RF8)', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('sobre n8n'))), {
      ...base,
      regras: [regra(['n8n'], { destino: destino({ publicado: false }) })],
    })
    expect(linksDe(r.arvore)).toHaveLength(0)
  })

  it('NUNCA faz self-link (mesma coleção e mesmo id)', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('sobre n8n'))), {
      ...base,
      regras: [regra(['n8n'], { destino: destino({ colecao: 'posts', id: 1 }) })],
    })
    expect(linksDe(r.arvore)).toHaveLength(0)
  })

  it('devolve o destino como RELAÇÃO (coleção + id), não como texto de URL', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('sobre n8n'))), { ...base, regras: [regra(['n8n'])] })
    expect(r.aplicados[0]).toMatchObject({ destino: { colecao: 'ofertas', id: 10 }, ancora: 'n8n' })
  })
})

describe('RF5 — silo por tenant', () => {
  it('não linka pra destino de outro tenant', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('sobre n8n'))), {
      ...base,
      regras: [regra(['n8n'], { destino: destino({ tenant: 2 }) })],
    })
    expect(linksDe(r.arvore)).toHaveLength(0)
  })

  it('permite quando o tenant está na whitelist explícita', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('sobre n8n'))), {
      ...base,
      whitelistCrossTenant: [2],
      regras: [regra(['n8n'], { destino: destino({ tenant: 2 }) })],
    })
    expect(linksDe(r.arvore)).toHaveLength(1)
  })
})

describe('RF4 e RF6 — rotação determinística e boost de órfãs', () => {
  it('roda 2x na mesma página e dá o MESMO resultado', () => {
    const arvore = () => raiz(paragrafo(texto('n8n e mais n8n')))
    const a = aplicaLinks(arvore(), { ...base, regras: [regra(['n8n', 'workflow n8n'])] })
    const b = aplicaLinks(arvore(), { ...base, regras: [regra(['n8n', 'workflow n8n'])] })
    expect(linksDe(a.arvore)).toEqual(linksDe(b.arvore))
  })

  it('páginas diferentes rotacionam âncoras diferentes do mesmo destino', () => {
    const escolhe = (url: string) =>
      linksDe(
        aplicaLinks(raiz(paragrafo(texto('vale a pena o n8n e o workflow n8n'))), {
          ...base,
          origem: { ...origem, url },
          regras: [regra(['n8n', 'workflow n8n'])],
        }).arvore,
      )[0]!.ancora
    const escolhas = new Set(['/a/', '/b/', '/c/', '/d/'].map(escolhe))
    expect(escolhas.size).toBeGreaterThan(1)
  })

  it('com o teto cheio, o destino com MENOS links entrantes ganha (boost de órfã)', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('coolify e n8n'))), {
      ...base,
      maxLinks: 1,
      regras: [
        regra(['coolify'], { destino: destino({ id: 1, url: '/popular/' }), linksEntrantes: 40 }),
        regra(['n8n'], { destino: destino({ id: 2, url: '/orfa/' }), linksEntrantes: 0 }),
      ],
    })
    expect(linksDe(r.arvore)).toEqual([{ url: '/orfa/', ancora: 'n8n' }])
  })
})

/**
 * Regra 1b (design-auto-linker v0.2.0): destino sem `ancoras_alvo` ganha candidata
 * derivada do título. Existe porque 72,2% do acervo é órfão — sem ela o auto-linker
 * resolveria post→oferta e deixaria post→post parado pra sempre.
 */
describe('1b — âncora derivada do título', () => {
  const semAncora = (titulo: string, over = {}) => regra([], { titulo, ...over })

  it('destino sem âncora curada linka pelo título', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('Falamos sobre como instalar o n8n numa VPS antes.'))), {
      ...base,
      regras: [semAncora('Como instalar o n8n numa VPS')],
    })
    expect(linksDe(r.arvore)).toEqual([
      { url: '/ofertas/hostinger-vps-n8n/', ancora: 'como instalar o n8n numa VPS' },
    ])
    expect(r.aplicados[0]!.fonte_ancora).toBe('derivada')
  })

  it('âncora curada continua marcada como curada', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('Rodar n8n é barato.'))), { ...base, regras: [regra(['n8n'])] })
    expect(r.aplicados[0]!.fonte_ancora).toBe('curada')
  })

  it('título curto demais NÃO vira âncora — o destino segue órfão de propósito', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('Tudo sobre IA e VPS hoje.'))), {
      ...base,
      regras: [semAncora('IA e VPS')], // 2 palavras, 8 caracteres
    })
    expect(linksDe(r.arvore)).toEqual([])
  })

  it('título com 3 palavras mas menos de 18 caracteres também não passa', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('vale ver o guia de VPS aqui'))), {
      ...base,
      regras: [semAncora('guia de VPS')], // 3 palavras, 11 caracteres
    })
    expect(linksDe(r.arvore)).toEqual([])
  })

  it('curada vence derivada no MESMO trecho', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('leia o guia de VPS para n8n agora'))), {
      ...base,
      regras: [
        semAncora('guia de VPS para n8n', { destino: destino({ id: 2, url: '/derivada/' }) }),
        regra(['guia de VPS para n8n'], { destino: destino({ id: 3, url: '/curada/' }) }),
      ],
    })
    expect(linksDe(r.arvore)).toEqual([{ url: '/curada/', ancora: 'guia de VPS para n8n' }])
  })

  it('empate entre duas derivadas no mesmo trecho NÃO escolhe: cancela as duas', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('vimos o guia de VPS para n8n na semana passada'))), {
      ...base,
      regras: [
        semAncora('guia de VPS para n8n', { destino: destino({ id: 2, url: '/um/' }) }),
        semAncora('guia de VPS para n8n', { destino: destino({ id: 3, url: '/outro/' }) }),
      ],
    })
    expect(linksDe(r.arvore)).toEqual([])
    expect(r.descartadosPorEmpate).toHaveLength(1)
    expect(r.descartadosPorEmpate[0]!.trecho).toBe('guia de VPS para n8n')
  })

  it('derivada NÃO ganha vaga extra: respeita o teto', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('o guia de VPS para n8n e o manual do coolify em casa'))), {
      ...base,
      maxLinks: 1,
      regras: [
        semAncora('guia de VPS para n8n', { destino: destino({ id: 2, url: '/a/' }) }),
        semAncora('manual do coolify em casa', { destino: destino({ id: 3, url: '/b/' }) }),
      ],
    })
    expect(linksDe(r.arvore)).toHaveLength(1)
  })

  it('derivada respeita 1 link por destino por página', () => {
    const r = aplicaLinks(
      raiz(
        paragrafo(texto('o guia de VPS para n8n resolve')),
        paragrafo(texto('de novo o guia de VPS para n8n aqui')),
      ),
      { ...base, regras: [semAncora('guia de VPS para n8n')] },
    )
    expect(linksDe(r.arvore)).toHaveLength(1)
  })

  it('derivada nunca faz self-link nem linka pra despublicado', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('o guia de VPS para n8n de novo'))), {
      ...base,
      regras: [
        semAncora('guia de VPS para n8n', { destino: destino({ colecao: 'posts', id: 1 }) }),
        semAncora('guia de VPS para n8n', { destino: destino({ id: 9, publicado: false }) }),
      ],
    })
    expect(linksDe(r.arvore)).toEqual([])
  })
})

describe('subtítulo disfarçado de parágrafo', () => {
  it('não linka quando a âncora ocupa o nó curto inteiro', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('Integração com Google Search para dados reais'))), {
      ...base,
      regras: [regra(['Integração com Google Search para dados reais'])],
    })
    expect(linksDe(r.arvore)).toEqual([])
  })

  it('mas linka a MESMA âncora quando ela aparece em prosa depois', () => {
    const r = aplicaLinks(
      raiz(
        paragrafo(texto('Integração com Google Search para dados reais')),
        paragrafo(texto('A integração com Google Search para dados reais mudou o fluxo do time.')),
      ),
      { ...base, regras: [regra(['Integração com Google Search para dados reais'])] },
    )
    expect(linksDe(r.arvore)).toHaveLength(1)
  })

  it('nó longo cujo texto é a âncora inteira continua linkável (não é subtítulo)', () => {
    const longa = 'guia completo de hospedagem, revenda, VPS e domínios para agências no Brasil em 2026'
    const r = aplicaLinks(raiz(paragrafo(texto(longa))), { ...base, regras: [regra([longa])] })
    expect(linksDe(r.arvore)).toHaveLength(1)
  })
})

describe('boilerplate (RF3 — CTA)', () => {
  it('não linka em nó que o chamador marcou como bloco repetido', () => {
    const r = aplicaLinks(raiz(paragrafo(texto('Vai rodar n8n numa VPS?'))), {
      ...base,
      regras: [regra(['n8n'])],
      ehBoilerplate: (t) => t.trim() === 'Vai rodar n8n numa VPS?',
    })
    expect(linksDe(r.arvore)).toEqual([])
  })

  it('e linka no parágrafo seguinte, que é prosa', () => {
    const r = aplicaLinks(
      raiz(paragrafo(texto('Vai rodar n8n numa VPS?')), paragrafo(texto('O n8n resolve automação sem código.'))),
      { ...base, regras: [regra(['n8n'])], ehBoilerplate: (t) => t.trim() === 'Vai rodar n8n numa VPS?' },
    )
    expect(linksDe(r.arvore)).toEqual([{ url: '/ofertas/hostinger-vps-n8n/', ancora: 'n8n' }])
  })
})

describe('derivaAncora — as guardas', () => {
  it('corta o sufixo de SEO no separador e mantém o assunto', () => {
    expect(derivaAncora('Coolify no Hostinger: guia completo 2026')).toBe('Coolify no Hostinger')
    expect(derivaAncora('Como migrar do Heroku — passo a passo')).toBe('Como migrar do Heroku')
  })

  it('volta pro título inteiro quando o primeiro segmento não qualifica', () => {
    expect(derivaAncora('n8n: como automatizar tudo')).toBe('n8n: como automatizar tudo')
  })

  it('devolve null quando nada qualifica', () => {
    expect(derivaAncora('IA e VPS')).toBeNull()
    expect(derivaAncora('')).toBeNull()
    expect(derivaAncora(undefined)).toBeNull()
  })

  it('tira o ano do fim, que ninguém escreve no meio de uma frase', () => {
    expect(derivaAncora('As melhores VPS baratas 2026')).toBe('As melhores VPS baratas')
  })
})
