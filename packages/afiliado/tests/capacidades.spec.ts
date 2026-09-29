import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Config } from 'payload'
import { endpointCapacidades } from '../src/cms/catalogo/capacidades'
import { REGISTRO_CATEGORIAS_PADRAO } from '../src/cms/catalogo/categorias'
import { afiliado } from '../src/cms/plugin'
import { atendeCapacidades, CAPACIDADES_AFILIADO, descritorCapacidades, VERSAO_PLUGIN_AFILIADO } from '../src/conteudo'

const pacote = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const chamar = async (user: unknown) => {
  const r = await (endpointCapacidades(REGISTRO_CATEGORIAS_PADRAO).handler as any)({ user })
  return { status: r.status as number, body: await r.json(), cache: r.headers.get('cache-control') }
}

describe('contrato de capabilities do plugin de afiliado', () => {
  it('anuncia catalog/content/preflight/offer-history e a versão do pacote (sincronizada com o package.json)', () => {
    expect(CAPACIDADES_AFILIADO).toEqual({ 'affiliate.catalog': '2.0', 'affiliate.content': '1.0', 'affiliate.preflight': '1.0', 'affiliate.offer-history': '1.0' })
    expect(VERSAO_PLUGIN_AFILIADO).toBe(pacote.version)
    expect(pacote.exports['./conteudo']).toBeDefined()
  })
  it('consumidor falha fechado: ausente, versão maior, ou minor menor', () => {
    const o = CAPACIDADES_AFILIADO
    expect(atendeCapacidades(o, { 'affiliate.content': '1.0', 'affiliate.preflight': '1.0' })).toEqual({ ok: true, faltando: [], incompativeis: [] })
    expect(atendeCapacidades(o, { 'affiliate.content': '1.1' })).toMatchObject({ ok: false, incompativeis: ['affiliate.content'] })
    expect(atendeCapacidades(o, { 'affiliate.content': '2.0' })).toMatchObject({ ok: false, incompativeis: ['affiliate.content'] })
    expect(atendeCapacidades(o, { 'affiliate.services': '1.0' })).toMatchObject({ ok: false, faltando: ['affiliate.services'] })
    expect(atendeCapacidades({ 'affiliate.content': '1.5' }, { 'affiliate.content': '1.2' }).ok).toBe(true)
    expect(atendeCapacidades(undefined, { 'affiliate.content': '1.0' })).toMatchObject({ ok: false, faltando: ['affiliate.content'] })
    expect(atendeCapacidades({ toString: '1.0' } as any, { constructor: '1.0' })).toMatchObject({ ok: false, faltando: ['constructor'] })
    expect(atendeCapacidades({ 'affiliate.content': 'x' }, { 'affiliate.content': '1.0' }).ok).toBe(false)
  })
  it('descritor expõe contrato do conteúdo e categorias da instância, sem callbacks', () => {
    const d = descritorCapacidades([{ slug: 'x', rotulo: 'X', atributosDeIdentidade: ['gtin'], versaoIdentidade: 2, legada: false }])
    expect(d).toMatchObject({ plugin: 'afiliado', version: pacote.version, content: { schema: 'product_content/v1',
      limits: { metaTitle: 60, metaDescription: 155 }, statuses: ['sem_conteudo', 'rascunho', 'em_revisao', 'aprovado'] },
      catalog: { categories: [{ slug: 'x', label: 'X', identityAttributes: ['gtin'], identityVersion: 2, legacy: false }] } })
    expect(d.content.rules).toContain('no_automatic_overwrite')
    expect(() => JSON.stringify(d)).not.toThrow()
  })
  it('endpoint só responde a usuário autenticado e nunca fica em cache', async () => {
    expect(await chamar(undefined)).toMatchObject({ status: 401, cache: 'no-store' })
    expect(await chamar({ roles: ['site-reader'] })).toMatchObject({ status: 401 })
    const ok = await chamar({ roles: ['ingestao'] })
    expect(ok).toMatchObject({ status: 200, cache: 'no-store' })
    expect(ok.body.capabilities['affiliate.content']).toBe('1.0')
    expect(ok.body.catalog.categories.map((c: any) => c.slug)).toEqual(['filamento', 'impressora', 'resina', 'acessorio'])
  })
  it('o plugin registra o endpoint uma vez por montagem, sem alterar os já existentes', async () => {
    const existente = { path: '/outro', method: 'get', handler: () => new Response() }
    const c = await afiliado()({ secret: 'x', collections: [], endpoints: [existente] } as unknown as Config)
    expect(c.endpoints?.map(e => e.path)).toEqual(['/outro', '/afiliado/capabilities'])
  })
})
