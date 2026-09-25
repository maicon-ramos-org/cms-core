import { createHash } from 'node:crypto'

import { variavel } from './ambiente'

let avisou = false

/**
 * Contrato redirect-afiliado.md: ip_hash = sha256(ip+salt); IP puro NUNCA armazenado.
 * SEM salt configurado não há hash NENHUM: um salt público no repo tornaria o hash
 * reversível por força bruta do espaço IPv4 (pseudonimização de mentira, risco LGPD).
 */
export const ipHash = (ip: string | undefined | null): string | undefined => {
  if (!ip) return undefined
  const salt = variavel('IP_HASH_SALT')
  if (!salt) {
    if (!avisou) {
      avisou = true
      console.warn('[hash] IP_HASH_SALT ausente — cliques serão logados SEM ip_hash. Configure a env.')
    }
    return undefined
  }
  return createHash('sha256').update(`${ip}${salt}`).digest('hex').slice(0, 32)
}
