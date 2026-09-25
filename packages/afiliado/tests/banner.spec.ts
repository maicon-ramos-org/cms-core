import { describe, expect, it } from 'vitest'
import { dimensoesBanner } from '../src/web/lib/banner'

describe('dimensoesBanner (PRD 24 — CLS do banner da home)', () => {
  it('larga e estreita com proporções diferentes: cada uma mantém a própria dimensão', () => {
    const banner = {
      imagem: { url: 'larga.webp', width: 970, height: 250 },
      imagem_mobile: { url: 'estreita.webp', width: 300, height: 250 },
    }
    expect(dimensoesBanner(banner)).toEqual({
      larga: { width: 970, height: 250 },
      estreita: { width: 300, height: 250 },
    })
  })

  it('sem imagem_mobile, não existe fonte estreita — a larga serve as duas larguras', () => {
    const banner = { imagem: { url: 'larga.webp', width: 970, height: 250 } }
    expect(dimensoesBanner(banner).estreita).toBeNull()
  })

  it('imagem_mobile sem width/height gravado (mídia antiga) herda a proporção da larga', () => {
    const banner = {
      imagem: { url: 'larga.webp', width: 970, height: 250 },
      imagem_mobile: { url: 'estreita.webp' },
    }
    expect(dimensoesBanner(banner).estreita).toEqual({ width: 970, height: 250 })
  })

  it('imagem larga sem width/height gravado cai no padrão do banner do WordPress (970x250)', () => {
    expect(dimensoesBanner({}).larga).toEqual({ width: 970, height: 250 })
    expect(dimensoesBanner({ imagem: { url: 'larga.webp' } }).larga).toEqual({ width: 970, height: 250 })
  })

  it('imagem_mobile sem url não conta como fonte estreita mesmo com width/height presentes', () => {
    const banner = {
      imagem: { url: 'larga.webp', width: 970, height: 250 },
      imagem_mobile: { width: 300, height: 250 },
    }
    expect(dimensoesBanner(banner).estreita).toBeNull()
  })
})
