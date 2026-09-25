/**
 * PRD 24 RF3 — o tema e o afiliado rodam em Node (VPS) e em Workers (Cloudflare). O que
 * muda entre os dois mora em `lib/ambiente.ts`: de onde vem uma variável, de onde vem o IP
 * de quem pede, e como se purga o cache da borda. Em Node, o comportamento tem que ser o de
 * antes, byte a byte.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ipDoCliente, leDasFontes, purgaDaCloudflare, variavel } from '../../src/lib/ambiente'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('variavel', () => {
  it('lê do ambiente do processo, com nome dinâmico (o `id_afiliado_env` do tenant)', () => {
    vi.stubEnv('AFF_PROGRAMA_DE_TESTE', 'id-123')
    const nome = ['AFF', 'PROGRAMA', 'DE', 'TESTE'].join('_')
    expect(variavel(nome)).toBe('id-123')
  })

  it('ausente devolve undefined — quem chama decide o padrão, como com `?? padrão` antes', () => {
    expect(variavel('VARIAVEL_QUE_NINGUEM_DEFINIU_RF3')).toBeUndefined()
  })

  it('string vazia é valor, não ausência (um sufixo vazio desliga os da config)', () => {
    vi.stubEnv('HOST_SUFIXOS_TENANT', '')
    expect(variavel('HOST_SUFIXOS_TENANT')).toBe('')
  })
})

describe('leDasFontes (a regra de `variavel`, com as fontes explícitas)', () => {
  it('o processo vence o import.meta.env', () => {
    expect(leDasFontes('X', { X: 'do-processo' }, { X: 'do-vite' })).toBe('do-processo')
  })
  it('sem a variável no processo, cai no import.meta.env', () => {
    expect(leDasFontes('X', {}, { X: 'do-vite' })).toBe('do-vite')
  })
  it('sem `process` (Worker sem nodejs_compat), só o import.meta.env', () => {
    expect(leDasFontes('X', undefined, { X: 'do-vite' })).toBe('do-vite')
  })
  it('valor que não é string no import.meta.env (DEV, PROD, SSR) não é variável', () => {
    expect(leDasFontes('DEV', {}, { DEV: true })).toBeUndefined()
  })
  it('vazio no processo não cai no import.meta.env', () => {
    expect(leDasFontes('X', { X: '' }, { X: 'do-vite' })).toBe('')
  })
  it('nenhuma das duas fontes: undefined', () => {
    expect(leDasFontes('X', undefined, undefined)).toBeUndefined()
  })
})

/** Um `context` do Astro com o que `ipDoCliente` lê. */
const contexto = (clientAddress: () => string | undefined, headers: Record<string, string> = {}) => ({
  get clientAddress() {
    return clientAddress() as string
  },
  request: new Request('https://exemplo.test/r/c1', { headers }),
})

describe('ipDoCliente', () => {
  it('o `clientAddress` do adaptador vence (Node: o de sempre)', () => {
    const c = contexto(() => '203.0.113.7', { 'cf-connecting-ip': '198.51.100.1' })
    expect(ipDoCliente(c)).toBe('203.0.113.7')
  })

  it('adaptador sem `clientAddress` (o Astro lança): cai no cf-connecting-ip', () => {
    const c = contexto(
      () => {
        throw new Error('ClientAddressNotAvailable')
      },
      { 'cf-connecting-ip': '198.51.100.1' },
    )
    expect(ipDoCliente(c)).toBe('198.51.100.1')
  })

  it('`clientAddress` vazio também cai no cabeçalho, e IPv6 passa', () => {
    const c = contexto(() => '', { 'cf-connecting-ip': '2001:db8::1' })
    expect(ipDoCliente(c)).toBe('2001:db8::1')
  })

  it('cabeçalho que não é IP não vira hash de ninguém', () => {
    const c = contexto(() => undefined, { 'cf-connecting-ip': '<script>' })
    expect(ipDoCliente(c)).toBeUndefined()
  })

  it('nada disponível: undefined (o clique é logado sem ip_hash, como hoje)', () => {
    expect(ipDoCliente(contexto(() => undefined))).toBeUndefined()
  })
})

describe('purgaDaCloudflare', () => {
  it('em Node não existe: null, sem tentar importar nada da Cloudflare', async () => {
    expect(await purgaDaCloudflare()).toBeNull()
  })

  it('num runtime que se diz Worker mas não tem o módulo, também null (nunca lança)', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' })
    expect(await purgaDaCloudflare()).toBeNull()
  })
})
