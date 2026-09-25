/**
 * PRD 24 RF2 — o que o núcleo faz com o `sharp` fora do Payload: o recorte que o Payload faz
 * num tamanho com largura e altura (`createImageSizes`, Payload 3.88), refeito para o `og`
 * sem transparência (`hooks/og-sem-transparencia.ts`, PRD 18 RF5).
 *
 * O `sharp` chega por parâmetro — o da config do Payload (`req.payload.config.sharp`) — e não
 * por `import`: este arquivo está no caminho que a entrada principal carrega, e num Worker o
 * `sharp` não existe (é binário nativo). Lá a config vem sem `sharp` e ninguém chama isto.
 */
import type { Config } from 'payload'

/** O `sharp` como a config do Payload o guarda (`config.sharp`). */
export type SharpDaConfig = NonNullable<Config['sharp']>

/** O ponto focal em porcentagem da largura e da altura (o `focalX`/`focalY` do registro). */
export interface PontoFocal {
  x: number
  y: number
}

/**
 * O recorte do Payload para tamanho com largura e altura: mesma proporção → só redimensiona;
 * senão redimensiona pelo lado que cobre o alvo e corta um retângulo do tamanho pedido
 * centrado no ponto focal, encostando na borda quando ele passaria dela.
 */
export async function recorteDoPayload(
  sharp: SharpDaConfig,
  original: Uint8Array,
  largura: number,
  altura: number,
  focal: PontoFocal,
) {
  const base = sharp(original).rotate()
  const m = await base.metadata()
  const deitada = [5, 6, 7, 8].includes(m.orientation ?? 1)
  const [w0, h0] = deitada ? [m.height!, m.width!] : [m.width!, m.height!]
  if (w0 / h0 === largura / altura) {
    return base.resize({ width: largura, height: altura, fit: 'cover', position: 'centre' })
  }

  const priorizaAltura = largura / altura < w0 / h0
  // intermediário cru (`raw`): sem recompressão entre o redimensionamento e o corte
  const { data, info } = await base
    .resize({ fastShrinkOnLoad: false, height: priorizaAltura ? altura : undefined, width: priorizaAltura ? undefined : largura })
    .raw()
    .toBuffer({ resolveWithObject: true })

  let left = info.width * (focal.x / 100) - largura / 2
  if (left + largura > info.width) left = info.width - largura
  if (left < 0) left = 0
  let top = info.height * (focal.y / 100) - altura / 2
  if (top + altura > info.height) top = info.height - altura
  if (top < 0) top = 0

  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).extract({
    left: Math.floor(left),
    top: Math.floor(top),
    width: largura,
    height: altura,
  })
}
