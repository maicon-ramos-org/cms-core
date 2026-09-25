/**
 * PRD 24 RF1/RF2 — o contrato do gerador de derivados sem `sharp`.
 *
 * Num Worker não há `sharp` (é binário nativo), e o Payload só gera os `imageSizes` com
 * `config.sharp`. Quem gera, então, é um `GeradorDeDerivados` injetado na fábrica
 * (`OpcoesCmsCore.midia.derivados`) — num Worker, o binding Images da Cloudflare
 * (`derivadosViaImages`, RF2).
 *
 * Este arquivo só tem TIPOS: é o que a RF1 (a fábrica, que repassa o gerador) e a RF2 (o hook
 * e as implementações) combinaram. Onde o gerador chega: a fábrica o põe em
 * `custom.derivados` da coleção `midia` (`CustomDaMidia`), e o `beforeChange` da coleção o lê
 * de `collection.custom` quando a config vem sem `sharp`.
 */
import type { ImageSize } from 'payload'

/** O que o gerador recebe: o arquivo original do upload e os tamanhos a gerar. */
export interface EntradaDoGerador {
  /** os bytes do original (`req.file.data`) */
  bytes: Uint8Array
  /** o tipo do original (`image/png`, `image/jpeg`…) */
  mimeType: string
  /**
   * o nome com que o original vai para o bucket (o `filename` do registro, já com o nome-base
   * único). O derivado segue a regra do Payload: `{base}-{largura}x{altura}.{extensão}`.
   */
  filename: string
  /** os `imageSizes` da coleção, como o Payload os declara (nome, medidas, `fit`, formato) */
  imageSizes: ImageSize[]
}

/** Um derivado pronto: o que entra em `data.sizes[nome]` e em `req.payloadUploadSizes[nome]`. */
export interface Derivado {
  /** o nome do tamanho em `imageSizes` (`cartao`, `capa`, `og`) */
  nome: string
  bytes: Uint8Array
  mimeType: string
  largura: number
  altura: number
  /** o tamanho em bytes (`bytes.byteLength`) */
  filesize: number
  filename: string
}

/**
 * Gera os derivados de um upload. Tamanho que não se aplica ao arquivo (um PDF, por exemplo)
 * simplesmente não vem na lista.
 */
export interface GeradorDeDerivados {
  gera(entrada: EntradaDoGerador): Promise<Derivado[]>
}

/** O `custom` da coleção `midia` montada pela fábrica. */
export interface CustomDaMidia {
  /** presente só quando o site passou `midia.derivados` */
  derivados?: GeradorDeDerivados
}
