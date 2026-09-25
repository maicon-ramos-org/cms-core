/**
 * PRD 24 RF3 — a entrada `web` do afiliado lê o ambiente pelo `lib/ambiente` do tema, para
 * rodar igual em Node e em Workers: o ID de afiliado pelo nome que o tenant aponta (nome
 * dinâmico), a etiqueta da Amazon, e o IP do clique (`clientAddress`, ou o
 * `cf-connecting-ip` quando o adaptador não o oferece).
 */
import { createHash } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

const cms = vi.hoisted(() => ({ doc: null as unknown, cliques: [] as Array<Record<string, unknown>> }))

vi.mock('virtual:afiliado/config', () => ({ default: {} }))
vi.mock('../src/web/lib/cms', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/web/lib/cms')>()),
  cmsFindOneNoTenant: async () => cms.doc,
  logClique: async (clique: Record<string, unknown>) => {
    cms.cliques.push(clique)
  },
}))

const { GET } = await import('../src/web/rotas/r/[id]')
const { destinoAmazon } = await import('../src/web/lib/catalogo')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  cms.doc = null
  cms.cliques = []
})

const tenant = { id: 1, slug: 'exemplo', programas_ativos: [{ programa: 'amazon', id_afiliado_env: 'AFF_EXEMPLO_RF3' }] }

function contexto(id: string, opcoes: { clientAddress?: () => string; headers?: Record<string, string> } = {}) {
  const url = new URL(`https://exemplo.test/r/${id}`)
  return {
    params: { id },
    url,
    locals: { tenant },
    request: new Request(url, { headers: opcoes.headers ?? {} }),
    get clientAddress() {
      return (opcoes.clientAddress ?? (() => '203.0.113.7'))()
    },
    redirect: (destino: string, status: number) => new Response(null, { status, headers: { location: destino } }),
  } as unknown as Parameters<typeof GET>[0]
}

const cupom = {
  id: 1,
  estado: 'publicado',
  url_afiliado_fonte: 'https://www.amazon.com.br/dp/B0ABCDEFGH',
  loja: { id: 9, slug: 'loja-exemplo', programa: 'amazon' },
}

describe('/r/{id}', () => {
  it('o ID de afiliado vem da variável que o tenant nomeia', async () => {
    vi.stubEnv('AFF_EXEMPLO_RF3', 'exemplo-20')
    cms.doc = cupom
    const r = await GET(contexto('c1'))
    expect(r.status).toBe(302)
    expect(new URL(r.headers.get('location')!).searchParams.get('tag')).toBe('exemplo-20')
  })

  it('sem a variável, redireciona para a URL fonte crua (sem comissão), como antes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('AFF_EXEMPLO_RF3', undefined)
    cms.doc = cupom
    const r = await GET(contexto('c1'))
    expect(r.headers.get('location')).toBe(cupom.url_afiliado_fonte)
  })

  it('o ip_hash do clique sai do clientAddress', async () => {
    vi.stubEnv('AFF_EXEMPLO_RF3', 'exemplo-20')
    vi.stubEnv('IP_HASH_SALT', 'sal-de-teste')
    cms.doc = cupom
    await GET(contexto('c1', { clientAddress: () => '203.0.113.7' }))
    const esperado = createHash('sha256').update('203.0.113.7sal-de-teste').digest('hex').slice(0, 32)
    expect(cms.cliques[0]?.ip_hash).toBe(esperado)
  })

  it('adaptador sem clientAddress: o ip_hash sai do cf-connecting-ip', async () => {
    vi.stubEnv('AFF_EXEMPLO_RF3', 'exemplo-20')
    vi.stubEnv('IP_HASH_SALT', 'sal-de-teste')
    cms.doc = cupom
    await GET(
      contexto('c1', {
        clientAddress: () => {
          throw new Error('ClientAddressNotAvailable')
        },
        headers: { 'cf-connecting-ip': '198.51.100.1' },
      }),
    )
    const esperado = createHash('sha256').update('198.51.100.1sal-de-teste').digest('hex').slice(0, 32)
    expect(cms.cliques[0]?.ip_hash).toBe(esperado)
  })
})

describe('destinoAmazon', () => {
  const listing = {
    id: 1,
    tenant: 1,
    variante: 1,
    loja: 1,
    estado: 'ativa',
    fonte: 'amazon-manual-sitestripe',
    external_listing_id: 'B0ABCDEFGH',
    url_origem: 'https://www.amazon.com.br/dp/B0ABCDEFGH',
    url_afiliado: 'https://www.amazon.com.br/dp/B0ABCDEFGH?tag=exemplo-20&linkCode=ll2&linkId=abc&ref_=as_li_ss_tl',
    observado_em: '2026-01-01T00:00:00.000Z',
  }

  it('a etiqueta vem do ambiente', () => {
    vi.stubEnv('AMAZON_TAG', 'exemplo-20')
    expect(destinoAmazon(listing)).toBe(listing.url_afiliado)
  })

  it('sem a etiqueta no ambiente, nenhum destino', () => {
    vi.stubEnv('AMAZON_TAG', undefined)
    expect(destinoAmazon(listing)).toBeNull()
  })
})
