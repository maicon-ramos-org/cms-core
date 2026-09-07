/**
 * O grafo de JSON-LD do site — PRD 02 RF6.
 *
 * POR QUE UM PACKAGE, E NÃO JSON-LD em cada template: até 2026-09-06 cada rota montava o
 * próprio bloco à mão, e o diff de paridade mostrou o preço disso — em 220 URLs a réplica
 * perdia `WebSite` (149), `Organization` (124), `WebPage` (66) e `FAQPage` (60) contra o
 * WordPress. Não por decisão: porque a oferta lembrava de emitir Organization e o post não.
 * Regra que vive em oito arquivos é regra que diverge em oito arquivos.
 *
 * O PADRÃO É GRAFO, NÃO LISTA DE BLOCOS. `Organization → WebSite → WebPage` amarrados por
 * `@id`, e o nó da página (Article, Product, FAQPage…) pendurado nesse tronco. É o que faz
 * o buscador entender as entidades como UMA coisa em vez de fragmentos soltos.
 *
 * Package puro: sem Astro, sem fetch, sem data de hoje. O que entra é dado do tenant e da
 * página; o que sai é objeto serializável. É o que torna testável sem levantar nada.
 */

/** O que o grafo precisa saber do tenant. Identidade sai DAQUI — nunca de constante. */
export interface Tenant {
  nome: string
  canonical_host: string
  descricao_curta?: string | null
  logo?: string | null
}

export interface No {
  /**
   * Array é JSON-LD válido e o acervo usa: o WordPress declara dois tipos em 126 posts
   * (`BlogPosting` + `TechArticle`, por exemplo). Emitir só um perderia o outro, que é
   * justamente a divergência que o Gate D cobra.
   */
  '@type': string | string[]
  '@id'?: string
  [chave: string]: unknown
}

export interface Grafo {
  '@context': string
  '@graph': No[]
}

const base = (t: Tenant): string => `https://${t.canonical_host}`

/** Âncoras do grafo. Existem como função porque são referenciadas de fora do tronco. */
export const idDaOrganizacao = (t: Tenant): string => `${base(t)}/#organization`
export const idDoSite = (t: Tenant): string => `${base(t)}/#website`
export const idDaPagina = (url: string): string => `${url}#webpage`

/** Só entra no objeto o que tem valor: chave com string vazia polui o grafo e não ajuda. */
const seTiver = <T>(valor: T | null | undefined, chave: string): Record<string, T> =>
  valor === null || valor === undefined || valor === '' ? {} : ({ [chave]: valor } as Record<string, T>)

export interface Pagina {
  tenant: Tenant
  /** URL canônica ABSOLUTA da página — é a chave do `@id` e precisa ser a mesma do canonical */
  url: string
  titulo: string
  descricao?: string | null
  /** URL da imagem principal; vira `primaryImageOfPage` quando existe */
  imagem?: string | null
  idioma?: string
}

/**
 * Os três nós que toda página tem, na ordem em que o consumidor espera lê-los.
 *
 * `WebSite.potentialAction` declara a busca do site: é o que habilita a caixa de busca em
 * sitelinks. O alvo é `/busca/?q=` porque é a rota que o site serve sem JS — anunciar uma
 * busca que só funciona com script seria anunciar o que não temos.
 *
 * Devolve TUPLA, não array: são sempre exatamente três nós, e dizer isso no tipo evita que
 * o chamador precise tratar um `undefined` que não existe.
 */
export function troncoDoSite(p: Pagina): [No, No, No] {
  const { tenant, url, titulo } = p
  const raiz = base(tenant)
  return [
    {
      '@type': 'Organization',
      '@id': idDaOrganizacao(tenant),
      name: tenant.nome,
      url: `${raiz}/`,
      ...seTiver(tenant.descricao_curta, 'description'),
      ...seTiver(tenant.logo ? { '@type': 'ImageObject', url: tenant.logo } : null, 'logo'),
    },
    {
      '@type': 'WebSite',
      '@id': idDoSite(tenant),
      name: tenant.nome,
      url: `${raiz}/`,
      publisher: { '@id': idDaOrganizacao(tenant) },
      inLanguage: p.idioma ?? 'pt-BR',
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${raiz}/busca/?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'WebPage',
      '@id': idDaPagina(url),
      url,
      name: titulo,
      ...seTiver(p.descricao, 'description'),
      isPartOf: { '@id': idDoSite(tenant) },
      about: { '@id': idDaOrganizacao(tenant) },
      inLanguage: p.idioma ?? 'pt-BR',
      ...seTiver(p.imagem ? { '@id': `${url}#primaryimage` } : null, 'primaryImageOfPage'),
    },
  ]
}

/** `ImageObject` próprio: é o que dá ao buscador o metadado da imagem, não só a URL. */
export function noImagem(url: string, imagem?: string | null): No | null {
  if (!imagem) return null
  return { '@type': 'ImageObject', '@id': `${url}#primaryimage`, url: imagem, contentUrl: imagem }
}

export interface ItemMigalha {
  nome: string
  url: string
}

export function noMigalhas(url: string, trilha: ItemMigalha[]): No | null {
  if (trilha.length === 0) return null
  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: trilha.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.nome,
      item: item.url,
    })),
  }
}

export interface ItemFaq {
  pergunta: string
  resposta: string
}

/**
 * FAQPage é o rich result que a migração mais tinha a perder: 60 páginas do acervo o
 * declaram. Item sem resposta fica de fora — `Answer` com texto vazio é aviso no Rich
 * Results Test e não vira resultado nenhum.
 */
export function noFaq(url: string, itens: ItemFaq[]): No | null {
  const validos = itens.filter((i) => i.pergunta?.trim() && i.resposta?.trim())
  if (validos.length === 0) return null
  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: validos.map((i) => ({
      '@type': 'Question',
      name: i.pergunta,
      acceptedAnswer: { '@type': 'Answer', text: i.resposta },
    })),
  }
}

export interface ItemLista {
  nome: string
  url: string
}

/**
 * O par `CollectionPage` + `ItemList` que os hubs do WordPress declaravam — e que a réplica
 * perdia em 26 páginas de empresa. Separados por `@id` em vez de aninhados: assim o
 * `WebPage` do tronco continua sendo o nó da página, e a coleção é uma entidade à parte.
 */
export function noColecao(url: string, nome: string, itens: ItemLista[]): No[] {
  if (itens.length === 0) return []
  return [
    {
      '@type': 'CollectionPage',
      '@id': `${url}#colecao`,
      name: nome,
      url,
      mainEntity: { '@id': `${url}#lista` },
    },
    {
      '@type': 'ItemList',
      '@id': `${url}#lista`,
      numberOfItems: itens.length,
      itemListElement: itens.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.nome,
        url: item.url,
      })),
    },
  ]
}

/**
 * Fecha o grafo. Aceita `null` no meio da lista porque é assim que o template monta —
 * `noFaq(...)` devolve null quando não há FAQ, e obrigar o chamador a filtrar seria
 * empurrar pra oito arquivos uma regra que cabe aqui.
 *
 * Deduplica por `@id` com o PRIMEIRO vencendo: o tronco entra antes e é quem manda. Dois
 * nós com o mesmo `@id` e conteúdos diferentes é a forma mais fácil de confundir quem lê.
 */
export function montaGrafo(nos: Array<No | null | undefined>): Grafo {
  const vistos = new Set<string>()
  const grafo: No[] = []
  for (const no of nos) {
    if (!no) continue
    const id = no['@id']
    if (typeof id === 'string') {
      if (vistos.has(id)) continue
      vistos.add(id)
    }
    grafo.push(no)
  }
  return { '@context': 'https://schema.org', '@graph': grafo }
}
