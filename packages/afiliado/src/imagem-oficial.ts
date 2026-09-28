import { ValidationError, type CollectionBeforeValidateHook, type Field } from 'payload'

export const PROVENIENCIAS_IMAGEM_OFICIAL = [
  'amazon-manual-revisado',
  'amazon-creators-api',
  'amazon-pa-api',
] as const

export type ProvenienciaImagemOficial = (typeof PROVENIENCIAS_IMAGEM_OFICIAL)[number]

export interface ImagemOficialDTO {
  imagem_oficial_url?: string | null
  imagem_oficial_proveniencia?: ProvenienciaImagemOficial | null
}

const EXTENSAO_IMAGEM = /\.(?:avif|gif|jpe?g|png|webp)$/i
const AUTORIDADE_COM_PORTA = /^https:\/\/[^/?#]*:\d+(?:[/?#]|$)/i

/**
 * Aceita somente o CDN oficial de imagens da Amazon usado pelo catálogo. A URL devolvida
 * nunca carrega query/fragmento; não há download, proxy, transformação ou rehost no núcleo.
 */
export function normalizaURLImagemOficialAmazon(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new Error('Informe uma URL HTTPS válida da imagem oficial da Amazon.')
  }
  if (AUTORIDADE_COM_PORTA.test(value)) throw new Error('A URL da imagem oficial não pode declarar porta.')

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Informe uma URL HTTPS válida da imagem oficial da Amazon.')
  }

  if (url.protocol !== 'https:' || url.hostname !== 'm.media-amazon.com') {
    throw new Error('A imagem oficial deve usar exatamente https://m.media-amazon.com.')
  }
  if (url.username || url.password || url.port) {
    throw new Error('A URL da imagem oficial não pode conter credenciais nem porta.')
  }
  if (!url.pathname.startsWith('/images/I/') || !EXTENSAO_IMAGEM.test(url.pathname)) {
    throw new Error('A imagem oficial deve estar em /images/I/ e terminar em uma extensão de imagem comum.')
  }

  return `https://m.media-amazon.com${url.pathname}`
}

export const camposImagemOficialAmazon: Field[] = [
  {
    name: 'imagem_oficial_url',
    type: 'text',
    admin: {
      description: 'URL remota oficial em m.media-amazon.com/images/I/. Não baixar, transformar, copiar ou re-hospedar.',
    },
  },
  {
    name: 'imagem_oficial_proveniencia',
    type: 'select',
    options: [...PROVENIENCIAS_IMAGEM_OFICIAL],
    admin: {
      description: 'Como a URL oficial foi obtida e revisada. Descoberta em concorrente não concede direito de uso.',
    },
  },
]

const efetivo = (data: Record<string, unknown> | undefined, originalDoc: Record<string, unknown> | undefined, campo: string) =>
  data && Object.prototype.hasOwnProperty.call(data, campo) ? data[campo] : originalDoc?.[campo]

/** Mantém URL e proveniência como par opt-in e grava somente a URL canônica allowlisted. */
export const validaImagemOficialAmazon: CollectionBeforeValidateHook = ({ data, originalDoc, collection }) => {
  const atual = data as Record<string, unknown> | undefined
  const anterior = originalDoc as Record<string, unknown> | undefined
  const imagem = efetivo(atual, anterior, 'imagem_oficial_url')
  const proveniencia = efetivo(atual, anterior, 'imagem_oficial_proveniencia')

  if ((imagem == null || imagem === '') && (proveniencia == null || proveniencia === '')) return data
  if (imagem == null || imagem === '') {
    throw new ValidationError({ collection: collection?.slug, errors: [{ path: 'imagem_oficial_url', message: 'URL e proveniência da imagem oficial devem ser preenchidas juntas.' }] })
  }
  if (!PROVENIENCIAS_IMAGEM_OFICIAL.includes(proveniencia as ProvenienciaImagemOficial)) {
    throw new ValidationError({ collection: collection?.slug, errors: [{ path: 'imagem_oficial_proveniencia', message: 'URL e proveniência válida da imagem oficial devem ser preenchidas juntas.' }] })
  }

  try {
    const canonica = normalizaURLImagemOficialAmazon(imagem)
    if (atual && atual.imagem_oficial_url !== canonica) atual.imagem_oficial_url = canonica
  } catch (error) {
    throw new ValidationError({ collection: collection?.slug, errors: [{ path: 'imagem_oficial_url', message: (error as Error).message }] })
  }
  return data
}
