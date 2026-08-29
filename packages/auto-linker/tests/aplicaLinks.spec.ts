/**
 * Uma fixture por regra do PRD 04 (RF3-RF6, RF8) — critério de aceite do próprio PRD.
 * TDD: este arquivo existiu antes da implementação.
 */
import { describe, expect, it } from 'vitest'

import { aplicaLinks } from '../src/index'
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
