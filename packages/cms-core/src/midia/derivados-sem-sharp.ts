/**
 * PRD 24 RF2 — os derivados da mídia quando a config vem sem `sharp` (num Worker).
 *
 * Sem `sharp`, o Payload não gera os `imageSizes`: `generateFileData` deixa `data.sizes`
 * vazio e `req.payloadUploadSizes` sem nada (`createImageSizes`, Payload 3.88). Este
 * `beforeChange` faz o que ele faria, com o `GeradorDeDerivados` que a fábrica pôs em
 * `custom.derivados` da coleção (`derivadosViaImages`, pelo binding Images):
 * - `data.sizes[nome]` com `filename`, `filesize`, `width`, `height` e `mimeType` de cada
 *   derivado — e o tamanho omitido com tudo `null`, como o Payload grava;
 * - `req.payloadUploadSizes[nome]` com os bytes, que é o que o `storage-s3` sobe para o
 *   bucket (o mesmo truque do `og-sem-transparencia.ts`). Os hooks do plugin vêm depois dos
 *   da coleção, então o envio já encontra os derivados.
 *
 * **Com `sharp` na config, não faz nada**: o Payload gerou os derivados, e em Node tudo
 * continua como sempre foi. Também não faz nada sem gerador, sem arquivo novo no `req` (um
 * `update` que só muda o `alt`) ou com arquivo que o Payload não redimensiona (PDF, SVG).
 *
 * Só upload novo passa por aqui. O acervo que já está no bucket se regenera em Node, com
 * `regenera:tamanhos` — 2.534 × 3 pelo binding estouraria as 5.000 transformações grátis.
 */
import type { CollectionBeforeChangeHook, FileSize } from 'payload'

import { MIME_REDIMENSIONAVEIS, type CustomDaMidia } from './derivados'

const SEM_DERIVADO: FileSize = { filename: null, filesize: null, height: null, mimeType: null, url: null, width: null }

export const derivadosSemSharp: CollectionBeforeChangeHook = async ({ collection, data, req }) => {
  // o tipo da config diz que `sharp` sempre existe; sem a opção na config, é `undefined`
  if ((req.payload.config as { sharp?: unknown }).sharp) return data
  const gerador = (collection.custom as CustomDaMidia | undefined)?.derivados
  const arquivo = req.file
  const imageSizes = typeof collection.upload === 'object' ? collection.upload.imageSizes : undefined
  if (!gerador || !arquivo || !imageSizes?.length || !data?.filename) return data
  if (!MIME_REDIMENSIONAVEIS.includes(arquivo.mimetype)) return data

  const derivados = await gerador.gera({
    bytes: arquivo.data,
    mimeType: arquivo.mimetype,
    filename: data.filename,
    imageSizes,
    logger: req.payload.logger,
  })
  const porNome = new Map(derivados.map((d) => [d.nome, d]))

  const sizes: Record<string, FileSize> = {}
  const envio = (req.payloadUploadSizes ??= {})
  for (const { name } of imageSizes) {
    const d = porNome.get(name)
    if (!d) {
      sizes[name] = { ...SEM_DERIVADO }
      continue
    }
    envio[name] = Buffer.from(d.bytes.buffer, d.bytes.byteOffset, d.bytes.byteLength)
    sizes[name] = { filename: d.filename, filesize: d.filesize, height: d.altura, mimeType: d.mimeType, url: null, width: d.largura }
  }
  data.sizes = sizes
  return data
}
