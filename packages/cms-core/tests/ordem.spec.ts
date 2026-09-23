/**
 * A ordem que o site passa à fábrica (PRD 17 RF1b; decisão do dono de 2026-09-23: manter a
 * ordem de hoje). Coleções, campos de `tenants`, o grupo `tenants.seo`, as opções de
 * `pages.template` e os destinos do auto-linker chegam intercalados entre núcleo, plugin e
 * site; a ordem final é a que o site declara, e é ela que sai no menu do admin, no
 * formulário do tenant e no `payload-types.ts`.
 */
import type { CollectionConfig, Config, Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { acrescentaAoGrupoDoTenant, acrescentaCamposAoTenant, acrescentaDestinosDoAutoLinker, ajustaCampo } from '../src/extensoes'
import { aplicaOrdem, ordenaPor } from '../src/ordem'

describe('ordenaPor', () => {
  const k = (x: string) => x
  it('segue a ordem pedida', () => {
    expect(ordenaPor(['c', 'a', 'b'], ['a', 'b', 'c'], k)).toEqual(['a', 'b', 'c'])
  })
  it('o que não está na lista vai para o fim, na ordem de chegada', () => {
    expect(ordenaPor(['x', 'b', 'y', 'a'], ['a', 'b'], k)).toEqual(['a', 'b', 'x', 'y'])
  })
  it('sem lista, não mexe', () => {
    expect(ordenaPor(['c', 'a'], undefined, k)).toEqual(['c', 'a'])
  })
})

const texto = (name: string): Field => ({ name, type: 'text' })
const colecao = (slug: string, fields: Field[] = []): CollectionConfig => ({ slug, fields })
const base = (): Config =>
  ({
    collections: [
      colecao('tenants', [texto('slug'), texto('nome'), { name: 'seo', type: 'group', fields: [texto('gsc_property')] }]),
      colecao('users'),
      colecao('posts'),
      colecao('pages', [{ name: 'template', type: 'select', options: ['conteudo', 'institucional', 'apps'] }]),
      colecao('link_rules', [{ name: 'destino', type: 'relationship', relationTo: ['posts', 'pages'] }]),
      colecao('links_gerados', [{ name: 'destino', type: 'relationship', relationTo: ['posts', 'pages'] }]),
    ],
  }) as Config

const nomes = (fields: Field[] = []) => fields.map((f) => ('name' in f ? f.name : '?'))
const achar = (c: Config, slug: string) => c.collections!.find((x) => x.slug === slug)!
const destinos = (c: Config, slug: string) => (achar(c, slug).fields.find((f) => 'name' in f && f.name === 'destino') as { relationTo: string[] }).relationTo

describe('ajudantes para plugin', () => {
  it('acrescentam campo ao tenant, ao grupo seo e destino às duas coleções do auto-linker', () => {
    let c = base()
    c = acrescentaCamposAoTenant(c, [texto('programas_ativos')])
    c = acrescentaAoGrupoDoTenant(c, 'seo', [texto('title_pattern_loja')])
    c = acrescentaDestinosDoAutoLinker(c, ['lojas', 'ofertas'])
    expect(nomes(achar(c, 'tenants').fields)).toEqual(['slug', 'nome', 'seo', 'programas_ativos'])
    const seo = achar(c, 'tenants').fields.find((f) => 'name' in f && f.name === 'seo') as { fields: Field[] }
    expect(nomes(seo.fields)).toEqual(['gsc_property', 'title_pattern_loja'])
    expect(destinos(c, 'link_rules')).toEqual(['posts', 'pages', 'lojas', 'ofertas'])
    expect(destinos(c, 'links_gerados')).toEqual(['posts', 'pages', 'lojas', 'ofertas'])
  })

  it('não alteram a config que receberam', () => {
    const c = base()
    acrescentaCamposAoTenant(c, [texto('x')])
    expect(nomes(achar(c, 'tenants').fields)).toEqual(['slug', 'nome', 'seo'])
  })
})

describe('aplicaOrdem (o último plugin antes dos do núcleo)', () => {
  it('ordena coleções, campos e grupo seo do tenant, templates de página e destinos do auto-linker', async () => {
    let c = base()
    c = acrescentaCamposAoTenant(c, [texto('programas_ativos')])
    c = acrescentaAoGrupoDoTenant(c, 'seo', [texto('title_pattern_loja')])
    c = acrescentaDestinosDoAutoLinker(c, ['lojas'])
    c.collections!.push(colecao('lojas'))
    const r = await aplicaOrdem({
      colecoes: ['tenants', 'users', 'lojas', 'posts', 'pages'],
      camposDoTenant: ['slug', 'nome', 'programas_ativos', 'seo'],
      seoDoTenant: ['title_pattern_loja', 'gsc_property'],
      templatesDePagina: ['conteudo', 'apps', 'institucional'],
      destinosDoAutoLinker: ['posts', 'lojas', 'pages'],
    })(c)
    expect(r.collections!.map((x) => x.slug)).toEqual(['tenants', 'users', 'lojas', 'posts', 'pages', 'link_rules', 'links_gerados'])
    expect(nomes(achar(r, 'tenants').fields)).toEqual(['slug', 'nome', 'programas_ativos', 'seo'])
    const seo = achar(r, 'tenants').fields.find((f) => 'name' in f && f.name === 'seo') as { fields: Field[] }
    expect(nomes(seo.fields)).toEqual(['title_pattern_loja', 'gsc_property'])
    const template = achar(r, 'pages').fields.find((f) => 'name' in f && f.name === 'template') as { options: string[] }
    expect(template.options).toEqual(['conteudo', 'apps', 'institucional'])
    expect(destinos(r, 'link_rules')).toEqual(['posts', 'lojas', 'pages'])
    expect(destinos(r, 'links_gerados')).toEqual(['posts', 'lojas', 'pages'])
  })

  it('sem ordem, devolve a config como veio', async () => {
    const c = base()
    expect(await aplicaOrdem(undefined)(c)).toEqual(c)
  })
})

describe('ajustaCampo', () => {
  it('troca um campo pelo caminho, inclusive dentro de grupo, sem mexer no resto', () => {
    const c = ajustaCampo(base(), 'tenants', ['seo', 'gsc_property'], (f) => ({ ...f, admin: { description: 'do site' } }) as Field)
    const seo = achar(c, 'tenants').fields.find((f) => 'name' in f && f.name === 'seo') as { fields: Array<{ admin?: { description?: string } }> }
    expect(seo.fields[0]!.admin?.description).toBe('do site')
    expect(nomes(achar(c, 'tenants').fields)).toEqual(['slug', 'nome', 'seo'])
  })

  it('caminho que não existe é erro — texto do site que não casa não pode sumir calado', () => {
    expect(() => ajustaCampo(base(), 'tenants', ['nao_existe'], (f) => f)).toThrow(/nao_existe/)
  })
})
