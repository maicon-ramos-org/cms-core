import { APIError, type CollectionBeforeOperationHook } from 'payload'

/**
 * SVG que executa algo não entra na mídia. O `validateSvg` do Payload 3.88 recusa `<script>`
 * simples, mas deixa passar script com prefixo de namespace (`<h:script>` com `xmlns:h`
 * apontando para o SVG), manipulador `on*=` e outros vetores — e o arquivo é servido do bucket
 * público, na origem da mídia: um SVG aberto direto no navegador roda o script (XSS armazenado).
 *
 * Recusa: `script`/`handler`/`listener` (com ou sem prefixo), `foreignObject`, `iframe`/`embed`/
 * `object`, atributo `on…=` (também via `<set attributeName="on…">`), animação de `href`
 * (`<animate|set attributeName="href">`), `javascript:`, entidade XML/DOCTYPE com subconjunto
 * interno, instrução `<?xml-stylesheet` e namespace XSLT (a transformação XSLT roda script sem
 * clique), e `href` para `data:` que não seja imagem raster. SVG compactado (`.svgz`) e texto
 * com byte nulo (UTF-16/32, que o regex não leria) não são inspecionáveis e também não entram.
 *
 * O teste é feito sobre o texto com as referências de caractere já DECODIFICADAS (`&#106;`,
 * `&#x6A;`, `&colon;`…) e sem TAB/LF/CR: o parser XML decodifica `&#106;avascript:` no valor do
 * atributo antes de o navegador usá-lo, e o parser de URL ignora TAB/LF/CR no meio do esquema.
 * Decodificar pode recusar um SVG inofensivo que mostra `&lt;script&gt;` como texto — preço
 * aceito: na dúvida, o arquivo não entra.
 */
const PERIGOSO =
  /<\s*(?:[\w.-]+:)?(?:script|foreignObject|iframe|embed|object|handler|listener)\b|\son[a-z]+\s*=|attributeName\s*=\s*["']?\s*(?:on|(?:[\w.-]+:)?href\b)|javascript\s*:|<!ENTITY|<!DOCTYPE[^>]*\[|<\?\s*xml-stylesheet|XSL\/Transform/i
const DATA_URI = /\bhref\s*=\s*["']?\s*data:(?!image\/(?:png|jpe?g|gif|webp|avif)[;,])/i

/** As 5 entidades do XML e as nomeadas do HTML que servem para esconder um esquema de URL. */
const NOMEADAS: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', tab: '\t', newline: '\n', sol: '/', lpar: '(', rpar: ')',
}

const caractere = (codigo: number): string =>
  Number.isInteger(codigo) && codigo >= 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : ''

/**
 * Decodifica referências numéricas (`&#106;`, `&#x6A;`, com ou sem `;`, com zeros à esquerda) e
 * as nomeadas de `NOMEADAS`, numa passada só (`&amp;#106;` vira o texto `&#106;`, como no XML).
 */
export function decodificaReferencias(texto: string): string {
  return texto.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));?/gi, (inteiro, hexa?: string, decimal?: string, nome?: string) => {
    if (hexa !== undefined) return caractere(Number.parseInt(hexa, 16))
    if (decimal !== undefined) return caractere(Number.parseInt(decimal, 10))
    return NOMEADAS[nome!.toLowerCase()] ?? inteiro
  })
}

/** `true` quando o texto do SVG traz algo que executa (ver acima). */
export function svgPerigoso(texto: string): boolean {
  if (texto.includes('\0')) return true
  const decodificado = decodificaReferencias(texto)
  // o parser de URL tira TAB/LF/CR do meio do esquema (`java&#9;script:`): testa também sem eles
  const semQuebra = decodificado.replace(/[\t\n\r]/g, '')
  return [texto, decodificado, semQuebra].some((t) => PERIGOSO.test(t) || DATA_URI.test(t))
}

const ehSvg = (arquivo: { mimetype?: string; name?: string }): boolean =>
  /svg/i.test(arquivo.mimetype ?? '') || /\.svgz?$/i.test(arquivo.name ?? '')

/** `beforeOperation` de coleção de upload: recusa (400) o SVG perigoso antes de qualquer gravação. */
export const recusaSvgPerigoso: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if (operation !== 'create' && operation !== 'update') return args
  const arquivo = req.file as { data?: Uint8Array; mimetype?: string; name?: string } | undefined
  if (!arquivo || !ehSvg(arquivo)) return args
  if (/\.svgz$/i.test(arquivo.name ?? '') || !arquivo.data) {
    throw new APIError('SVG compactado (svgz) não é aceito na mídia.', 400, undefined, true)
  }
  if (svgPerigoso(new TextDecoder().decode(arquivo.data))) {
    throw new APIError('SVG com script, manipulador de evento ou conteúdo externo não é aceito na mídia.', 400, undefined, true)
  }
  return args
}
