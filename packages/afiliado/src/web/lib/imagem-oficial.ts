import type { MidiaDTO } from './cms'
import {
  normalizaURLImagemOficialAmazon,
  PROVENIENCIAS_IMAGEM_OFICIAL,
  type ImagemOficialDTO,
  type ProvenienciaImagemOficial,
} from '../../imagem-oficial'

export interface DocumentoComImagemOficial extends ImagemOficialDTO {
  imagem?: MidiaDTO | string | number | null
}

export interface ImagemRenderizavel {
  src: string
  width: number
  height: number
  alt: string
  remota: boolean
  srcset?: string
}

/**
 * A URL remota vence quando continua válida. Dado antigo ou inválido cai na mídia atual;
 * o site nunca busca a imagem no servidor, não gera derivados e não a re-hospeda.
 */
export function imagemRenderizavel(
  documento: DocumentoComImagemOficial,
  alt: string,
  urlMidia: (url?: string | null) => string | undefined,
  opcoes: { cartao?: boolean } = {},
): ImagemRenderizavel | null {
  if (
    documento.imagem_oficial_url
    && PROVENIENCIAS_IMAGEM_OFICIAL.includes(documento.imagem_oficial_proveniencia as ProvenienciaImagemOficial)
  ) {
    try {
      return {
        src: normalizaURLImagemOficialAmazon(documento.imagem_oficial_url),
        width: 640,
        height: 640,
        alt,
        remota: true,
      }
    } catch {
      // Defesa de leitura para registros anteriores/importados: usa o upload já existente.
    }
  }

  const imagem = documento.imagem && typeof documento.imagem === 'object' ? documento.imagem : null
  const derivado = opcoes.cartao ? imagem?.sizes?.cartao : undefined
  const src = urlMidia(derivado?.url ?? imagem?.url)
  if (!src) return null

  const width = derivado?.width ?? imagem?.width ?? 1280
  const height = derivado?.height ?? imagem?.height ?? (opcoes.cartao ? 720 : 1280)
  const srcset = !opcoes.cartao
    ? [
        imagem?.sizes?.cartao?.url ? `${urlMidia(imagem.sizes.cartao.url)} 640w` : null,
        imagem?.url ? `${urlMidia(imagem.url)} ${imagem.width ?? 1280}w` : null,
      ].filter(Boolean).join(', ')
    : undefined
  return { src, width, height, alt: imagem?.alt ?? alt, remota: false, ...(srcset ? { srcset } : {}) }
}
