/**
 * PRD 18 RF3 — a cópia do acervo para o bucket, sem banco e sem rede.
 *
 * O bucket aqui é um mapa em memória que responde aos dois comandos que a cópia usa
 * (`HeadObject` e `PutObject`). O teste de integração (`tests/int/copia-r2.int.spec.ts`)
 * repete o essencial contra um MinIO de verdade, com o SDK de verdade.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { chavesDaMidia, clienteR2, copiaAcervo, type BucketS3 } from '../src/lib/copia-r2'

/** Bucket falso. `perde` simula envio que não chega: o PUT responde, o arquivo não fica. */
function bucketFalso({ perde = new Set<string>() } = {}) {
  const objetos = new Map<string, { tamanho: number; tipo?: string }>()
  const puts: string[] = []
  const s3: BucketS3 = {
    async send(cmd: unknown) {
      if (cmd instanceof HeadObjectCommand) {
        const o = objetos.get(cmd.input.Key!)
        if (!o) throw Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } })
        return { ContentLength: o.tamanho, ContentType: o.tipo }
      }
      if (cmd instanceof PutObjectCommand) {
        const chave = cmd.input.Key!
        puts.push(chave)
        if (!perde.has(chave)) {
          const corpo = cmd.input.Body as Buffer
          objetos.set(chave, { tamanho: corpo.byteLength, tipo: cmd.input.ContentType })
        }
        return {}
      }
      throw new Error('comando inesperado')
    },
  }
  return { s3, objetos, puts }
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'copia-r2-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const arquivo = (nome: string, bytes: number) => writeFileSync(join(dir, nome), Buffer.alloc(bytes, 7))

const doc = (filename: string, sizes: Record<string, { filename: string | null; mimeType?: string }> = {}) => ({
  id: filename,
  filename,
  mimeType: 'image/webp',
  sizes,
})

async function* paginas(...lotes: Array<Array<ReturnType<typeof doc>>>) {
  for (const l of lotes) yield l
}

describe('chavesDaMidia — o que um registro manda para o bucket', () => {
  it('a original e cada derivado, sob a MESMA chave do disco, com o tipo de cada um', () => {
    const chaves = chavesDaMidia({
      filename: 'capa.webp',
      mimeType: 'image/webp',
      sizes: {
        cartao: { filename: 'capa-640x360.avif', mimeType: 'image/avif' },
        og: { filename: 'capa-1200x630.jpg', mimeType: 'image/jpeg' },
        capa: { filename: null },
      },
    })
    expect(chaves).toEqual([
      { chave: 'capa.webp', tipo: 'image/webp' },
      { chave: 'capa-640x360.avif', tipo: 'image/avif' },
      { chave: 'capa-1200x630.jpg', tipo: 'image/jpeg' },
    ])
  })

  it('registro sem arquivo não gera chave', () => {
    expect(chavesDaMidia({ filename: null })).toEqual([])
  })
})

describe('clienteR2 — as variáveis do bucket', () => {
  it('sem as variáveis, falha dizendo QUAIS faltam', () => {
    expect(() => clienteR2({ R2_BUCKET: 'b' })).toThrow(/R2_ACCOUNT_ID.*R2_ACCESS_KEY_ID.*R2_SECRET_ACCESS_KEY/)
  })

  it('o endpoint é o do R2 da conta; R2_ENDPOINT só troca por um MinIO local', async () => {
    const env = { R2_ACCOUNT_ID: 'conta', R2_ACCESS_KEY_ID: 'a', R2_SECRET_ACCESS_KEY: 's', R2_BUCKET: 'b' }
    const r2 = clienteR2(env)
    expect(r2.endpoint).toBe('https://conta.r2.cloudflarestorage.com')
    expect(r2.bucket).toBe('b')
    expect(clienteR2({ ...env, R2_ENDPOINT: 'http://127.0.0.1:9000' }).endpoint).toBe('http://127.0.0.1:9000')
  })
})

describe('copiaAcervo — cópia idempotente', () => {
  it('envia original e derivados, confere cada um no destino, e a segunda rodada só pula', async () => {
    arquivo('a.webp', 100)
    arquivo('a-640x360.avif', 30)
    arquivo('b.webp', 50)
    const { s3, objetos } = bucketFalso()
    const lotes = () => paginas([doc('a.webp', { cartao: { filename: 'a-640x360.avif', mimeType: 'image/avif' } })], [doc('b.webp')])

    const primeira = await copiaAcervo({ paginas: lotes(), dir, s3, bucket: 'b', dry: false, concorrencia: 2 })
    expect(primeira).toMatchObject({ registros: 2, arquivos: 3, ok: 3, pulados: 0, falhas: [], ausentes: [] })
    expect(objetos.get('a.webp')).toEqual({ tamanho: 100, tipo: 'image/webp' })
    expect(objetos.get('a-640x360.avif')).toEqual({ tamanho: 30, tipo: 'image/avif' })

    const segunda = await copiaAcervo({ paginas: lotes(), dir, s3, bucket: 'b', dry: false, concorrencia: 2 })
    expect(segunda).toMatchObject({ ok: 0, pulados: 3, falhas: [] })
  })

  it('--dry não escreve nada e diz quantos iria enviar', async () => {
    arquivo('a.webp', 100)
    arquivo('b.webp', 50)
    const { s3, puts } = bucketFalso()
    const r = await copiaAcervo({ paginas: paginas([doc('a.webp'), doc('b.webp')]), dir, s3, bucket: 'b', dry: true, concorrencia: 2 })
    expect(puts).toEqual([])
    expect(r).toMatchObject({ arquivos: 2, aEnviar: 2, ok: 0, pulados: 0 })
  })

  it('arquivo que o registro cita e o disco não tem é AUSENTE, não falha de envio', async () => {
    // já está quebrado no site hoje; copiar não conserta, e travar a cópia por isso
    // prenderia o RF1 num problema que não é dela
    const { s3 } = bucketFalso()
    const r = await copiaAcervo({ paginas: paginas([doc('sumiu.webp')]), dir, s3, bucket: 'b', dry: false, concorrencia: 1 })
    expect(r).toMatchObject({ ok: 0, falhas: [], ausentes: ['sumiu.webp'] })
  })

  it('objeto no destino com tamanho diferente é reenviado', async () => {
    arquivo('a.webp', 100)
    const { s3, objetos } = bucketFalso()
    objetos.set('a.webp', { tamanho: 99 })
    const r = await copiaAcervo({ paginas: paginas([doc('a.webp')]), dir, s3, bucket: 'b', dry: false, concorrencia: 1 })
    expect(r).toMatchObject({ ok: 1, pulados: 0 })
    expect(objetos.get('a.webp')?.tamanho).toBe(100)
  })

  it('envio que não aparece no HEAD depois é falha — o PUT responder não basta', async () => {
    arquivo('a.webp', 100)
    const { s3 } = bucketFalso({ perde: new Set(['a.webp']) })
    const r = await copiaAcervo({ paginas: paginas([doc('a.webp')]), dir, s3, bucket: 'b', dry: false, concorrencia: 1 })
    expect(r.ok).toBe(0)
    expect(r.falhas).toEqual([{ chave: 'a.webp', motivo: expect.stringMatching(/não está no destino/) }])
  })

  it('arquivo citado por dois registros é enviado UMA vez e aparece como compartilhado', async () => {
    // medido no acervo: duas originais de mesmo nome em formatos diferentes geram a mesma
    // miniatura (`hostgator-cover-640x336.avif`), e os dois registros apontam para ela
    arquivo('a.webp', 100)
    arquivo('a.png', 90)
    arquivo('a-640x336.avif', 30)
    const { s3, puts } = bucketFalso()
    const cartao = { cartao: { filename: 'a-640x336.avif', mimeType: 'image/avif' } }
    const r = await copiaAcervo({
      paginas: paginas([doc('a.webp', cartao)], [doc('a.png', cartao)]),
      dir,
      s3,
      bucket: 'b',
      dry: false,
      concorrencia: 4,
    })
    expect(puts.filter((k) => k === 'a-640x336.avif')).toHaveLength(1)
    expect(r).toMatchObject({ arquivos: 3, ok: 3, pulados: 0, compartilhados: ['a-640x336.avif'] })
  })

  it('chave que escaparia da pasta de mídia é recusada', async () => {
    mkdirSync(join(dir, 'sub'))
    const { s3, puts } = bucketFalso()
    const r = await copiaAcervo({ paginas: paginas([doc('../fora.webp')]), dir: join(dir, 'sub'), s3, bucket: 'b', dry: false, concorrencia: 1 })
    expect(puts).toEqual([])
    expect(r.falhas).toEqual([{ chave: '../fora.webp', motivo: expect.stringMatching(/fora da pasta/) }])
  })
})
