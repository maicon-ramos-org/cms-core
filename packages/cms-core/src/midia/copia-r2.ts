/**
 * PRD 18 RF3 — cópia do acervo de mídia do disco para o bucket, SEM o adaptador.
 *
 * Vai ao ar ANTES do RF1: com o `storage-s3` ligado, toda imagem passa a ser buscada no
 * bucket, inclusive as que ainda estão só no disco — se o adaptador chegasse primeiro, o
 * site perderia as imagens até a cópia terminar. Por isso fala com o bucket pelo SDK S3
 * direto, e não altera registro nenhum: a chave no bucket é o MESMO `filename` do disco, e
 * quem passa a apontar para lá é o RF1.
 *
 * Idempotente por construção: antes de enviar, pergunta ao destino (`HEAD`) e pula o que já
 * está lá com o mesmo tamanho. Depois de enviar, pergunta DE NOVO — o `PUT` responder não
 * prova que o objeto ficou, e objeto que não ficou é imagem 404 no dia do RF1.
 */
import { readFile, stat } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

import { endpointR2 } from '../r2'

/** O mínimo do cliente S3 que a cópia usa — é o que deixa testar sem rede. */
export interface BucketS3 {
  send(comando: HeadObjectCommand | PutObjectCommand): Promise<unknown>
}

interface Derivado {
  filename?: string | null
  mimeType?: string | null
}

export interface MidiaParaCopia {
  filename?: string | null
  mimeType?: string | null
  sizes?: Record<string, Derivado | null | undefined> | null
}

/** A original e cada derivado gerado, sob a chave que eles já têm no disco. */
export function chavesDaMidia(doc: MidiaParaCopia): Array<{ chave: string; tipo?: string | null }> {
  const saida: Array<{ chave: string; tipo?: string | null }> = []
  const vistas = new Set<string>()
  const junta = (chave?: string | null, tipo?: string | null) => {
    if (!chave || vistas.has(chave)) return
    vistas.add(chave)
    saida.push({ chave, tipo: tipo ?? undefined })
  }
  junta(doc.filename, doc.mimeType)
  for (const d of Object.values(doc.sizes ?? {})) junta(d?.filename, d?.mimeType)
  return saida.map(({ chave, tipo }) => (tipo ? { chave, tipo } : { chave }))
}

const OBRIGATORIAS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const

/**
 * Cliente do bucket a partir das variáveis `R2_*` — que moram só no `.env` da VPS
 * (docs/runbooks/r2-por-instancia.md). `R2_ENDPOINT` existe para desenvolvimento e CI
 * apontarem para um MinIO local; em produção o endpoint sai da conta.
 */
export function clienteR2(env: Record<string, string | undefined>): { s3: S3Client; bucket: string; endpoint: string } {
  const faltando = OBRIGATORIAS.filter((v) => !env[v]?.trim())
  if (faltando.length) throw new Error(`faltam variáveis do bucket: ${faltando.join(', ')}`)
  const endpoint = endpointR2(env)
  const s3 = new S3Client({
    endpoint,
    region: 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
  })
  return { s3, bucket: env.R2_BUCKET!, endpoint }
}

export interface Relatorio {
  registros: number
  arquivos: number
  ok: number
  pulados: number
  /** só no `--dry`: o que uma rodada de verdade enviaria */
  aEnviar: number
  falhas: Array<{ chave: string; motivo: string }>
  /** citados no registro e ausentes do disco: já quebrados no site, a cópia não conserta */
  ausentes: string[]
  /**
   * arquivos citados por MAIS de um registro. Enviados uma vez só. Medido no acervo: duas
   * originais de mesmo nome em formatos diferentes geram a mesma miniatura, e a segunda
   * sobrescreveu a primeira no disco — defeito antigo, que o relatório mostra
   */
  compartilhados: string[]
}

const naoExiste = (e: unknown) => {
  const x = e as { name?: string; $metadata?: { httpStatusCode?: number } }
  return x?.name === 'NotFound' || x?.$metadata?.httpStatusCode === 404
}

/** Tamanho do objeto no bucket, ou `null` se ele não existe. Outro erro sobe. */
async function tamanhoNoDestino(s3: BucketS3, bucket: string, chave: string): Promise<number | null> {
  try {
    const r = (await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: chave }))) as { ContentLength?: number }
    return r.ContentLength ?? null
  } catch (e) {
    if (naoExiste(e)) return null
    throw e
  }
}

/** Roda `fn` sobre os itens com no máximo `n` ao mesmo tempo. */
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

export async function copiaAcervo(opts: {
  paginas: AsyncIterable<MidiaParaCopia[]>
  dir: string
  s3: BucketS3
  bucket: string
  dry: boolean
  concorrencia: number
}): Promise<Relatorio> {
  const { dir, s3, bucket, dry, concorrencia } = opts
  const raiz = resolve(dir)
  const r: Relatorio = { registros: 0, arquivos: 0, ok: 0, pulados: 0, aEnviar: 0, falhas: [], ausentes: [], compartilhados: [] }
  /** chaves já vistas NA RODADA — `chavesDaMidia` só deduplica dentro de um registro */
  const vistas = new Set<string>()
  const compartilhadas = new Set<string>()

  const copiaUm = async ({ chave, tipo }: { chave: string; tipo?: string | null }) => {
    const local = resolve(raiz, chave)
    const rel = relative(raiz, local)
    if (rel.startsWith('..') || rel.startsWith(sep) || rel === '') {
      r.falhas.push({ chave, motivo: 'chave aponta para fora da pasta de mídia' })
      return
    }
    let tamanho: number
    try {
      tamanho = (await stat(local)).size
    } catch {
      r.ausentes.push(chave)
      return
    }
    try {
      if ((await tamanhoNoDestino(s3, bucket, chave)) === tamanho) {
        r.pulados += 1
        return
      }
      if (dry) {
        r.aEnviar += 1
        return
      }
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: chave,
          Body: await readFile(local),
          ContentLength: tamanho,
          ...(tipo ? { ContentType: tipo } : {}),
        }),
      )
      const conferido = await tamanhoNoDestino(s3, bucket, chave)
      if (conferido === tamanho) r.ok += 1
      else r.falhas.push({ chave, motivo: `não está no destino depois do envio (HEAD: ${conferido ?? 'ausente'}, disco: ${tamanho})` })
    } catch (e) {
      r.falhas.push({ chave, motivo: e instanceof Error ? e.message : String(e) })
    }
  }

  for await (const pagina of opts.paginas) {
    r.registros += pagina.length
    const chaves = pagina.flatMap(chavesDaMidia).filter(({ chave }) => {
      if (!vistas.has(chave)) {
        vistas.add(chave)
        return true
      }
      compartilhadas.add(chave)
      return false
    })
    r.arquivos += chaves.length
    await emParalelo(chaves, concorrencia, copiaUm)
  }
  r.ausentes.sort()
  r.compartilhados = [...compartilhadas].sort()
  return r
}
