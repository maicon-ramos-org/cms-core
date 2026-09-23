/**
 * PRD 18 RF5 — o acervo que já existia ganha os derivados novos (`cartao`, `capa`, `og`).
 *
 * `imageSizes` só vale para upload novo: o Payload não volta no acervo. Reprocessar é
 * reenviar o MESMO arquivo ao mesmo registro com `overwriteExistingFiles`, e o pipeline
 * gera tudo de novo sob o mesmo nome — nada que aponta para a original quebra.
 *
 * Três decisões que não se veem no código do Payload:
 *
 * 1. **A original vem do bucket, não do disco.** Desde o RF1 o upload novo só existe no
 *    bucket, e o disco some no RF9.
 *
 * 2. **"Já tem" é ter OS TRÊS derivados, e cada um existir no bucket.** A versão anterior
 *    olhava só `sizes.cartao` no banco: como todo o acervo já tinha cartão, pularia as 782
 *    capas de post sem gerar `capa` nem `og` — com relatório de "tudo pulado".
 *
 * 3. **Dois registros não dividem o nome-base** (`nome-midia.ts`). Quem precisa de nome
 *    novo muda SEM que o `storage-s3` apague nada: o plugin apaga do bucket todo arquivo
 *    que o registro deixou de citar, e aqui isso levaria a miniatura que o OUTRO registro
 *    usa e a original que o endereço antigo e o alias do WP servem. Então: copia a original
 *    para o nome novo, aponta o registro para ela SEM enviar arquivo (sem arquivo, o plugin
 *    não apaga nada) e com os derivados zerados, e só então regenera. A original antiga
 *    fica no bucket, fora de qualquer registro, servindo quem ainda aponta para ela.
 */
import { CopyObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import type { Payload } from 'payload'

import { Midia } from '@runzos/cms-core'

import { planoDeRenomeacao, type MidiaComNome } from '@runzos/cms-core'

/** os derivados da coleção, na ordem em que ela os declara */
export const DERIVADOS: readonly string[] =
  typeof Midia.upload === 'object' ? (Midia.upload.imageSizes ?? []).map((s) => s.name) : []

/** o que o Payload sabe redimensionar (`canResizeImage`, Payload 3.88) — o resto não tem derivado */
const REDIMENSIONAVEL = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/tiff', 'image/avif'])

export interface MidiaDoAcervo extends MidiaComNome {
  mimeType?: string | null
}

/** O mínimo do cliente S3 que a regeneração usa. */
export interface BucketRegenera {
  send(comando: HeadObjectCommand | GetObjectCommand | CopyObjectCommand): Promise<unknown>
}

export interface Relatorio {
  alvos: number
  /** no `--dry`, os que SERIAM regenerados */
  regenerados: number
  /** já tinham os três derivados, e os três estão no bucket */
  completos: number
  /** PDF, SVG: o Payload não gera derivado deles */
  semDerivado: string[]
  /** a original não está no bucket (ou o registro não tem arquivo): já quebrada no site */
  semOriginal: string[]
  renomeados: Array<{ id: number | string; de: string; para: string }>
  falhas: Array<{ id: number | string; arquivo: string; motivo: string }>
}

const naoExiste = (e: unknown) => {
  const x = e as { name?: string; $metadata?: { httpStatusCode?: number } }
  return x?.name === 'NotFound' || x?.name === 'NoSuchKey' || x?.$metadata?.httpStatusCode === 404
}

async function existe(s3: BucketRegenera, bucket: string, chave: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: chave }))
    return true
  } catch (e) {
    if (naoExiste(e)) return false
    throw e
  }
}

async function baixa(s3: BucketRegenera, bucket: string, chave: string): Promise<Buffer> {
  const r = (await s3.send(new GetObjectCommand({ Bucket: bucket, Key: chave }))) as {
    Body?: { transformToByteArray(): Promise<Uint8Array> }
  }
  if (!r.Body) throw new Error(`objeto vazio: ${chave}`)
  return Buffer.from(await r.Body.transformToByteArray())
}

/** Os três derivados gravados no registro, e cada um presente no bucket. */
export async function temTodosOsDerivados(s3: BucketRegenera, bucket: string, doc: MidiaDoAcervo): Promise<boolean> {
  for (const nome of DERIVADOS) {
    const chave = doc.sizes?.[nome]?.filename
    if (!chave || !(await existe(s3, bucket, chave))) return false
  }
  return true
}

async function emParalelo<T>(itens: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let proximo = 0
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const item = itens[proximo]!
      proximo += 1
      await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, itens.length)) }, trabalhador))
}

export async function regeneraAcervo(o: {
  payload: Payload
  s3: BucketRegenera
  bucket: string
  /** o acervo INTEIRO: é contra ele que se decide quem muda de nome */
  acervo: readonly MidiaDoAcervo[]
  alvos: ReadonlyArray<number | string>
  dry?: boolean
  /** regenera mesmo quem já tem os três derivados */
  forca?: boolean
  concorrencia?: number
  /** espera entre um registro e o próximo, para não disputar CPU com o site */
  pausaMs?: number
  log?: (msg: string) => void
}): Promise<Relatorio> {
  const log = o.log ?? (() => {})
  const porId = new Map(o.acervo.map((m) => [String(m.id), m]))
  const rel: Relatorio = {
    alvos: o.alvos.length,
    regenerados: 0,
    completos: 0,
    semDerivado: [],
    semOriginal: [],
    renomeados: [],
    falhas: [],
  }

  // 1. quem entra na rodada: tem arquivo redimensionável, original no bucket, e falta derivado
  const rodada: MidiaDoAcervo[] = []
  const ordenados = [...new Set(o.alvos.map(String))].sort((a, b) => Number(a) - Number(b))
  await emParalelo(ordenados, 8, async (id) => {
    const doc = porId.get(id)
    if (!doc) {
      rel.falhas.push({ id, arquivo: '', motivo: 'registro não encontrado' })
      return
    }
    if (!doc.filename) {
      rel.semOriginal.push(`#${doc.id} (registro sem arquivo)`)
      return
    }
    if (!REDIMENSIONAVEL.has(doc.mimeType ?? '')) {
      rel.semDerivado.push(doc.filename)
      return
    }
    if (!(await existe(o.s3, o.bucket, doc.filename))) {
      rel.semOriginal.push(doc.filename)
      return
    }
    if (!o.forca && (await temTodosOsDerivados(o.s3, o.bucket, doc))) {
      rel.completos += 1
      return
    }
    rodada.push(doc)
  })
  rodada.sort((a, b) => Number(a.id) - Number(b.id))
  // a classificação roda em paralelo: ordena para o relatório sair igual entre rodadas
  rel.semDerivado.sort()
  rel.semOriginal.sort()

  // 2. quem muda de nome, decidido contra o acervo inteiro ANTES de qualquer escrita
  const plano = planoDeRenomeacao({ acervo: o.acervo, rodada: rodada.map((m) => m.id) })
  if (o.dry) {
    for (const m of rodada) {
      const para = plano.get(m.id)
      if (para) rel.renomeados.push({ id: m.id, de: m.filename!, para })
    }
    rel.regenerados = rodada.length
    return rel
  }

  // 3. regenera
  const zerados = Object.fromEntries(
    DERIVADOS.map((n) => [n, { filename: null, url: null, width: null, height: null, mimeType: null, filesize: null }]),
  )
  let feitos = 0
  await emParalelo(rodada, o.concorrencia ?? 1, async (doc) => {
    let chave = doc.filename!
    let renomeado = false
    try {
      const novo = plano.get(doc.id)
      if (novo) {
        await o.s3.send(
          new CopyObjectCommand({ Bucket: o.bucket, CopySource: `${o.bucket}/${encodeURIComponent(chave)}`, Key: novo }),
        )
        if (!(await existe(o.s3, o.bucket, novo))) throw new Error(`a cópia para ${novo} não ficou no bucket`)
        // sem `file`: o storage-s3 não envia nem apaga nada; só o registro muda
        await o.payload.update({ collection: 'midia', id: doc.id, data: { filename: novo, sizes: zerados } as never, depth: 0 })
        renomeado = true
        chave = novo
      }

      const dados = await baixa(o.s3, o.bucket, chave)
      const r = await o.payload.update({
        collection: 'midia',
        id: doc.id,
        data: {},
        file: { data: dados, mimetype: doc.mimeType!, name: chave, size: dados.length },
        overwriteExistingFiles: true,
        depth: 0,
      })

      // confere no destino: o update responder não prova que os arquivos ficaram
      const faltando: string[] = []
      for (const nome of DERIVADOS) {
        const f = (r.sizes as MidiaDoAcervo['sizes'])?.[nome]?.filename
        if (!f || !(await existe(o.s3, o.bucket, f))) faltando.push(nome)
      }
      if (r.filename !== chave) faltando.push(`original (virou ${r.filename})`)
      if (faltando.length) throw new Error(`sem ${faltando.join(', ')} no bucket depois de regenerar`)

      if (renomeado) rel.renomeados.push({ id: doc.id, de: doc.filename!, para: chave })
      rel.regenerados += 1
      feitos += 1
      if (feitos % 25 === 0) log(`  ${feitos}/${rodada.length}`)
    } catch (e) {
      let motivo = e instanceof Error ? e.message : String(e)
      /*
       * Trocou de nome e a regeneração falhou: o registro ficaria apontando para o nome novo
       * com os derivados zerados — cartão em branco no site até a próxima rodada. Volta ao
       * nome e aos derivados de ANTES, de novo sem `file` (sem arquivo, o plugin não apaga
       * nada). O que a tentativa deixou no bucket com o nome novo fica órfão, e a próxima
       * rodada reaproveita o mesmo nome.
       */
      if (renomeado) {
        try {
          await o.payload.update({
            collection: 'midia',
            id: doc.id,
            data: { filename: doc.filename, sizes: doc.sizes ?? zerados } as never,
            depth: 0,
          })
          motivo += ` — o registro voltou para \`${doc.filename}\``
        } catch (e2) {
          motivo += ` — e NÃO voltou para \`${doc.filename}\` (${e2 instanceof Error ? e2.message : String(e2)}): está com \`${chave}\` e sem derivados`
        }
      }
      rel.falhas.push({ id: doc.id, arquivo: chave, motivo })
    }
    if (o.pausaMs) await new Promise((pronto) => setTimeout(pronto, o.pausaMs))
  })
  return rel
}
