/** Descoberta pública: renderização pura, sem Payload nem acesso ao banco. */
export interface RecursoArd {
  id: string
  nome: string
  tipo: string
  caminho: string
  descricao: string
  consultas: [string, string, ...string[]]
}

export interface SiteDaDescoberta {
  nome: string
  canonicalHost: string
}

export interface IndiceLlms {
  titulo: string
  caminho: string
  descricao?: string
}

function baseDoSite(host: string): string {
  if (!/^[a-z0-9.-]+$/i.test(host) || host.startsWith('.') || host.endsWith('.')) {
    throw new Error('Host canônico inválido para descoberta pública')
  }
  return `https://${host.toLowerCase()}`
}

function urlPublica(base: string, caminho: string): string {
  if (!/^\/(?!\/)/.test(caminho) || /[?#]/.test(caminho)) {
    throw new Error('Recurso de descoberta precisa de caminho público local')
  }
  return `${base}${caminho}`
}

/** ARD 1.0 com `llms.txt` padrão e recursos extras próprios do site. */
export function catalogoArdPublico(site: SiteDaDescoberta, recursos: RecursoArd[] = []) {
  const base = baseDoSite(site.canonicalHost)
  const todos: RecursoArd[] = [{
    id: 'llms', nome: `${site.nome} — guia para agentes`, tipo: 'text/plain',
    caminho: '/llms.txt', descricao: 'Índice público de leitura e descoberta do site.',
    consultas: ['Que conteúdos públicos este site oferece?', 'Como ler este site como agente?'],
  }, ...recursos]
  if (new Set(todos.map((recurso) => recurso.id)).size !== todos.length) {
    throw new Error('Recursos ARD duplicados')
  }
  return {
    specVersion: '1.0',
    host: {
      displayName: site.nome,
      identifier: site.canonicalHost.toLowerCase(),
      documentationUrl: `${base}/llms.txt`,
    },
    entries: todos.map((recurso) => {
      if (!/^[a-z0-9-]+$/.test(recurso.id)) throw new Error('ID de recurso ARD inválido')
      return {
        identifier: `urn:air:${site.canonicalHost.toLowerCase()}:resource:${recurso.id}`,
        displayName: recurso.nome,
        type: recurso.tipo,
        url: urlPublica(base, recurso.caminho),
        description: recurso.descricao,
        representativeQueries: recurso.consultas,
      }
    }),
  }
}

/** Mapa estável por site; a lista viva de artigos fica no sitemap/índice. */
export function textoLlmsPublico(site: SiteDaDescoberta, opcoes: {
  intro?: string[]
  comoLer?: string[]
  indices?: IndiceLlms[]
} = {}): string {
  const base = baseDoSite(site.canonicalHost)
  const linhas = [
    `# ${site.nome}`, '',
    ...(opcoes.intro?.length ? [...opcoes.intro.map((linha) => `> ${linha}`), ''] : []),
    '## Como ler este site', '',
    ...(opcoes.comoLer ?? [
      'As páginas públicas já trazem o conteúdo em HTML, sem exigir JavaScript.',
      'Artigos publicados oferecem representação em Markdown e JSON.',
    ]).map((linha) => `- ${linha}`),
    '', '## Índices', '',
    ...(opcoes.indices ?? []).map((indice) =>
      `- [${indice.titulo}](${urlPublica(base, indice.caminho)})${indice.descricao ? ` — ${indice.descricao}` : ''}`),
    '',
  ]
  return linhas.join('\n')
}
