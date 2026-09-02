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

/** Texto puro de um nó — usado pro id do título e pro sumário. */
const textoDe = (no: No): string =>
  no.type === 'text' ? (no.text ?? '') : (no.children ?? []).map(textoDe).join('')

/*
 * Slug do título. Sem acento (NFD + corte dos diacríticos) porque id com acento vira
 * percent-encoding no href e fica ilegível na barra do navegador.
 */
const slugDeTitulo = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'secao'

/** Dois títulos iguais no mesmo post existem ("Onde ganha"); o segundo vira `-2`. */
let idsUsados: Map<string, number> | null = null
const idUnico = (texto: string): string => {
  const base = slugDeTitulo(texto)
  if (!idsUsados) return base
  const n = (idsUsados.get(base) ?? 0) + 1
  idsUsados.set(base, n)
  return n === 1 ? base : `${base}-${n}`
}

/** Só http(s) vira link: nada de javascript: vindo de conteúdo migrado. */
const hrefSeguro = (url: string | undefined): string | null =>
  url && /^(https?:\/\/|\/|mailto:|tel:)/i.test(url) ? escapa(url) : null

/**
 * Troca link de afiliado por `/r/{id}` DENTRO do corpo migrado. O conteúdo do WP tem
 * link cru no meio do texto, e link de afiliado cru no HTML é proibido pelo projeto.
 */
let reescreveAfiliado: ((url: string) => string | null) | null = null
let resolveMidia: ((url: string) => string | undefined) | null = null

/**
 * Hosts que só existem para rastrear clique de afiliado, e padrões de parâmetro de
 * tracking. Link assim SEM destino mapeado não pode sair no HTML (regra dura) — vira
 * texto puro. Hoje isso acontece em 1 link de todo o acervo migrado.
 */
const REDES_DE_AFILIADO = /^(www\.)?(anrdoezrs\.net|tkqlhce\.com|kqzyfj\.com|hostg\.xyz|m\.do\.co|links\.automacaosemlimites\.com\.br)$/i
const PARAMS_DE_TRACKING = /[?&](via|aff|aff_id|referral|partner)=|\/aff\.php|\/click-\d/i

/**
 * O WP escreveu link interno em ABSOLUTO (`https://runzos.com/outro-post`). Em staging
 * isso mandaria o leitor de volta pro site velho e estragaria o diff de paridade —
 * então link pro próprio host vira caminho relativo.
 */
let hostDoTenant: string | null = null

function relativizaInterno(url: string): string {
  if (!hostDoTenant || !/^https?:\/\//i.test(url)) return url
  try {
    const u = new URL(url)
    return u.host === hostDoTenant ? `${u.pathname}${u.search}${u.hash}` : url
  } catch {
    return url
  }
}

function ehLinkDeAfiliado(url: string): boolean {
  if (PARAMS_DE_TRACKING.test(url)) return true
  try {
    return REDES_DE_AFILIADO.test(new URL(url).host)
  } catch {
    return false
  }
}

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
      /*
       * `id` em todo título do corpo: é o que permite índice, link direto pra seção e
       * citação de trecho por agente de IA. Sem ele, um artigo de 12 minutos só pode ser
       * referenciado inteiro.
       */
      const id = idUnico(textoDe(no))
      return `<h${nivel} id="${id}">${filhos(no)}</h${nivel}>`
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
      // sem destino mapeado, link de afiliado sai do HTML (nunca cru) e sobra o texto
      if (!trocado && cru && ehLinkDeAfiliado(cru)) return filhos(no)
      const href = hrefSeguro(trocado ?? (cru ? relativizaInterno(cru) : cru))
      if (!href) return filhos(no)
      if (trocado) return `<a href="${href}" rel="sponsored nofollow">${filhos(no)}</a>`
      // link de conteúdo migrado aponta pra fora: nofollow por padrão
      const alvo = no.fields?.newTab ? ' target="_blank"' : ''
      return `<a href="${href}" rel="nofollow noopener"${alvo}>${filhos(no)}</a>`
    }
    case 'upload': {
      const midia = typeof no.value === 'object' && no.value ? no.value : null
      // o Payload devolve caminho relativo ao CMS; sem resolver, a imagem 404 no site
      const src = midia?.url ? (resolveMidia ? resolveMidia(midia.url) : midia.url) : null
      if (!src) return ''
      const dim = midia?.width && midia?.height ? ` width="${midia.width}" height="${midia.height}"` : ''
      return `<img src="${escapa(src)}" alt="${escapa(midia?.alt ?? '')}"${dim} loading="lazy" decoding="async" />`
    }
    default:
      return filhos(no)
  }
}

export function lexicalParaHtml(
  corpo: unknown,
  opcoes: {
    reescreveAfiliado?: (url: string) => string | null
    resolveMidia?: (url: string) => string | undefined
    hostDoTenant?: string
  } = {},
): string {
  const raiz = (corpo as { root?: No } | null)?.root
  if (!raiz) return ''
  reescreveAfiliado = opcoes.reescreveAfiliado ?? null
  resolveMidia = opcoes.resolveMidia ?? null
  hostDoTenant = opcoes.hostDoTenant ?? null
  idsUsados = new Map()
  try {
    return filhos(raiz)
  } finally {
    reescreveAfiliado = null
    resolveMidia = null
    hostDoTenant = null
    idsUsados = null
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

export interface ItemSumario {
  id: string
  texto: string
  nivel: number
}

/**
 * Sumário a partir do HTML que ESTA função gerou — por isso o regex basta: a entrada não é
 * HTML arbitrário da internet, é a saída de `lexicalParaHtml` logo acima.
 *
 * Só h2 e h3: h4 pra baixo transformaria o índice numa segunda cópia do artigo.
 */
export function extraiSumario(html: string): ItemSumario[] {
  const itens: ItemSumario[] = []
  for (const m of html.matchAll(/<h([23]) id="([^"]+)">(.*?)<\/h[23]>/gs)) {
    const texto = m[3]!.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim()
    if (texto) itens.push({ id: m[2]!, texto, nivel: Number(m[1]) })
  }
  return itens
}
