/**
 * PRD 18 RF3 — a cópia contra um servidor S3 de verdade (MinIO), com o SDK de verdade.
 *
 * O teste unitário (`tests/copia-r2.spec.ts`) cobre as decisões com um bucket falso; este
 * prova o que o falso não prova: que o cliente montado por `clienteR2` (path-style,
 * `region: 'auto'`, tamanho declarado) conversa com a API S3, que o tipo do arquivo chega
 * no objeto, e que a segunda rodada é 100% pulada.
 *
 * Variáveis PRÓPRIAS (`MINIO_*`), nunca as `R2_*`: teste não pode escrever no bucket de
 * produção por engano. Local: `docker compose up -d minio` e
 *   MINIO_ENDPOINT=http://127.0.0.1:9000 MINIO_USUARIO=<usuário> MINIO_SENHA=<senha>
 * No CI o MinIO sobe no job, e sem ele o teste REPROVA em vez de pular.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { clienteR2, copiaAcervo } from '../../src/lib/copia-r2'

const ENDPOINT = process.env.MINIO_ENDPOINT
const semMinio = !ENDPOINT

describe('copia-r2 contra MinIO', () => {
  it.runIf(semMinio && process.env.CI)('no CI o MinIO é obrigatório — sem ele este teste não pode pular calado', () => {
    expect(ENDPOINT, 'MINIO_ENDPOINT ausente no CI').toBeTruthy()
  })

  describe.skipIf(semMinio)('com o servidor', () => {
    const bucket = `teste-copia-${Date.now()}`
    const r2 = semMinio
      ? null
      : clienteR2({
          R2_ACCOUNT_ID: 'minio-local',
          R2_ACCESS_KEY_ID: process.env.MINIO_USUARIO,
          R2_SECRET_ACCESS_KEY: process.env.MINIO_SENHA,
          R2_BUCKET: bucket,
          R2_ENDPOINT: ENDPOINT,
        })
    let dir: string

    beforeAll(async () => {
      dir = mkdtempSync(join(tmpdir(), 'copia-r2-int-'))
      writeFileSync(join(dir, 'capa.webp'), Buffer.alloc(2048, 1))
      writeFileSync(join(dir, 'capa-640x360.avif'), Buffer.alloc(512, 2))
      await r2!.s3.send(new CreateBucketCommand({ Bucket: bucket }))
    })

    afterAll(async () => {
      rmSync(dir, { recursive: true, force: true })
      if (!r2) return
      const lista = await r2.s3.send(new ListObjectsV2Command({ Bucket: bucket }))
      for (const o of lista.Contents ?? []) await r2.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: o.Key! }))
      await r2.s3.send(new DeleteBucketCommand({ Bucket: bucket }))
    })

    async function* acervo() {
      yield [
        {
          filename: 'capa.webp',
          mimeType: 'image/webp',
          sizes: { cartao: { filename: 'capa-640x360.avif', mimeType: 'image/avif' } },
        },
      ]
    }
    const copia = (dry: boolean) =>
      copiaAcervo({ paginas: acervo(), dir, s3: r2!.s3, bucket, dry, concorrencia: 4 })

    it('--dry conta o que enviaria e não escreve nada', async () => {
      expect(await copia(true)).toMatchObject({ arquivos: 2, aEnviar: 2, ok: 0, falhas: [] })
      const lista = await r2!.s3.send(new ListObjectsV2Command({ Bucket: bucket }))
      expect(lista.KeyCount ?? 0).toBe(0)
    })

    it('a rodada real envia original e derivado sob a mesma chave, com tamanho e tipo', async () => {
      expect(await copia(false)).toMatchObject({ ok: 2, pulados: 0, falhas: [], ausentes: [] })
      const capa = await r2!.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: 'capa.webp' }))
      expect(capa.ContentLength).toBe(2048)
      expect(capa.ContentType).toBe('image/webp')
      const cartao = await r2!.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: 'capa-640x360.avif' }))
      expect(cartao.ContentType).toBe('image/avif')
    })

    it('a segunda rodada é 100% pulada — zero alteração', async () => {
      expect(await copia(false)).toMatchObject({ ok: 0, pulados: 2, falhas: [] })
    })
  })
})
