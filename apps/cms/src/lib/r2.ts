/**
 * PRD 18 RF1/RF2 — a configuração do bucket da instância e o endereço público de cada
 * arquivo. As variáveis moram só no `.env` da VPS (docs/runbooks/r2-por-instancia.md); em
 * desenvolvimento e no CI apontam para um MinIO, com `R2_ENDPOINT`.
 */

export const VARIAVEIS_R2 = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE'] as const

export interface ConfigR2 {
  bucket: string
  endpoint: string
  credentials: { accessKeyId: string; secretAccessKey: string }
  /** a origem pública das imagens, sem barra no fim (`https://media.runzos.com`) */
  publicBase: string
}

/** Endpoint S3 do R2 da conta, ou o de um MinIO local quando `R2_ENDPOINT` vem preenchido. */
export const endpointR2 = (env: Record<string, string | undefined>): string =>
  env.R2_ENDPOINT?.trim() || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

/**
 * Lê e confere as variáveis. Falta uma: ERRO, com o nome de cada uma que falta — o CMS não
 * sobe (RF1). Degradar para o disco em silêncio esconderia um acervo partido entre disco e
 * bucket, e ninguém descobriria até faltar imagem.
 */
export function configR2(env: Record<string, string | undefined>): ConfigR2 {
  const faltando = VARIAVEIS_R2.filter((v) => !env[v]?.trim())
  if (faltando.length) throw new Error(`faltam variáveis do bucket: ${faltando.join(', ')}`)

  const publicBase = env.R2_PUBLIC_BASE!.trim().replace(/\/+$/, '')
  let origem: URL
  try {
    origem = new URL(publicBase)
  } catch {
    throw new Error(`R2_PUBLIC_BASE não é uma URL absoluta: ${publicBase}`)
  }
  // http só no desenvolvimento (MinIO); em produção a imagem sai numa página https
  if (origem.protocol !== 'https:' && !env.R2_ENDPOINT?.trim()) {
    throw new Error(`R2_PUBLIC_BASE precisa ser https: ${publicBase}`)
  }

  return {
    bucket: env.R2_BUCKET!.trim(),
    endpoint: endpointR2(env),
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!.trim(), secretAccessKey: env.R2_SECRET_ACCESS_KEY!.trim() },
    publicBase,
  }
}

/**
 * O endereço público do arquivo (RF2): a base + a chave, que é o mesmo nome de arquivo do
 * disco que a cópia do RF3 usou. Codificado como o navegador pede — nome com espaço ou
 * acento é chave válida no bucket e URL inválida sem codificação.
 */
export const urlPublica = (publicBase: string, filename: string, prefix?: string | null): string =>
  `${publicBase}/${[prefix, filename].filter(Boolean).map((s) => encodeURIComponent(s!)).join('/')}`
