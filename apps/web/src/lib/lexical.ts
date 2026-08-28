/**
 * Lexical → HTML no SERVIDOR. O crawler de IA não executa JS, então o corpo precisa
 * sair pronto no HTML inicial (regra dura do projeto) — nada de renderizar richText no
 * cliente. Cobre os nós que o import do WP realmente produz: parágrafo, heading, lista,
 * tabela, link, imagem (upload), citação, separador e as marcas de formatação.
 *
 * Não usamos o conversor oficial do Payload aqui de propósito: ele viria com o pacote
 * inteiro do editor (React + lexical) pra dentro do site, que é só leitura.
 */

interface No {
  type?: string
  tag?: string | number
  format?: string | number
  text?: string
  children?: No[]
  fields?: { url?: string; newTab?: boolean }
  listType?: string
  value?: { url?: string; alt?: string; width?: number; height?: number } | number | string
  relationTo?: string
  headerState?: number
  root?: No
}

/** Bitmask de formatação do Lexical. */
const NEGRITO = 1
const ITALICO = 1 << 1
const TACHADO = 1 << 2
const SUBLINHADO = 1 << 3
const CODIGO = 1 << 4

const escapa = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const marcaTexto = (no: No): string => {
  let html = escapa(no.text ?? '')
  const f = typeof no.format === 'number' ? no.format : 0
  if (f & CODIGO) html = `<code>${html}</code>`
  if (f & NEGRITO) html = `<strong>${html}</strong>`
  if (f & ITALICO) html = `<em>${html}</em>`
  if (f & TACHADO) html = `<s>${html}</s>`
  if (f & SUBLINHADO) html = `<u>${html}</u>`
  return html
}

const filhos = (no: No): string => (no.children ?? []).map(renderaNo).join('')

/** Só http(s) vira link: nada de javascript: vindo de conteúdo migrado. */
const hrefSeguro = (url: string | undefined): string | null =>
  url && /^(https?:\/\/|\/|mailto:|tel:)/i.test(url) ? escapa(url) : null

/**
 * Troca link de afiliado por `/r/{id}` DENTRO do corpo migrado. O conteúdo do WP tem
 * link cru no meio do texto, e link de afiliado cru no HTML é proibido pelo projeto.
 */
let reescreveAfiliado: ((url: string) => string | null) | null = null

function renderaNo(no: No): string {
  if (!no || typeof no !== 'object') return ''
  switch (no.type) {
    case 'text':
      return marcaTexto(no)
    case 'linebreak':
      return '<br />'
    case 'paragraph': {
      const conteudo = filhos(no)
      return conteudo.trim() ? `<p>${conteudo}</p>` : ''
    }
    case 'heading': {
      // h1 é da página, não do corpo: rebaixa um nível pra não competir no SEO
      const nivel = Math.min(6, Math.max(2, Number(String(no.tag ?? 'h2').replace('h', '')) + 1))
      return `<h${nivel}>${filhos(no)}</h${nivel}>`
    }
    case 'quote':
      return `<blockquote>${filhos(no)}</blockquote>`
    case 'horizontalrule':
      return '<hr />'
    case 'list': {
      const tag = no.listType === 'number' ? 'ol' : 'ul'
      return `<${tag}>${filhos(no)}</${tag}>`
    }
    case 'listitem':
      return `<li>${filhos(no)}</li>`
    case 'table':
      return `<div class="tabela-rolavel"><table>${filhos(no)}</table></div>`
    case 'tablerow':
      return `<tr>${filhos(no)}</tr>`
    case 'tablecell': {
      const tag = (no.headerState ?? 0) > 0 ? 'th' : 'td'
      return `<${tag}>${filhos(no)}</${tag}>`
    }
    case 'link':
    case 'autolink': {
      const cru = no.fields?.url
      const trocado = cru && reescreveAfiliado ? reescreveAfiliado(cru) : null
      const href = hrefSeguro(trocado ?? cru)
      if (!href) return filhos(no)
      if (trocado) return `<a href="${href}" rel="sponsored nofollow">${filhos(no)}</a>`
      // link de conteúdo migrado aponta pra fora: nofollow por padrão
      const alvo = no.fields?.newTab ? ' target="_blank"' : ''
      return `<a href="${href}" rel="nofollow noopener"${alvo}>${filhos(no)}</a>`
    }
    case 'upload': {
      const midia = typeof no.value === 'object' && no.value ? no.value : null
      if (!midia?.url) return ''
      const dim = midia.width && midia.height ? ` width="${midia.width}" height="${midia.height}"` : ''
      return `<img src="${escapa(midia.url)}" alt="${escapa(midia.alt ?? '')}"${dim} loading="lazy" decoding="async" />`
    }
    default:
      return filhos(no)
  }
}

export function lexicalParaHtml(
  corpo: unknown,
  opcoes: { reescreveAfiliado?: (url: string) => string | null } = {},
): string {
  const raiz = (corpo as { root?: No } | null)?.root
  if (!raiz) return ''
  reescreveAfiliado = opcoes.reescreveAfiliado ?? null
  try {
    return filhos(raiz)
  } finally {
    reescreveAfiliado = null
  }
}

/** Versão texto pura — alimenta a meta description e o `.md` paralelo. */
export function lexicalParaTexto(corpo: unknown, limite = 0): string {
  const raiz = (corpo as { root?: No } | null)?.root
  if (!raiz) return ''
  const junta = (no: No): string =>
    (no.text ?? '') + (no.children ?? []).map(junta).join(no.type === 'paragraph' ? '' : ' ')
  const texto = junta(raiz).replace(/\s+/g, ' ').trim()
  return limite > 0 && texto.length > limite ? `${texto.slice(0, limite - 1).trimEnd()}…` : texto
}
