import { APIError, type CollectionBeforeOperationHook } from 'payload'

/**
 * SVG que executa algo não entra na mídia. O `validateSvg` do Payload 3.88 recusa `<script>`
 * simples, mas deixa passar script com prefixo de namespace (`<h:script>` com `xmlns:h`
 * apontando para o SVG), manipulador `on*=` e outros vetores — e o arquivo é servido do bucket
 * público, na origem da mídia: um SVG aberto direto no navegador roda o script (XSS armazenado).
 *
 * Recusa: `script`/`handler`/`listener` (com ou sem prefixo), `foreignObject`, `iframe`/`embed`/
 * `object`, atributo `on…=` (também via `<set attributeName="on…">`), `javascript:`, entidade
 * XML/DOCTYPE com subconjunto interno, e `href` para `data:` que não seja imagem raster.
 * SVG compactado (`.svgz`) não é inspecionável e também não entra.
 */
const PERIGOSO =
  /<\s*(?:[\w.-]+:)?(?:script|foreignObject|iframe|embed|object|handler|listener)\b|\son[a-z]+\s*=|attributeName\s*=\s*["']?\s*on|javascript\s*:|<!ENTITY|<!DOCTYPE[^>]*\[/i
const DATA_URI = /\bhref\s*=\s*["']?\s*data:(?!image\/(?:png|jpe?g|gif|webp|avif)[;,])/i

/** `true` quando o texto do SVG traz algo que executa (ver acima). */
export function svgPerigoso(texto: string): boolean {
  return PERIGOSO.test(texto) || DATA_URI.test(texto)
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
