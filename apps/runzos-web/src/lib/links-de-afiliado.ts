/**
 * Hosts que só existem para rastrear clique de afiliado, e padrões de parâmetro de
 * tracking. Link assim SEM destino mapeado não pode sair no HTML (regra dura) — vira
 * texto puro. Hoje isso acontece em 1 link de todo o acervo migrado.
 *
 * Morava no `lexical.ts`; o conversor foi para o tema editorial (PRD 17 RF3b) e isto ficou
 * aqui, porque quais redes rastreiam é conhecimento de afiliado. Vai para a entrada `web`
 * do plugin no RF3e. Quem chama `lexicalParaHtml` passa `ehLinkDeAfiliado`.
 */
const REDES_DE_AFILIADO = /^(www\.)?(anrdoezrs\.net|tkqlhce\.com|kqzyfj\.com|hostg\.xyz|m\.do\.co|links\.automacaosemlimites\.com\.br)$/i
const PARAMS_DE_TRACKING = /[?&](via|aff|aff_id|referral|partner)=|\/aff\.php|\/click-\d/i

export function ehLinkDeAfiliado(url: string): boolean {
  if (PARAMS_DE_TRACKING.test(url)) return true
  try {
    return REDES_DE_AFILIADO.test(new URL(url).host)
  } catch {
    return false
  }
}
