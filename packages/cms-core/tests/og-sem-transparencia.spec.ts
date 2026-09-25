/**
 * PRD 18 RF5 / PRD 24 RF2 — o `og` de imagem transparente sai com fundo branco, em Node.
 *
 * A RF2 tirou do hook o `node:fs` e o `import` do `sharp` (a coleção `midia` também sobe num
 * Worker): o original vem de `req.file.data` e o `sharp` é o da config. Estes casos rodam com
 * o `sharp` de verdade; a saída byte a byte foi conferida contra a versão anterior do hook
 * (18 combinações de imagem e ponto focal, mesmo sha256) quando a RF2 entrou.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { CollectionBeforeChangeHook } from 'payload'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { Midia } from '../src/collections/Midia'
import { ogSemTransparencia } from '../src/hooks/og-sem-transparencia'

/** Um PNG com a faixa da esquerda (35% da largura) totalmente transparente, ou nenhuma. */
async function png(largura: number, altura: number, transparente: boolean) {
  const raw = Buffer.alloc(largura * altura * 4)
  for (let y = 0; y < altura; y++)
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 4
      raw[i] = 200
      raw[i + 1] = 40
      raw[i + 2] = 40
      raw[i + 3] = transparente && x < largura * 0.35 ? 0 : 255
    }
  return sharp(raw, { raw: { width: largura, height: altura, channels: 4 } }).png().toBuffer()
}

function argumentos(original: Buffer, config: { sharp?: unknown }) {
  const gerado = Buffer.from('o og que o Payload gerou')
  const data = { focalX: 50, focalY: 50, sizes: { og: { filename: 'x-1200x630.jpg', filesize: gerado.length, width: 1200, height: 630, mimeType: 'image/jpeg' } } }
  const req = { file: { data: original, mimetype: 'image/png', name: 'x.png', size: original.length }, payloadUploadSizes: { og: gerado }, payload: { config } }
  return { args: { collection: Midia, data, req } as unknown as Parameters<CollectionBeforeChangeHook>[0], data, req, gerado }
}

describe('ogSemTransparencia', () => {
  it('imagem com pixel transparente: refaz o og 1200×630 em JPEG com a área transparente BRANCA, e atualiza o filesize', async () => {
    const { args, data, req, gerado } = argumentos(await png(1536, 1024, true), { sharp })
    await ogSemTransparencia(args)

    const og = req.payloadUploadSizes.og
    expect(og).not.toBe(gerado)
    const meta = await sharp(og).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1200, 630])
    // o canto esquerdo era transparente: branco (não preto); o direito, a cor da imagem
    const { data: px } = await sharp(og).raw().toBuffer({ resolveWithObject: true })
    expect([...px.subarray(0, 3)].every((c) => c > 245)).toBe(true)
    const direita = (1199 + 0 * 1200) * 3
    expect(px[direita]! > 180 && px[direita + 1]! < 70).toBe(true)
    expect(data.sizes.og).toEqual({ filename: 'x-1200x630.jpg', filesize: og.length, width: 1200, height: 630, mimeType: 'image/jpeg' })
  })

  it('imagem sem pixel transparente (mesmo com canal alfa): o og do Payload fica', async () => {
    const { args, data, req, gerado } = argumentos(await png(800, 600, false), { sharp })
    const antes = structuredClone(data)
    await ogSemTransparencia(args)
    expect(req.payloadUploadSizes.og).toBe(gerado)
    expect(data).toEqual(antes)
  })

  it('config sem sharp (num Worker): não faz nada — o og veio do gerador, já sobre branco', async () => {
    const { args, data, req, gerado } = argumentos(await png(1536, 1024, true), {})
    const antes = structuredClone(data)
    await ogSemTransparencia(args)
    expect(req.payloadUploadSizes.og).toBe(gerado)
    expect(data).toEqual(antes)
  })

  it('o caminho que a coleção midia carrega não importa node:fs nem o sharp (só o tipo)', () => {
    for (const arquivo of ['collections/Midia.ts', 'hooks/og-sem-transparencia.ts', 'midia/derivados.ts', 'midia/derivados-sharp.ts', 'midia/derivados-sem-sharp.ts']) {
      const fonte = readFileSync(join(import.meta.dirname, '../src', arquivo), 'utf8')
      expect(fonte, arquivo).not.toMatch(/from 'node:fs|from 'fs|require\(/)
      expect(fonte, arquivo).not.toMatch(/^import (?!type )[^\n]*from 'sharp'/m)
    }
  })
})
