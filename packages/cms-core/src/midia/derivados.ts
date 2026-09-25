/**
 * PRD 24 RF1/RF2 — o gerador de derivados sem `sharp`.
 *
 * Num Worker não há `sharp` (é binário nativo), e o Payload só gera os `imageSizes` com
 * `config.sharp`. Quem gera, então, é um `GeradorDeDerivados` injetado na fábrica
 * (`OpcoesCmsCore.midia.derivados`) — num Worker, o binding Images da Cloudflare
 * (`derivadosViaImages`, abaixo).
 *
 * Onde o gerador chega: a fábrica o põe em `custom.derivados` da coleção `midia`
 * (`CustomDaMidia`), e o `beforeChange` da coleção (`derivados-sem-sharp.ts`) o lê de
 * `collection.custom` quando a config vem sem `sharp`.
 *
 * Nada aqui importa módulo do Node nem do Workers: o binding é descrito pelos tipos mínimos
 * que o gerador usa (`BindingImages`), e o `env.IMAGES` de um Worker cabe neles.
 */
import type { ImageSize } from 'payload'
import sanitize from 'sanitize-filename'

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

/**
 * Os tipos que o Payload redimensiona (`canResizeImage`, Payload 3.88) — é a lista do `sharp`.
 * Fora deles — PDF, SVG — o Payload não gera derivado nem com `sharp`, e o gerador também não.
 */
export const MIME_REDIMENSIONAVEIS: readonly string[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/tiff', 'image/avif']

/**
 * Os tipos que o binding Images aceita como ENTRADA, dentre os de `MIME_REDIMENSIONAVEIS`, fora
 * do plano Enterprise: TIFF não é entrada da Cloudflare, e AVIF é "Available on an Enterprise
 * plan" (https://developers.cloudflare.com/images/get-started/limits/, consultada em
 * 2026-09-24). HEIC a Cloudflare aceita, mas o Payload não redimensiona — fica de fora, como
 * em Node. Um original TIFF ou AVIF faz o `derivadosViaImages` falhar dizendo o tipo.
 */
export const MIME_DO_BINDING_IMAGES: readonly string[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

/*
 * O binding Images da Cloudflare, só no que o gerador usa. É um subconjunto estrutural dos
 * tipos de `@cloudflare/workers-types` (`ImagesBinding`, `ImageTransformer`,
 * `ImageTransformationResult`): o `env.IMAGES` de um Worker entra aqui sem conversão, e o
 * núcleo não ganha a dependência. Referência:
 * https://developers.cloudflare.com/images/transform-images/bindings/
 */

/** As opções de `transform()` que o gerador usa. */
export interface TransformacaoDeImagem {
  width?: number
  height?: number
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad' | 'squeeze'
  gravity?: 'left' | 'right' | 'top' | 'bottom' | 'center' | 'auto' | 'entropy'
  background?: string
}

/** Os formatos de saída que o gerador pede. */
export type FormatoDeSaida = 'image/avif' | 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

export interface SaidaDeImagem {
  format: FormatoDeSaida
  quality?: number
}

export interface ResultadoDeImagem {
  image(): ReadableStream<Uint8Array>
  contentType(): string
}

export interface TransformadorDeImagem {
  transform(transformacao: TransformacaoDeImagem): TransformadorDeImagem
  output(saida: SaidaDeImagem): Promise<ResultadoDeImagem>
}

/** O `info()` do binding: SVG vem só com `format`. */
export type InfoDeImagem = { format: string } | { format: string; fileSize: number; width: number; height: number }

export interface BindingImages {
  info(fluxo: ReadableStream<Uint8Array>): Promise<InfoDeImagem>
  input(fluxo: ReadableStream<Uint8Array>): TransformadorDeImagem
}

/**
 * O gerador pelo binding Images: `env.IMAGES.input(bytes).transform({...}).output({format})`
 * para cada `imageSizes` da coleção, com a mesma regra do Payload para cada tamanho
 * (`createImageSizes`/`getImageResizeAction`, Payload 3.88) traduzida para as opções da
 * Cloudflare:
 *
 * - **omite** o tamanho que o Payload omitiria: `withoutEnlargement` indefinido e o original
 *   menor que o alvo (nos dois eixos, quando o tamanho tem largura e altura; no eixo pedido,
 *   quando tem um só);
 * - **`fit`**: `cover` (o padrão do `sharp`) → `cover`, que recorta e amplia — ou `crop`, que
 *   recorta sem ampliar, com `withoutEnlargement: true`; `inside` → `contain`/`scale-down`;
 *   `fill` → `squeeze`; `contain` → `pad`. Com um lado só, a proporção se mantém:
 *   `scale-down` com `withoutEnlargement: true` (o `cartao`), `contain` sem;
 * - **`position`** → `gravity` (`centre` → `center`; `attention` → `auto`). Sem `sharp` a
 *   fábrica desliga o ponto focal, então o recorte é sempre pela posição do tamanho — o
 *   mesmo que o Payload faz sem ponto focal;
 * - **formato e qualidade**: `formatOptions.format` → `image/{formato}`; sem `quality`, a
 *   padrão do `sharp` (AVIF 50, JPEG e WebP 80), e não a 85 da Cloudflare. Sem
 *   `formatOptions`, o formato do original;
 * - **JPEG sai sobre branco**: JPEG não tem transparência, e o `og` de imagem transparente
 *   tem de sair com fundo branco (PRD 18 RF5; em Node, `hooks/og-sem-transparencia.ts`);
 * - **nome**: `{base}-{largura}x{altura}.{extensão}` com as medidas do que saiu (lidas pelo
 *   `info()`, que é gratuito) e a extensão do tipo (`jpg` para JPEG, como o `file-type` que o
 *   Payload usa), ou `generateImageName` quando o tamanho declara.
 *
 * A orientação EXIF a Cloudflare aplica sempre ("EXIF rotation is applied even if the
 * metadata is discarded"), como o `.rotate()` do Payload.
 *
 * Não traduz o que o núcleo não usa e a Cloudflare não tem igual — `withoutReduction`,
 * `trimOptions`, `fit: 'outside'`: o tamanho que pedir isso falha no upload, dizendo qual,
 * em vez de sair diferente do que sairia em Node. Pelo mesmo motivo, o original TIFF ou AVIF
 * (que o `sharp` redimensiona e o binding não aceita fora do Enterprise —
 * `MIME_DO_BINDING_IMAGES`) falha dizendo o tipo, e o erro que o binding lançar sai com o
 * tipo, o arquivo e o tamanho na mensagem (o original em `cause`).
 */
export function derivadosViaImages(binding: BindingImages): GeradorDeDerivados {
  return {
    async gera({ bytes, mimeType, filename, imageSizes }) {
      if (!MIME_REDIMENSIONAVEIS.includes(mimeType) || imageSizes.length === 0) return []
      const doArquivo = `o original ${mimeType} (${filename})`
      if (!MIME_DO_BINDING_IMAGES.includes(mimeType)) {
        throw new Error(
          `derivadosViaImages: ${doArquivo} não é entrada do binding Images fora do plano Enterprise, ` +
            `e em Node (sharp) geraria os tamanhos ${imageSizes.map((t) => `\`${t.name}\``).join(', ')}. ` +
            `Envie o arquivo em ${MIME_DO_BINDING_IMAGES.join(', ')}`,
        )
      }
      const original = await recusado(binding.info(fluxo(bytes)), `o binding Images recusou ${doArquivo}`)
      if (!('width' in original)) return []
      const { nome: base, extensao: extensaoOriginal } = partesDoNome(filename)

      const derivados = await Promise.all(
        imageSizes.map(async (tamanho): Promise<Derivado | undefined> => {
          if (omitido(tamanho, original)) return undefined
          const formato = formatoDeSaida(tamanho, mimeType)
          const passos = transformacao(tamanho, formato)
          const { saida, resultado, medidas } = await recusado(
            (async () => {
              const resultado = await binding
                .input(fluxo(bytes))
                .transform(passos)
                .output({ format: formato, quality: qualidade(tamanho, formato) })
              const saida = new Uint8Array(await new Response(resultado.image()).arrayBuffer())
              return { saida, resultado, medidas: await binding.info(fluxo(saida)) }
            })(),
            `o binding Images falhou no tamanho \`${tamanho.name}\` de ${doArquivo}`,
          )
          if (!('width' in medidas)) throw new Error(`derivadosViaImages: o tamanho \`${tamanho.name}\` saiu sem medidas (${medidas.format})`)

          const tipo = resultado.contentType() || formato
          const extensao = EXTENSAO[tipo] ?? extensaoOriginal
          const nomeDoArquivo = tamanho.generateImageName
            ? tamanho.generateImageName({
                extension: extensao,
                height: medidas.height,
                originalName: base,
                sizeName: tamanho.name,
                width: medidas.width,
              })
            : `${base}-${medidas.width}x${medidas.height}.${extensao}`
          return {
            nome: tamanho.name,
            bytes: saida,
            mimeType: tipo,
            largura: medidas.width,
            altura: medidas.height,
            filesize: saida.byteLength,
            filename: nomeDoArquivo,
          }
        }),
      )
      return derivados.filter((d): d is Derivado => d !== undefined)
    },
  }
}

/**
 * O erro do binding chega cru ("ImagesError: 9412 …"): relança dizendo o que se pedia, com o
 * original em `cause` — o mesmo padrão de `naoSuportado`.
 */
async function recusado<T>(promessa: Promise<T>, contexto: string): Promise<T> {
  try {
    return await promessa
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro)
    throw new Error(`derivadosViaImages: ${contexto}: ${motivo}`, { cause: erro })
  }
}

/** Os bytes como o binding os recebe. Um fluxo por leitura: fluxo lido não se relê. */
function fluxo(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new Response(bytes).body!
}

/** `parseFilename` do Payload: extensão depois do último ponto e o resto sanitizado. */
function partesDoNome(filename: string) {
  const extensao = filename.split('.').pop() ?? ''
  return { nome: sanitize(filename.substring(0, filename.lastIndexOf('.')) || filename), extensao }
}

/** A extensão que o `file-type` dá a cada formato (é a que o Payload usa no nome do derivado). */
const EXTENSAO: Record<string, string> = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** A qualidade padrão do `sharp` 0.34 em cada formato — a que o Payload usa sem `quality`. */
const QUALIDADE_DO_SHARP: Partial<Record<FormatoDeSaida, number>> = {
  'image/avif': 50,
  'image/jpeg': 80,
  'image/webp': 80,
}

const FUNDO_DO_JPEG = '#ffffff'

/** `getImageResizeAction` do Payload, só no ramo `'omit'`. */
function omitido(tamanho: ImageSize, original: { width: number; height: number }) {
  if (tamanho.withoutEnlargement !== undefined) return false
  const { width, height } = tamanho
  if (width && height) return original.width < width && original.height < height
  return Boolean((width && original.width < width) || (height && original.height < height))
}

function formatoDeSaida(tamanho: ImageSize, mimeOriginal: string): FormatoDeSaida {
  const pedido = tamanho.formatOptions?.format
  if (!pedido) {
    if (mimeOriginal in EXTENSAO) return mimeOriginal as FormatoDeSaida
    naoSuportado(tamanho, `o original ${mimeOriginal} sem \`formatOptions\``)
  }
  const tipo = `image/${pedido === 'jpg' ? 'jpeg' : pedido}`
  if (!(tipo in EXTENSAO)) naoSuportado(tamanho, `o formato \`${pedido}\``)
  return tipo as FormatoDeSaida
}

function qualidade(tamanho: ImageSize, formato: FormatoDeSaida) {
  const pedida = (tamanho.formatOptions?.options as { quality?: number } | undefined)?.quality
  return pedida ?? QUALIDADE_DO_SHARP[formato]
}

function transformacao(tamanho: ImageSize, formato: FormatoDeSaida): TransformacaoDeImagem {
  if (tamanho.withoutReduction) naoSuportado(tamanho, '`withoutReduction`')
  if (tamanho.trimOptions !== undefined) naoSuportado(tamanho, '`trimOptions`')
  const { width, height } = tamanho
  const semAmpliar = tamanho.withoutEnlargement === true

  let fit: TransformacaoDeImagem['fit']
  if (!width || !height) {
    fit = semAmpliar ? 'scale-down' : 'contain'
  } else {
    switch (tamanho.fit ?? 'cover') {
      case 'cover':
        fit = semAmpliar ? 'crop' : 'cover'
        break
      case 'inside':
        fit = semAmpliar ? 'scale-down' : 'contain'
        break
      case 'fill':
        fit = 'squeeze'
        break
      case 'contain':
        fit = 'pad'
        break
      default:
        naoSuportado(tamanho, `\`fit: '${tamanho.fit}'\``)
    }
  }

  return {
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    fit,
    gravity: gravidade(tamanho.position),
    ...(formato === 'image/jpeg' ? { background: FUNDO_DO_JPEG } : {}),
  }
}

/** `position` do `sharp` → `gravity` da Cloudflare. */
function gravidade(posicao: ImageSize['position']): NonNullable<TransformacaoDeImagem['gravity']> {
  switch (posicao) {
    case 'top':
    case 'north':
      return 'top'
    case 'bottom':
    case 'south':
      return 'bottom'
    case 'left':
    case 'west':
      return 'left'
    case 'right':
    case 'east':
      return 'right'
    case 'entropy':
      return 'entropy'
    case 'attention':
      return 'auto'
    default:
      return 'center'
  }
}

function naoSuportado(tamanho: ImageSize, oQue: string): never {
  throw new Error(
    `derivadosViaImages: o tamanho \`${tamanho.name}\` pede ${oQue}, que o gerador sem sharp não traduz para o binding Images`,
  )
}
