import { readFile } from 'node:fs/promises'

import type { CollectionBeforeChangeHook } from 'payload'
import sharp from 'sharp'

/**
 * PRD 18 RF5 — o `og` de imagem com transparência sai com fundo BRANCO, não preto.
 *
 * O `og` é JPEG (rede social não lê AVIF), e JPEG não tem transparência: o sharp achata o
 * canal alfa contra o preto. Medido nos 930 alvos do RF5 em 2026-09-23: 15 capas têm pixel
 * transparente de verdade — uma com 78% da área, outras com 35%, 22% e 17% —, que no
 * cartão do WhatsApp/LinkedIn/X virariam um bloco preto. O branco é o fundo das páginas
 * onde essas imagens já aparecem.
 *
 * O Payload não tem opção de fundo por tamanho, então este hook refaz SÓ o `og`, e só da
 * imagem que tem pixel transparente, com o MESMO recorte que o Payload fez (redimensiona
 * pelo lado que cobre e corta em volta do ponto focal — `createImageSizes`, Payload 3.88).
 * Roda depois de o Payload gerar os derivados e antes de o `storage-s3` enviá-los: troca o
 * buffer em `req.payloadUploadSizes`, que é o que o plugin sobe.
 */
const TAMANHO = 'og'
const FUNDO = '#ffffff'

export const ogSemTransparencia: CollectionBeforeChangeHook = async ({ collection, data, req }) => {
  const gerado = req.payloadUploadSizes?.[TAMANHO]
  const og = (data?.sizes as Record<string, { filename?: string | null } | undefined> | undefined)?.[TAMANHO]
  const arquivo = req.file
  if (!gerado || !og?.filename || !arquivo) return data

  const config = typeof collection.upload === 'object' ? collection.upload.imageSizes?.find((s) => s.name === TAMANHO) : undefined
  if (!config?.width || !config.height) return data

  const original = arquivo.tempFilePath ? await readFile(arquivo.tempFilePath) : arquivo.data
  // `hasAlpha` sozinho não basta: PNG com canal alfa e nenhum pixel transparente é comum
  // (3 das 10 capas PNG do acervo), e refazer esses seria trabalho à toa
  if ((await sharp(original).stats()).isOpaque) return data

  const focal = { x: Number(data.focalX ?? 50), y: Number(data.focalY ?? 50) }
  const opcoes = (config.formatOptions?.options ?? {}) as sharp.JpegOptions
  const buf = await (await recorteDoPayload(original, config.width, config.height, focal))
    .flatten({ background: FUNDO })
    .jpeg(opcoes)
    .toBuffer()

  req.payloadUploadSizes![TAMANHO] = buf
  ;(data.sizes as Record<string, object>)[TAMANHO] = { ...og, filesize: buf.length }
  return data
}

/**
 * O recorte do Payload para tamanho com largura e altura: mesma proporção → só redimensiona;
 * senão redimensiona pelo lado que cobre o alvo e corta um retângulo do tamanho pedido
 * centrado no ponto focal, encostando na borda quando ele passaria dela.
 */
async function recorteDoPayload(original: Buffer, largura: number, altura: number, focal: { x: number; y: number }) {
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
