/**
 * PRD 18 RF1/RF2 — a configuração do bucket e o endereço público de cada arquivo.
 *
 * RF1: sem as variáveis, o CMS NÃO sobe, e diz quais faltam — degradar para o disco em
 * silêncio esconderia um acervo partido entre disco e bucket.
 * RF2: o endereço da imagem é `${R2_PUBLIC_BASE}/{chave}`, e a chave é o mesmo nome de
 * arquivo que a cópia do RF3 usou.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { configR2, configR2DaExecucao, urlPublica } from '../src/lib/r2'

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

describe('configR2DaExecucao — o build do Next não é execução', () => {
  /*
   * O `next build` carrega o payload.config para coletar os dados de `/admin/[[...segments]]`,
   * e dentro do build da imagem Docker não existe R2_* nenhuma — elas moram só no .env da
   * VPS e chegam em EXECUÇÃO, pelo compose. Foi o que quebrou o build da imagem depois da #73.
   * Falhar fechado continua valendo onde importa: servidor subindo, `pnpm migrate`, scripts.
   */
  const BUILD = { NEXT_PHASE: 'phase-production-build' }

  it('no build do Next, sem as variáveis, não lança — devolve uma config que não aponta para nada real', () => {
    const r = configR2DaExecucao(BUILD)
    expect(r.publicBase).toBe('https://build.invalid')
    expect(r.endpoint).toBe('https://build.invalid')
  })

  it('fora do build, sem as variáveis, lança com o nome das cinco — o CMS não sobe', () => {
    expect(() => configR2DaExecucao({})).toThrow(
      'faltam variáveis do bucket: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE',
    )
  })

  it('o servidor do Next (next start) é execução: sem as variáveis, lança', () => {
    expect(() => configR2DaExecucao({ NEXT_PHASE: 'phase-production-server' })).toThrow(/faltam variáveis do bucket/)
  })

  it('no build COM as variáveis, usa as de verdade (a exceção não mascara config presente)', () => {
    expect(configR2DaExecucao({ ...BUILD, ...completo }).publicBase).toBe('https://media.exemplo.test')
  })
})

describe('payload.config — a trava que o build da imagem pediu', () => {
  it('carrega o bucket por configR2DaExecucao, nunca pela estrita direto', () => {
    // a #73 chamou `configR2(process.env)` no topo do payload.config: o `next build` da
    // imagem (sem R2_*) quebrou. O CI não pegava — ele exporta as R2_* do MinIO e não roda
    // o `next build` do cms. Esta asserção é a trava barata.
    const fonte = readFileSync(new URL('../src/payload.config.ts', import.meta.url), 'utf8')
    expect(fonte).toMatch(/configR2DaExecucao\(process\.env\)/)
    expect(fonte).not.toMatch(/\bconfigR2\(process\.env\)/)
  })
})
