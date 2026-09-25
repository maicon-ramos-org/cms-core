/**
 * PRD 24 RF2 — os derivados da mídia sem `sharp`, pelo binding Images.
 *
 * O binding aqui é FALSO: não transforma pixel nenhum, só devolve bytes que dizem o que foi
 * pedido e as medidas que a Cloudflare daria (as regras de `fit` da documentação). O que se
 * confere é o contrato com o Payload — `data.sizes` e `req.payloadUploadSizes` — e a
 * tradução de cada `imageSizes` da coleção `midia` para as opções do binding. A prova com o
 * binding de verdade (os três derivados no bucket de dev, o `og` com fundo branco) é da RF7.
 */
import type { CollectionBeforeChangeHook, ImageSize, SanitizedCollectionConfig } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { Midia } from '../src/collections/Midia'
import {
  derivadosViaImages,
  MIME_DO_BINDING_IMAGES,
  MIME_REDIMENSIONAVEIS,
  type BindingImages,
  type GeradorDeDerivados,
  type SaidaDeImagem,
  type TransformacaoDeImagem,
  type TransformadorDeImagem,
} from '../src/midia/derivados'
import { derivadosSemSharp } from '../src/midia/derivados-sem-sharp'

const TAMANHOS = (Midia.upload as { imageSizes: ImageSize[] }).imageSizes

const texto = new TextEncoder()
const leitor = new TextDecoder()

/** O "arquivo" original do teste: só as medidas, que é o que o `info()` falso lê. */
const imagem = (largura: number, altura: number) => texto.encode(`ORIGINAL ${largura}x${altura}`)

async function le(fluxo: ReadableStream<Uint8Array>) {
  return leitor.decode(await new Response(fluxo).arrayBuffer())
}

/** As medidas que a Cloudflare daria a cada `fit` (https://developers.cloudflare.com/images/transform-images/transform-via-url/). */
function medidasDoFit(orig: { w: number; h: number }, t: TransformacaoDeImagem) {
  const { width, height, fit = 'scale-down' } = t
  if ((fit === 'cover' || fit === 'squeeze' || fit === 'pad') && width && height) return { w: width, h: height }
  if (fit === 'crop' && width && height) return { w: Math.min(width, orig.w), h: Math.min(height, orig.h) }
  const escala = Math.min(width ? width / orig.w : Infinity, height ? height / orig.h : Infinity)
  const s = fit === 'scale-down' ? Math.min(1, escala) : escala
  return { w: Math.round(orig.w * s), h: Math.round(orig.h * s) }
}

interface Chamada {
  transformacoes: TransformacaoDeImagem[]
  saida?: SaidaDeImagem
}

function bindingFalso() {
  const chamadas: Chamada[] = []
  const infos: string[] = []
  const binding: BindingImages = {
    async info(fluxo) {
      const conteudo = await le(fluxo)
      infos.push(conteudo)
      const m = /(\d+)x(\d+)/.exec(conteudo)!
      const format = conteudo.startsWith('ORIGINAL') ? 'image/png' : conteudo.split(' ')[1]!
      return { format, fileSize: conteudo.length, width: Number(m[1]), height: Number(m[2]) }
    },
    input(fluxo) {
      const chamada: Chamada = { transformacoes: [] }
      chamadas.push(chamada)
      const lido = le(fluxo)
      const transformador = {
        transform(t: TransformacaoDeImagem) {
          chamada.transformacoes.push(t)
          return transformador
        },
        async output(saida: SaidaDeImagem) {
          chamada.saida = saida
          const [w, h] = /(\d+)x(\d+)/.exec(await lido)!.slice(1).map(Number) as [number, number]
          const m = medidasDoFit({ w, h }, Object.assign({}, ...chamada.transformacoes))
          // o tamanho do "arquivo" varia com o formato e a qualidade: o filesize tem de vir DELE
          const bytes = `DERIVADO ${saida.format} ${m.w}x${m.h} q${saida.quality}`.padEnd(40 + (saida.quality ?? 0), '.')
          return { image: () => new Response(bytes).body!, contentType: () => saida.format }
        },
      }
      return transformador
    },
  }
  return { binding, chamadas, infos }
}

describe('derivadosViaImages: os imageSizes da coleção midia pelo binding Images', () => {
  it('um PNG 1280×720: cartão 640 AVIF, capa 1600×900 AVIF q55 e og 1200×630 JPEG q80 sobre branco', async () => {
    const { binding, chamadas } = bindingFalso()
    const derivados = await derivadosViaImages(binding).gera({
      bytes: imagem(1280, 720),
      mimeType: 'image/png',
      filename: 'capa-do-post.png',
      imageSizes: TAMANHOS,
    })

    expect(derivados.map(({ bytes: _, ...d }) => d)).toEqual([
      { nome: 'cartao', mimeType: 'image/avif', largura: 640, altura: 360, filesize: 90, filename: 'capa-do-post-640x360.avif' },
      { nome: 'capa', mimeType: 'image/avif', largura: 1600, altura: 900, filesize: 95, filename: 'capa-do-post-1600x900.avif' },
      { nome: 'og', mimeType: 'image/jpeg', largura: 1200, altura: 630, filesize: 120, filename: 'capa-do-post-1200x630.jpg' },
    ])
    for (const d of derivados) expect(d.filesize).toBe(d.bytes.byteLength)

    expect(chamadas).toEqual([
      // `withoutEnlargement: true` e só a largura: reduz mantendo a proporção, nunca amplia; sem
      // `quality`, a padrão do sharp para AVIF (50), não a 85 da Cloudflare
      { transformacoes: [{ width: 640, fit: 'scale-down', gravity: 'center' }], saida: { format: 'image/avif', quality: 50 } },
      // `cover` + `withoutEnlargement: false`: recorta 16:9 pelo centro e amplia
      { transformacoes: [{ width: 1600, height: 900, fit: 'cover', gravity: 'center' }], saida: { format: 'image/avif', quality: 55 } },
      // o `og` é JPEG: o que era transparente sai branco (PRD 18 RF5), não preto
      {
        transformacoes: [{ width: 1200, height: 630, fit: 'cover', gravity: 'center', background: '#ffffff' }],
        saida: { format: 'image/jpeg', quality: 80 },
      },
    ])
  })

  it('original menor que o cartão: o cartão sai do tamanho do original (sem ampliar), a capa e o og ampliam', async () => {
    const { binding } = bindingFalso()
    const derivados = await derivadosViaImages(binding).gera({
      bytes: imagem(400, 300),
      mimeType: 'image/jpeg',
      filename: 'pequena.jpg',
      imageSizes: TAMANHOS,
    })
    expect(derivados.map((d) => [d.nome, d.largura, d.altura, d.filename])).toEqual([
      ['cartao', 400, 300, 'pequena-400x300.avif'],
      ['capa', 1600, 900, 'pequena-1600x900.avif'],
      ['og', 1200, 630, 'pequena-1200x630.jpg'],
    ])
  })

  it('omite o tamanho que o Payload omitiria: `withoutEnlargement` indefinido e o original menor nos dois eixos', async () => {
    const { binding, chamadas } = bindingFalso()
    const imageSizes: ImageSize[] = [
      { name: 'grande', width: 2000, height: 1000, formatOptions: { format: 'webp', options: {} } },
      { name: 'estreito', width: 300, formatOptions: { format: 'webp', options: {} } },
    ]
    const derivados = await derivadosViaImages(binding).gera({ bytes: imagem(1280, 720), mimeType: 'image/png', filename: 'x.png', imageSizes })
    expect(derivados.map((d) => [d.nome, d.largura, d.altura, d.mimeType])).toEqual([['estreito', 300, 169, 'image/webp']])
    // sem `withoutEnlargement`, com um lado só: reduz mantendo a proporção; WebP q80 do sharp
    expect(chamadas).toEqual([{ transformacoes: [{ width: 300, fit: 'contain', gravity: 'center' }], saida: { format: 'image/webp', quality: 80 } }])
  })

  it('sem formatOptions, o derivado sai no formato do original', async () => {
    const { binding, chamadas } = bindingFalso()
    const derivados = await derivadosViaImages(binding).gera({
      bytes: imagem(1000, 1000),
      mimeType: 'image/webp',
      filename: 'quadrada.webp',
      imageSizes: [{ name: 'miniatura', width: 100, height: 100, withoutEnlargement: false }],
    })
    expect(derivados.map((d) => [d.filename, d.mimeType])).toEqual([['quadrada-100x100.webp', 'image/webp']])
    expect(chamadas[0]!.saida).toEqual({ format: 'image/webp', quality: 80 })
  })

  it('arquivo que o Payload não redimensiona (PDF, SVG): nenhum derivado e nenhuma chamada ao binding', async () => {
    const { binding, chamadas, infos } = bindingFalso()
    const gerador = derivadosViaImages(binding)
    for (const mimeType of ['application/pdf', 'image/svg+xml']) {
      expect(await gerador.gera({ bytes: imagem(10, 10), mimeType, filename: 'x', imageSizes: TAMANHOS })).toEqual([])
    }
    expect(chamadas).toEqual([])
    expect(infos).toEqual([])
  })

  it('o que não tem tradução para o binding falha dizendo qual tamanho, em vez de sair diferente do Node', async () => {
    const { binding } = bindingFalso()
    const gera = (tamanho: ImageSize) =>
      derivadosViaImages(binding).gera({ bytes: imagem(1280, 720), mimeType: 'image/png', filename: 'x.png', imageSizes: [tamanho] })
    await expect(gera({ name: 'aparado', width: 100, trimOptions: {}, withoutEnlargement: false })).rejects.toThrow(/`aparado`.*trimOptions/)
    await expect(gera({ name: 'fora', width: 100, height: 100, fit: 'outside', withoutEnlargement: false })).rejects.toThrow(/`fora`.*outside/)
    await expect(gera({ name: 'tiff', width: 100, withoutEnlargement: false, formatOptions: { format: 'tiff', options: {} } })).rejects.toThrow(
      /`tiff`.*formato/,
    )
  })

  /*
   * O `sharp` redimensiona TIFF e AVIF (`canResizeImage` do Payload), mas o binding Images não
   * os aceita como entrada no plano do projeto: TIFF não está na lista, e AVIF é "Available
   * on an Enterprise plan" (https://developers.cloudflare.com/images/get-started/limits/,
   * consultada em 2026-09-24). O upload falha dizendo o tipo — nem sai sem derivado (o que
   * em Node teria os três), nem vaza o erro cru do binding.
   */
  it('TIFF e AVIF como original: falha dizendo o tipo, o arquivo e os tamanhos, sem chamar o binding', async () => {
    const { binding, chamadas, infos } = bindingFalso()
    const gerador = derivadosViaImages(binding)
    for (const [mimeType, filename] of [
      ['image/tiff', 'scan.tiff'],
      ['image/avif', 'capa.avif'],
    ] as const) {
      await expect(gerador.gera({ bytes: imagem(1280, 720), mimeType, filename, imageSizes: TAMANHOS })).rejects.toThrow(
        new RegExp(`${mimeType.replace('/', '\\/')}.*${filename.replace('.', '\\.')}.*não é entrada do binding Images.*cartao.*capa.*og`),
      )
    }
    expect(chamadas).toEqual([])
    expect(infos).toEqual([])
  })

  it('só JPEG, PNG, GIF e WebP vão ao binding (a interseção do sharp com a entrada da Cloudflare fora do Enterprise)', () => {
    expect(MIME_DO_BINDING_IMAGES).toEqual(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
    for (const mime of MIME_DO_BINDING_IMAGES) expect(MIME_REDIMENSIONAVEIS).toContain(mime)
  })

  it('o binding recusa o original (ex.: tipo declarado errado): o erro diz o tipo e o arquivo e guarda o original em `cause`', async () => {
    const recusa = new Error('ImagesError: 9412 unsupported image format')
    const { binding } = bindingFalso()
    binding.info = async () => {
      throw recusa
    }
    const erro = await derivadosViaImages(binding)
      .gera({ bytes: imagem(1280, 720), mimeType: 'image/png', filename: 'na-verdade-tiff.png', imageSizes: TAMANHOS })
      .then(() => undefined, (e: unknown) => e as Error)
    if (!erro) throw new Error('era para falhar')
    expect(erro.message).toMatch(/image\/png.*na-verdade-tiff\.png.*9412 unsupported image format/)
    expect(erro.cause).toBe(recusa)
  })

  it('o binding falha num tamanho: o erro diz o tamanho, o tipo e o arquivo e guarda o original em `cause`', async () => {
    const recusa = new Error('ImagesError: 9413 image too large')
    const { binding } = bindingFalso()
    binding.input = () => {
      const transformador: TransformadorDeImagem = { transform: () => transformador, output: () => Promise.reject(recusa) }
      return transformador
    }
    const erro = await derivadosViaImages(binding)
      .gera({ bytes: imagem(1280, 720), mimeType: 'image/jpeg', filename: 'foto.jpg', imageSizes: TAMANHOS.slice(0, 1) })
      .then(() => undefined, (e: unknown) => e as Error)
    if (!erro) throw new Error('era para falhar')
    expect(erro.message).toMatch(/`cartao`.*image\/jpeg.*foto\.jpg.*9413 image too large/)
    expect(erro.cause).toBe(recusa)
  })
})

/*
 * O `beforeChange` da coleção `midia`. Os argumentos imitam o que o Payload entrega depois de
 * `generateFileData` sem `sharp`: `data.sizes` vazio e `req.payloadUploadSizes` vazio.
 */
function argumentos({ sharp, gerador, arquivo }: { sharp?: unknown; gerador?: GeradorDeDerivados; arquivo?: { data: Uint8Array; mimetype: string } | null }) {
  const collection = { ...Midia, custom: gerador ? { derivados: gerador } : {} } as unknown as SanitizedCollectionConfig
  const data: Record<string, unknown> = {
    alt: 'capa',
    filename: 'capa-do-post.png',
    mimeType: arquivo?.mimetype ?? 'image/png',
    width: 1280,
    height: 720,
    sizes: {},
  }
  const req = {
    file: arquivo === null ? undefined : { name: 'capa-do-post.png', size: 0, ...(arquivo ?? { data: imagem(1280, 720), mimetype: 'image/png' }) },
    payloadUploadSizes: {} as Record<string, Buffer>,
    payload: { config: sharp ? { sharp } : {} },
  }
  return { collection, data, req } as unknown as Parameters<CollectionBeforeChangeHook>[0] & { data: typeof data; req: typeof req }
}

describe('derivadosSemSharp: o beforeChange que preenche data.sizes e req.payloadUploadSizes', () => {
  it('config sem sharp: data.sizes com nome, largura, altura, mimeType e filesize de cada derivado, e os bytes em req.payloadUploadSizes', async () => {
    const { binding } = bindingFalso()
    const args = argumentos({ gerador: derivadosViaImages(binding) })

    const data = await derivadosSemSharp(args)

    expect(data.sizes).toEqual({
      cartao: { filename: 'capa-do-post-640x360.avif', filesize: 90, width: 640, height: 360, mimeType: 'image/avif', url: null },
      capa: { filename: 'capa-do-post-1600x900.avif', filesize: 95, width: 1600, height: 900, mimeType: 'image/avif', url: null },
      og: { filename: 'capa-do-post-1200x630.jpg', filesize: 120, width: 1200, height: 630, mimeType: 'image/jpeg', url: null },
    })
    // é deste objeto que o storage-s3 tira o que sobe: uma chave por derivado, os bytes dele
    const envio = args.req.payloadUploadSizes
    expect(Object.keys(envio).sort()).toEqual(['capa', 'cartao', 'og'])
    for (const [nome, buf] of Object.entries(envio)) {
      expect(Buffer.isBuffer(buf)).toBe(true)
      expect(buf.length).toBe((data.sizes as Record<string, { filesize: number }>)[nome]!.filesize)
    }
    expect(leitor.decode(envio.og)).toMatch(/^DERIVADO image\/jpeg 1200x630 q80/)
    // o resto do registro não muda
    expect(data).toMatchObject({ alt: 'capa', filename: 'capa-do-post.png', width: 1280, height: 720 })
  })

  it('tamanho omitido sai com tudo null em data.sizes (como o Payload grava) e sem chave em req.payloadUploadSizes', async () => {
    const gerador: GeradorDeDerivados = {
      gera: async () => [
        { nome: 'og', bytes: texto.encode('og'), mimeType: 'image/jpeg', largura: 1200, altura: 630, filesize: 2, filename: 'x-1200x630.jpg' },
      ],
    }
    const args = argumentos({ gerador })
    const data = await derivadosSemSharp(args)
    const nulo = { filename: null, filesize: null, width: null, height: null, mimeType: null, url: null }
    expect(data.sizes).toEqual({
      cartao: nulo,
      capa: nulo,
      og: { filename: 'x-1200x630.jpg', filesize: 2, width: 1200, height: 630, mimeType: 'image/jpeg', url: null },
    })
    expect(Object.keys(args.req.payloadUploadSizes)).toEqual(['og'])
  })

  it('o gerador recebe os bytes do upload, o tipo, o nome final do registro e os imageSizes da coleção', async () => {
    const gera = vi.fn<GeradorDeDerivados['gera']>(async () => [])
    const args = argumentos({ gerador: { gera } })
    await derivadosSemSharp(args)
    expect(gera).toHaveBeenCalledWith({ bytes: args.req.file!.data, mimeType: 'image/png', filename: 'capa-do-post.png', imageSizes: TAMANHOS })
  })

  it('COM sharp na config, o hook não roda: o gerador nem é chamado e o registro sai como o Payload deixou (Node, como hoje)', async () => {
    const gera = vi.fn<GeradorDeDerivados['gera']>(async () => {
      throw new Error('não devia gerar')
    })
    const args = argumentos({ sharp: () => ({}), gerador: { gera } })
    const antes = structuredClone(args.data)

    const data = await derivadosSemSharp(args)

    expect(gera).not.toHaveBeenCalled()
    expect(data).toBe(args.data)
    expect(data).toEqual(antes)
    expect(args.req.payloadUploadSizes).toEqual({})
  })

  it('sem gerador, sem arquivo novo no req (um update que só muda o alt) ou com PDF: não faz nada', async () => {
    const gera = vi.fn<GeradorDeDerivados['gera']>(async () => [])
    for (const args of [
      argumentos({}),
      argumentos({ gerador: { gera }, arquivo: null }),
      argumentos({ gerador: { gera }, arquivo: { data: texto.encode('%PDF'), mimetype: 'application/pdf' } }),
    ]) {
      const antes = structuredClone(args.data)
      expect(await derivadosSemSharp(args)).toEqual(antes)
      expect(args.req.payloadUploadSizes).toEqual({})
    }
    expect(gera).not.toHaveBeenCalled()
  })

  it('na coleção midia, roda ANTES do og-sem-transparencia (que só age com sharp)', () => {
    expect(Midia.hooks?.beforeChange?.[0]).toBe(derivadosSemSharp)
    expect(Midia.hooks?.beforeChange).toHaveLength(2)
  })
})
