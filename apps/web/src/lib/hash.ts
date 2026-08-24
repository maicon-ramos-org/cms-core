import { createHash } from 'node:crypto'

/** Contrato redirect-afiliado.md: ip_hash = sha256(ip+salt); IP puro NUNCA armazenado. */
export const ipHash = (ip: string | undefined | null): string | undefined => {
  if (!ip) return undefined
  const salt = process.env.IP_HASH_SALT ?? 'dev-salt-trocar-em-prod'
  return createHash('sha256').update(`${ip}${salt}`).digest('hex').slice(0, 32)
}
