/**
 * Contrato de saída pública, não do transporte interno do CMS. O auditor é propositalmente
 * read-only: só GETs nas três representações do artigo e no llms.txt do próprio host.
 * Respostas de erro expõem códigos, nunca o corpo (que pode conter dados privados).
 */

/** @typedef {'html' | 'markdown' | 'json' | 'llms'} Superficie */
/** @typedef {{ superficie: Superficie; codigo: string }} Falha */
/** @typedef {{ url: string; ok: boolean; falhas: Falha[] }} ResultadoAuditoria */

const LIMITE_BYTES = 2_000_000

/** @param {string} html @param {string} nome */
function atributo(html, nome) {
  const match = new RegExp(`(?:^|\\s)${nome}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(html)
  return match?.[1] ?? match?.[2] ?? null
}

/** @param {string} html @param {string} rel */
function links(html, rel) {
  return [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(m => m[0])
    .filter(tag => atributo(tag, 'rel')?.toLowerCase().split(/\s+/).includes(rel))
}

/** @param {string | null} href @param {string} base */
function urlResolvida(href, base) {
  if (!href) return null
  try { return new URL(href, base).href } catch { return null }
}

/** @param {Headers} headers @param {string} canonica */
function headerCanonico(headers, canonica) {
  const valor = headers.get('link') ?? ''
  return [...valor.matchAll(/<([^>]+)>\s*;\s*rel\s*=\s*"?canonical"?/gi)]
    .some(m => urlResolvida(m[1] ?? null, canonica) === canonica)
}

/** @param {unknown} valor @param {number} profundidade */
function contemCampoPrivado(valor, profundidade = 0) {
  if (!valor || typeof valor !== 'object' || profundidade > 32) return false
  for (const [chave, filho] of Object.entries(valor)) {
    if (/^(?:url_afiliado(?:_fonte)?|urlAffiliate|affiliateUrl|commission|comissao|api[_-]?key|token)$/i.test(chave) ||
      contemCampoPrivado(filho, profundidade + 1)) return true
  }
  return false
}

/** @param {Response} resposta @param {number} limite */
async function corpoLimitado(resposta, limite) {
  const tamanho = Number(resposta.headers.get('content-length') ?? 0)
  if (tamanho > limite) return null
  if (!resposta.body) return ''
  const leitor = resposta.body.getReader()
  const partes = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await leitor.read()
      if (done) break
      total += value.byteLength
      // Um Response clonado pode manter outro braço do stream aberto; não esperar cancel().
      if (total > limite) { void leitor.cancel(); return null }
      partes.push(value)
    }
  } finally { leitor.releaseLock() }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const parte of partes) { bytes.set(parte, offset); offset += parte.byteLength }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

/** @typedef {{ status: number; headers: Headers; corpo: string | null }} Leitura */

/**
 * @param {string} url
 * @param {typeof fetch} fetcher
 * @param {number} limite
 * @param {number} timeoutMs
 * @returns {Promise<Leitura | null>}
 */
async function ler(url, fetcher, limite, timeoutMs) {
  try {
    const resposta = await fetcher(url, { method: 'GET', redirect: 'manual', credentials: 'omit',
      signal: AbortSignal.timeout(timeoutMs), headers: { accept: '*/*' } })
    return { status: resposta.status, headers: resposta.headers, corpo: await corpoLimitado(resposta, limite) }
  } catch { return null }
}

/**
 * @param {string} entrada URL canônica de um artigo publicado (não rota comercial).
 * @param {{ fetcher?: typeof fetch; maxBytes?: number; timeoutMs?: number }} opcoes
 * @returns {Promise<ResultadoAuditoria>}
 */
export async function auditarPaginaPublica(entrada, opcoes = {}) {
  /** @type {Falha[]} */
  const falhas = []
  let alvo
  try {
    alvo = new URL(entrada)
    if (alvo.protocol !== 'https:' || alvo.username || alvo.password || alvo.search || alvo.hash ||
      !alvo.pathname.endsWith('/') ||
      /^\/(?:r|ofertas|api|admin)(?:\/|$)/.test(alvo.pathname)) throw new Error('URL inválida')
  } catch {
    return { url: '[URL_INVALIDA]', ok: false, falhas: [{ superficie: 'html', codigo: 'URL_INVALIDA' }] }
  }
  const canonica = alvo.href
  const base = canonica.slice(0, -1)
  const destinos = {
    html: canonica,
    markdown: `${base}.md`,
    json: `${base}.json`,
    llms: `${alvo.origin}/llms.txt`,
  }
  const fetcher = opcoes.fetcher ?? fetch
  const limite = opcoes.maxBytes ?? LIMITE_BYTES
  const timeout = opcoes.timeoutMs ?? 10_000
  const [html, markdown, json, llms] = await Promise.all(
    Object.values(destinos).map(url => ler(url, fetcher, limite, timeout)),
  )
  /** @param {Superficie} superficie @param {Leitura | null} leitura @param {RegExp} mime */
  const verificaBase = (superficie, leitura, mime) => {
    if (!leitura) { falhas.push({ superficie, codigo: 'FALHA_DE_LEITURA' }); return false }
    if (leitura.status !== 200) { falhas.push({ superficie, codigo: `HTTP_${leitura.status}` }); return false }
    if (leitura.corpo === null) { falhas.push({ superficie, codigo: 'CORPO_INVALIDO_OU_GRANDE' }); return false }
    if (!mime.test(leitura.headers.get('content-type') ?? '')) falhas.push({ superficie, codigo: 'MIME_INVALIDO' })
    return true
  }
  if (verificaBase('html', html, /^text\/html\b/i)) {
    const corpo = html?.corpo ?? ''
    const canonicas = links(corpo, 'canonical')
    if (canonicas.length !== 1 || urlResolvida(atributo(canonicas[0] ?? '', 'href'), canonica) !== canonica) {
      falhas.push({ superficie: 'html', codigo: 'CANONICAL_INVALIDA' })
    }
    for (const [tipo, destino, mime] of [['markdown', destinos.markdown, 'text/markdown'],
      ['json', destinos.json, 'application/json']]) {
      if (!links(corpo, 'alternate').some(tag => atributo(tag, 'type') === mime &&
        urlResolvida(atributo(tag, 'href'), canonica) === destino)) {
        falhas.push({ superficie: 'html', codigo: `ALTERNATE_${tipo.toUpperCase()}_AUSENTE` })
      }
    }
    const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(corpo)?.[1]?.replace(/<[^>]+>/g, '').trim()
    if (!/<main\b[^>]*>/i.test(corpo) || !h1) {
      falhas.push({ superficie: 'html', codigo: 'CONTEUDO_SEMANTICO_AUSENTE' })
    }
    const scriptsJsonLd = [...corpo.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter(m => atributo(m[1] ?? '', 'type')?.toLowerCase() === 'application/ld+json')
    if (scriptsJsonLd.length === 0) falhas.push({ superficie: 'html', codigo: 'JSON_LD_AUSENTE' })
    else if (scriptsJsonLd.some(m => { try { JSON.parse(m[2] ?? ''); return false } catch { return true } })) {
      falhas.push({ superficie: 'html', codigo: 'JSON_LD_INVALIDO' })
    }
    if (/noindex/i.test(html?.headers.get('x-robots-tag') ?? '') ||
      /<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(corpo)) {
      falhas.push({ superficie: 'html', codigo: 'HTML_NOINDEX' })
    }
  }
  /** @type {Array<{ superficie: Superficie; leitura: Leitura | null; mime: RegExp }>} */
  const maquinas = [
    { superficie: 'markdown', leitura: markdown, mime: /^text\/markdown\b/i },
    { superficie: 'json', leitura: json, mime: /^application\/json\b/i },
  ]
  for (const { superficie, leitura, mime } of maquinas) {
    if (!verificaBase(superficie, leitura, mime)) continue
    if (!/noindex/i.test(leitura?.headers.get('x-robots-tag') ?? '')) falhas.push({ superficie, codigo: 'NOINDEX_AUSENTE' })
    if (!headerCanonico(leitura?.headers ?? new Headers(), canonica)) falhas.push({ superficie, codigo: 'HEADER_CANONICAL_INVALIDO' })
  }
  if (markdown?.status === 200 && markdown.corpo !== null &&
    (!/^#\s+\S/m.test(markdown.corpo) || !markdown.corpo.includes(canonica))) {
    falhas.push({ superficie: 'markdown', codigo: 'TEXTO_OU_CANONICAL_AUSENTE' })
  }
  if (json?.status === 200 && json.corpo !== null) {
    try {
      const dto = JSON.parse(json.corpo)
      if (!dto || typeof dto !== 'object' || Array.isArray(dto) || dto.url !== canonica ||
        typeof dto.slug !== 'string' || !dto.slug || typeof dto.contentType !== 'string' || !dto.contentType ||
        typeof dto.title !== 'string' || !dto.title) throw new Error('DTO inválido')
      if (contemCampoPrivado(dto)) {
        falhas.push({ superficie: 'json', codigo: 'CAMPO_PRIVADO_EXPOSTO' })
      }
    } catch { falhas.push({ superficie: 'json', codigo: 'DTO_INVALIDO' }) }
  }
  if (verificaBase('llms', llms, /^text\/plain\b/i) &&
    !/^#\s+\S/m.test(llms?.corpo ?? '')) falhas.push({ superficie: 'llms', codigo: 'TITULO_AUSENTE' })
  return { url: canonica, ok: falhas.length === 0, falhas }
}
