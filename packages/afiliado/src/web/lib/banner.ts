import type { BannerDTO } from './cms'

/**
 * Dimensões de cada fonte do banner (PRD 24, achado de CLS do Lighthouse móvel).
 *
 * `Banner.astro` é `<picture>` com arte diferente por largura: a versão larga e a estreita
 * não têm a mesma proporção (a estreita costuma ser 300x250, não um recorte da larga). Se a
 * caixa reservada pelo navegador usa só a proporção da larga (o padrão do `<img>`), a home
 * pula quando troca pra estreita e a estreita carrega — o CLS de 0,188 medido em dev.
 *
 * Por isso cada fonte leva a PRÓPRIA dimensão: o `<source>` da estreita ganha `width`/`height`
 * dela, e o CSS usa essas mesmas dimensões pra reservar a caixa certa em cada breakpoint
 * (`aspect-ratio`, não só o atributo do HTML — nem todo navegador aplica a proporção do
 * `<source>` selecionado à caixa antes da imagem carregar).
 *
 * Sem `imagem_mobile`, não existe fonte estreita — a larga serve as duas larguras (já era o
 * comportamento; aqui só não inventamos uma dimensão pra uma imagem que não existe). Com
 * `imagem_mobile` mas SEM dimensão gravada (mídia antiga, sem `width`/`height` no Payload),
 * herda a proporção da larga em vez de ficar sem tamanho — o gate de budget reprova imagem
 * sem dimensão, e "sem tamanho" é pior do que "proporção aproximada".
 */
export interface DimensaoImagem {
  width: number
  height: number
}

export interface DimensoesBanner {
  larga: DimensaoImagem
  /** null quando não há `imagem_mobile` — o `<picture>` não tem `<source>` estreito. */
  estreita: DimensaoImagem | null
}

/** Fallback do banner do WordPress (970x250) — só entra quando a mídia não tem dimensão. */
const LARGA_PADRAO: DimensaoImagem = { width: 970, height: 250 }

export function dimensoesBanner(banner: Pick<BannerDTO, 'imagem' | 'imagem_mobile'>): DimensoesBanner {
  const larga: DimensaoImagem = {
    width: banner.imagem?.width ?? LARGA_PADRAO.width,
    height: banner.imagem?.height ?? LARGA_PADRAO.height,
  }

  if (!banner.imagem_mobile?.url) {
    return { larga, estreita: null }
  }

  return {
    larga,
    estreita: {
      width: banner.imagem_mobile.width ?? larga.width,
      height: banner.imagem_mobile.height ?? larga.height,
    },
  }
}
