import type { CollectionBeforeChangeHook } from 'payload'
import type { JpegOptions } from 'sharp'

import { recorteDoPayload } from '../midia/derivados-sharp'

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
 *
 * PRD 24 RF2 — sem `node:fs` e sem `import` do `sharp`, porque este hook está na coleção
 * `midia` que um Worker também carrega:
 * - o `sharp` é o da config (`req.payload.config.sharp`), o mesmo que o Payload acabou de usar.
 *   Config sem `sharp` (num Worker) → o hook não faz nada: quem gerou os derivados foi o
 *   `GeradorDeDerivados` (`midia/derivados-sem-sharp.ts`), e ele já sai com fundo branco;
 * - o original vem de `req.file.data`. Antes o hook lia `tempFilePath` quando havia: só existe
 *   com `upload.useTempFiles` na config do Payload, que a fábrica não liga — então é a mesma
 *   leitura de antes.
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

  const sharp = req.payload.config.sharp
  if (!sharp) return data

  const original = arquivo.data
  // `hasAlpha` sozinho não basta: PNG com canal alfa e nenhum pixel transparente é comum
  // (3 das 10 capas PNG do acervo), e refazer esses seria trabalho à toa
  if ((await sharp(original).stats()).isOpaque) return data

  const focal = { x: Number(data.focalX ?? 50), y: Number(data.focalY ?? 50) }
  const opcoes = (config.formatOptions?.options ?? {}) as JpegOptions
  const buf = await (await recorteDoPayload(sharp, original, config.width, config.height, focal))
    .flatten({ background: FUNDO })
    .jpeg(opcoes)
    .toBuffer()

  req.payloadUploadSizes![TAMANHO] = buf
  ;(data.sizes as Record<string, object>)[TAMANHO] = { ...og, filesize: buf.length }
  return data
}
