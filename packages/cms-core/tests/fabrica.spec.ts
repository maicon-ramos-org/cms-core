/**
 * O que a fábrica DEDUZ das coleções que recebe (PRD 17 RF1).
 *
 * Antes da fábrica, o `payload.config` do site listava à mão quais coleções são do tenant e
 * quais ganham SEO. Com o núcleo, o plugin (afiliado) e o site entregando coleções cada um
 * pelo seu lado, lista à mão vira lista desatualizada: a coleção é quem diz o que é.
 * - do tenant: TODA coleção, menos `tenants` e `users`. A que já traz o próprio campo de
 *   tenant (o catálogo físico, ADR-0010) marca `custom.tenantCampoProprio`;
 * - SEO: a que marca `custom.seo`.
 */
import type { CollectionConfig } from 'payload'
import { describe, expect, it } from 'vitest'

import { colecoesComSeo, colecoesDoTenant } from '../src/fabrica'

const c = (slug: string, custom?: CollectionConfig['custom']): CollectionConfig => ({ slug, fields: [], ...(custom ? { custom } : {}) })

describe('colecoesDoTenant', () => {
  it('toda coleção é do tenant, menos tenants e users', () => {
    expect(colecoesDoTenant([c('tenants'), c('users'), c('posts'), c('midia')])).toEqual({ posts: {}, midia: {} })
  })

  it('a coleção que traz o próprio campo de tenant pede customTenantField', () => {
    expect(colecoesDoTenant([c('posts'), c('produtos_fisicos', { tenantCampoProprio: true })])).toEqual({
      posts: {},
      produtos_fisicos: { customTenantField: true },
    })
  })
})

describe('colecoesComSeo', () => {
  it('só as que marcam custom.seo, na ordem em que chegam', () => {
    expect(colecoesComSeo([c('posts', { seo: true }), c('midia'), c('pages', { seo: true }), c('tags', { seo: false })])).toEqual([
      'posts',
      'pages',
    ])
  })
})
