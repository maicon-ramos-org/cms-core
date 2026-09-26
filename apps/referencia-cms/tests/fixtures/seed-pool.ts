/** CLI descartável: o monitor do Pool Node termina com este processo, nunca com SQL forçado. */
import { fileURLToPath } from 'node:url'
import { afiliado } from '@maicon-ramos-org/afiliado/cms'
import { cmsCore } from '@maicon-ramos-org/cms-core'
import { mantemVivo, sair } from '@maicon-ramos-org/cms-core/scripts'
import { getPayload } from 'payload'
import { VALORES_CLAIM, valorNoWire } from '../../../../packages/cms-core/tests/fixtures/claims-valores'
import { claimsJsonFixture } from '../../src/claims-json-fixture'

const encerra = mantemVivo()
async function semeiaFixture(): Promise<void> {
  const banco = new URL(process.env.DATABASE_URL!)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(banco.hostname)
    || !/^\/cms_core_pool_opennext_[a-f0-9]{32}$/.test(banco.pathname)) throw new Error('Banco da fixture inválido.')
  const config = await cmsCore({
    raiz: fileURLToPath(new URL('../../src', import.meta.url)), db: { connectionString: banco.toString() },
    logger: { options: { level: 'silent' } },
    plugins: [afiliado(), claimsJsonFixture, c => ({ ...c, typescript: { ...c.typescript, autoGenerate: false } })],
    midia: { r2: { bucket: 'fixture-pool', endpoint: 'https://bucket.invalid', publicBase: 'https://media.invalid',
      credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' } } },
  })
  const payload = await getPayload({ config, key: banco.pathname, disableOnInit: true })
  const padrao = { tema: { cor_primaria: '#6F57D3', cor_fundo: '#ffffff' },
    autolinker: { max_links_pagina: 3 }, seo: { title_pattern_loja: '{loja}' } }
  const a = await payload.create({ collection: 'tenants', data: { nome: 'Fixture A', slug: 'fixture-a', canonical_host: 'a.fixture.test', ...padrao } })
  await payload.create({ collection: 'tenants', data: { nome: 'Fixture B', slug: 'fixture-b', canonical_host: 'b.fixture.test', ...padrao } })
  await payload.create({ collection: 'users', data: { email: 'pool@fixture.test', nome: 'Fixture isolada', password: 'senha-fixture',
    roles: ['sistema'], tenants: [{ tenant: a.id }], enableAPIKey: true, apiKey: 'pool-opennext-fixture-a' } })
  await payload.create({ collection: 'users', data: { email: 'claims@fixture.test', nome: 'Agente da fixture', password: 'senha-fixture',
    roles: ['agente'], tenants: [{ tenant: a.id }], enableAPIKey: true, apiKey: 'claims-opennext-fixture-a' } })
  const claims = []
  for (const [nome, valor] of VALORES_CLAIM) {
    const doc = await payload.create({ collection: 'claims' as never, data: { tenant: a.id,
      texto: 'Texto inicial', origem: `fixture:${nome}`, valor: valorNoWire(valor), outro_json: { texto: '12', numero: 12 } } as never }) as { id: number }
    const versoes = await payload.findVersions({ collection: 'claims' as never, where: { parent: { equals: doc.id } }, limit: 1 })
    claims.push({ id: doc.id, versao: versoes.docs[0]!.id, nome })
  }
  await payload.destroy()
  console.log('FIXTURE_POOL=' + JSON.stringify({ tenantA: a.id, claims }))
}
semeiaFixture().then(async () => { encerra(); await sair(0) }).catch(async () => {
  // O chamador só recebe falha fixa, nunca corpo do provedor, SQL ou credencial.
  console.error('Falha ao preparar fixture local de pool.')
  encerra()
  await sair(1)
})
