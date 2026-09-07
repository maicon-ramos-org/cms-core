import { describe, expect, it } from 'vitest'

import {
  idDaOrganizacao,
  idDaPagina,
  idDoSite,
  montaGrafo,
  noColecao,
  noFaq,
  noImagem,
  noMigalhas,
  troncoDoSite,
  type Tenant,
} from '../src/index'

const tenant: Tenant = {
  nome: 'Runzos',
  canonical_host: 'runzos.com',
  descricao_curta: 'Cupons e ofertas com data de conferência.',
  logo: 'https://cms.runzos.com/api/midia/file/runzos-logo.svg',
}
const URL_PAGINA = 'https://runzos.com/vps-barato/'

describe('tronco — Organization → WebSite → WebPage', () => {
  it('emite os três nós que o WordPress tinha e a réplica perdeu', () => {
    const tipos = troncoDoSite({ tenant, url: URL_PAGINA, titulo: 'VPS barato' }).map((n) => n['@type'])
    expect(tipos).toEqual(['Organization', 'WebSite', 'WebPage'])
  })

  it('amarra os nós por @id, e não por cópia do objeto', () => {
    const [org, site, pagina] = troncoDoSite({ tenant, url: URL_PAGINA, titulo: 'VPS barato' })
    // é isto que faz o Google entender as três entidades como uma coisa só
    expect(site.publisher).toEqual({ '@id': idDaOrganizacao(tenant) })
    expect(pagina.isPartOf).toEqual({ '@id': idDoSite(tenant) })
    expect(pagina.about).toEqual({ '@id': idDaOrganizacao(tenant) })
    expect(org['@id']).toBe('https://runzos.com/#organization')
    expect(site['@id']).toBe('https://runzos.com/#website')
    expect(pagina['@id']).toBe(`${URL_PAGINA}#webpage`)
  })

  it('a identidade sai do TENANT, nunca de constante', () => {
    const outro: Tenant = { nome: 'Runzos 3D', canonical_host: '3d.runzos.com' }
    const [org, site] = troncoDoSite({ tenant: outro, url: 'https://3d.runzos.com/', titulo: 'x' })
    expect(org.name).toBe('Runzos 3D')
    expect(org['@id']).toBe('https://3d.runzos.com/#organization')
    expect(site['@id']).toBe('https://3d.runzos.com/#website')
  })

  it('declara a busca do site — é o que habilita sitelinks searchbox', () => {
    const [, site] = troncoDoSite({ tenant, url: URL_PAGINA, titulo: 'x' })
    expect(site.potentialAction).toMatchObject({
      '@type': 'SearchAction',
      target: { urlTemplate: 'https://runzos.com/busca/?q={search_term_string}' },
    })
  })

  it('campo ausente no tenant não vira chave vazia no JSON-LD', () => {
    const magro: Tenant = { nome: 'X', canonical_host: 'x.com' }
    const [org] = troncoDoSite({ tenant: magro, url: 'https://x.com/', titulo: 't' })
    expect('logo' in org).toBe(false)
    expect('description' in org).toBe(false)
  })
})

describe('montaGrafo', () => {
  it('embrulha no @context e devolve o grafo', () => {
    const g = montaGrafo([{ '@type': 'WebPage', '@id': 'a' }])
    expect(g['@context']).toBe('https://schema.org')
    expect(g['@graph']).toHaveLength(1)
  })

  it('descarta nó nulo — o chamador monta condicional sem ficar com buraco', () => {
    const g = montaGrafo([{ '@type': 'WebPage', '@id': 'a' }, null, undefined])
    expect(g['@graph']).toHaveLength(1)
  })

  it('deduplica por @id, e o PRIMEIRO vence', () => {
    // dois templates podem declarar a Organization; duplicar @id confunde o consumidor
    const g = montaGrafo([
      { '@type': 'Organization', '@id': 'org', name: 'certo' },
      { '@type': 'Organization', '@id': 'org', name: 'repetido' },
    ])
    expect(g['@graph']).toHaveLength(1)
    expect(g['@graph'][0]).toMatchObject({ name: 'certo' })
  })

  it('nó sem @id não é deduplicado — não há chave pra comparar', () => {
    const g = montaGrafo([{ '@type': 'ImageObject' }, { '@type': 'ImageObject' }])
    expect(g['@graph']).toHaveLength(2)
  })
})

describe('nós por tipo', () => {
  it('noFaq só existe com pergunta — FAQPage vazio é aviso no Rich Results', () => {
    expect(noFaq(URL_PAGINA, [])).toBeNull()
    const faq = noFaq(URL_PAGINA, [{ pergunta: 'Funciona?', resposta: 'Sim.' }])
    expect(faq).toMatchObject({
      '@type': 'FAQPage',
      '@id': `${URL_PAGINA}#faq`,
      mainEntity: [{ '@type': 'Question', name: 'Funciona?', acceptedAnswer: { '@type': 'Answer', text: 'Sim.' } }],
    })
  })

  it('noFaq ignora item sem resposta em vez de emitir Answer vazio', () => {
    const faq = noFaq(URL_PAGINA, [
      { pergunta: 'a', resposta: 'sim' },
      { pergunta: 'b', resposta: '' },
    ])
    expect(faq?.mainEntity).toHaveLength(1)
  })

  it('noImagem devolve null sem URL — ImageObject sem contentUrl não serve pra nada', () => {
    expect(noImagem(URL_PAGINA, undefined)).toBeNull()
    expect(noImagem(URL_PAGINA, 'https://cdn/x.avif')).toMatchObject({
      '@type': 'ImageObject',
      '@id': `${URL_PAGINA}#primaryimage`,
      contentUrl: 'https://cdn/x.avif',
    })
  })

  it('noMigalhas numera as posições a partir de 1', () => {
    const b = noMigalhas(URL_PAGINA, [
      { nome: 'Início', url: 'https://runzos.com/' },
      { nome: 'VPS', url: URL_PAGINA },
    ])
    expect(b?.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Início', item: 'https://runzos.com/' },
      { '@type': 'ListItem', position: 2, name: 'VPS', item: URL_PAGINA },
    ])
  })

  it('noMigalhas com trilha vazia é null, não um BreadcrumbList sem itens', () => {
    expect(noMigalhas(URL_PAGINA, [])).toBeNull()
  })

  it('noColecao emite CollectionPage + ItemList — o par que o hub do WP tinha', () => {
    const nos = noColecao(URL_PAGINA, 'Ofertas', [
      { nome: 'A', url: 'https://runzos.com/a/' },
      { nome: 'B', url: 'https://runzos.com/b/' },
    ])
    expect(nos.map((n) => n['@type'])).toEqual(['CollectionPage', 'ItemList'])
    expect(nos[0]?.mainEntity).toEqual({ '@id': `${URL_PAGINA}#lista` })
    expect(nos[1]?.numberOfItems).toBe(2)
  })

  it('noColecao sem itens devolve lista vazia — hub vazio não declara coleção', () => {
    expect(noColecao(URL_PAGINA, 'Ofertas', [])).toEqual([])
  })

  it('noColecao continua a numeração na página 2 — posição é do acervo, não da página', () => {
    // Sem isto, /ofertas/?pagina=2 declara o 21º item como posição 1, e o Google lê duas
    // listas concorrentes dizendo coisas diferentes sobre a mesma coleção. Os hubs faziam
    // essa conta à mão porque montavam o JSON-LD por fora do pacote.
    const nos = noColecao(URL_PAGINA, 'Ofertas', [{ nome: 'V', url: 'https://runzos.com/v/' }], { inicio: 21 })
    expect(nos[1]?.itemListElement).toEqual([
      { '@type': 'ListItem', position: 21, name: 'V', url: 'https://runzos.com/v/' },
    ])
  })

  it('noColecao aceita description no CollectionPage', () => {
    const nos = noColecao(URL_PAGINA, 'Ofertas', [{ nome: 'A', url: 'https://runzos.com/a/' }], {
      descricao: 'As ofertas conferidas',
    })
    expect(nos[0]?.description).toBe('As ofertas conferidas')
  })

  it('noColecao sem descricao NÃO emite a chave — campo vazio é ruído no grafo', () => {
    const nos = noColecao(URL_PAGINA, 'Ofertas', [{ nome: 'A', url: 'https://runzos.com/a/' }])
    expect('description' in (nos[0] ?? {})).toBe(false)
  })
})

describe('o grafo inteiro, como uma página real monta', () => {
  it('junta tronco, migalhas e FAQ sem @id repetido', () => {
    const g = montaGrafo([
      ...troncoDoSite({ tenant, url: URL_PAGINA, titulo: 'VPS barato' }),
      noMigalhas(URL_PAGINA, [{ nome: 'Início', url: 'https://runzos.com/' }]),
      noFaq(URL_PAGINA, [{ pergunta: 'p', resposta: 'r' }]),
    ])
    const ids = g['@graph'].map((n) => n['@id'])
    expect(new Set(ids).size).toBe(ids.length)
    expect(g['@graph'].map((n) => n['@type'])).toEqual([
      'Organization',
      'WebSite',
      'WebPage',
      'BreadcrumbList',
      'FAQPage',
    ])
  })

  it('serializa sem `undefined` — JSON.stringify come a chave, mas o teste guarda a intenção', () => {
    const g = montaGrafo(troncoDoSite({ tenant: { nome: 'X', canonical_host: 'x.com' }, url: 'https://x.com/', titulo: 't' }))
    expect(JSON.stringify(g)).not.toContain('undefined')
  })

  it('idDaPagina é estável para a mesma URL — o grafo não pode mudar entre renders', () => {
    expect(idDaPagina(URL_PAGINA)).toBe(idDaPagina(URL_PAGINA))
  })
})

describe('@type em array', () => {
  it('aceita o conjunto que o WordPress declarava, sem achatar pra um só', () => {
    // 126 posts do acervo declaram dois tipos; emitir um perderia o outro no Gate D
    const g = montaGrafo([{ '@type': ['BlogPosting', 'TechArticle'], '@id': 'a' }])
    expect(g['@graph'][0]?.['@type']).toEqual(['BlogPosting', 'TechArticle'])
  })

  it('deduplica por @id mesmo com @type em array', () => {
    const g = montaGrafo([
      { '@type': ['BlogPosting', 'NewsArticle'], '@id': 'x' },
      { '@type': 'BlogPosting', '@id': 'x' },
    ])
    expect(g['@graph']).toHaveLength(1)
  })
})
