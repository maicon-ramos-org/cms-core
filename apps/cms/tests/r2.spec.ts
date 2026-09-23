/**
 * PRD 18 RF1/RF2 — a configuração do bucket e o endereço público de cada arquivo.
 *
 * RF1: sem as variáveis, o CMS NÃO sobe, e diz quais faltam — degradar para o disco em
 * silêncio esconderia um acervo partido entre disco e bucket.
 * RF2: o endereço da imagem é `${R2_PUBLIC_BASE}/{chave}`, e a chave é o mesmo nome de
 * arquivo que a cópia do RF3 usou.
 */
import { describe, expect, it } from 'vitest'

import { configR2, urlPublica } from '../src/lib/r2'

const completo = {
  R2_ACCOUNT_ID: 'conta',
  R2_ACCESS_KEY_ID: 'chave',
  R2_SECRET_ACCESS_KEY: 'segredo',
  R2_BUCKET: 'exemplo-media',
  R2_PUBLIC_BASE: 'https://media.exemplo.test',
}

describe('configR2 — o CMS não sobe sem o bucket (RF1)', () => {
  it('sem variável nenhuma, a mensagem lista as cinco', () => {
    expect(() => configR2({})).toThrow(
      'faltam variáveis do bucket: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE',
    )
  })

  it('variável só com espaço conta como ausente', () => {
    expect(() => configR2({ ...completo, R2_BUCKET: '  ' })).toThrow(/R2_BUCKET/)
  })

  it('R2_PUBLIC_BASE precisa ser URL https absoluta — senão a página aponta para um caminho relativo', () => {
    expect(() => configR2({ ...completo, R2_PUBLIC_BASE: 'media.exemplo.test' })).toThrow(/R2_PUBLIC_BASE/)
    expect(() => configR2({ ...completo, R2_PUBLIC_BASE: 'http://media.exemplo.test' })).toThrow(/https/)
  })

  it('completo: endpoint da conta, região auto, e a base pública sem barra no fim', () => {
    expect(configR2({ ...completo, R2_PUBLIC_BASE: 'https://media.exemplo.test/' })).toEqual({
      bucket: 'exemplo-media',
      endpoint: 'https://conta.r2.cloudflarestorage.com',
      credentials: { accessKeyId: 'chave', secretAccessKey: 'segredo' },
      publicBase: 'https://media.exemplo.test',
    })
  })

  it('R2_ENDPOINT (só desenvolvimento e CI, MinIO) troca o endpoint e aceita base http local', () => {
    const r = configR2({ ...completo, R2_ENDPOINT: 'http://127.0.0.1:9000', R2_PUBLIC_BASE: 'http://127.0.0.1:9000/exemplo-media' })
    expect(r.endpoint).toBe('http://127.0.0.1:9000')
    expect(r.publicBase).toBe('http://127.0.0.1:9000/exemplo-media')
  })
})

describe('urlPublica — o endereço da imagem (RF2)', () => {
  it('base + nome do arquivo, o mesmo nome que a cópia usou como chave', () => {
    expect(urlPublica('https://media.exemplo.test', 'capa-640x360.avif')).toBe('https://media.exemplo.test/capa-640x360.avif')
  })

  it('nome com espaço ou acento sai codificado, como o navegador pede', () => {
    expect(urlPublica('https://media.exemplo.test', 'foto nova ção.png')).toBe('https://media.exemplo.test/foto%20nova%20%C3%A7%C3%A3o.png')
  })
})
