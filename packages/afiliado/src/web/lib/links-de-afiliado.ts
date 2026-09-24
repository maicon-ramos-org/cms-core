/**
 * Hosts que só existem para rastrear clique de afiliado, e padrões de parâmetro de
 * tracking. Link assim SEM destino mapeado não pode sair no HTML (regra dura) — vira
 * texto puro. Hoje isso acontece em 1 link de todo o acervo migrado.
 *
 * As redes conhecidas moram aqui; o site acrescenta os encurtadores próprios dele em
 * `afiliado({ config: { redesDeRastreio } })`.
 */
/// <reference path="../virtual.d.ts" />
import config from 'virtual:afiliado/config'

const REDES_CONHECIDAS = ['anrdoezrs.net', 'tkqlhce.com', 'kqzyfj.com', 'hostg.xyz', 'm.do.co']

const escapa = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const REDES_DE_AFILIADO = new RegExp(
  `^(www\\.)?(${[...REDES_CONHECIDAS, ...(config.redesDeRastreio ?? [])].map(escapa).join('|')})$`,
  'i',
)
const PARAMS_DE_TRACKING = /[?&](via|aff|aff_id|referral|partner)=|\/aff\.php|\/click-\d/i

export function ehLinkDeAfiliado(url: string): boolean {
  if (PARAMS_DE_TRACKING.test(url)) return true
  try {
    return REDES_DE_AFILIADO.test(new URL(url).host)
  } catch {
    return false
  }
}
