import { tenantField } from '@payloadcms/plugin-multi-tenant/fields'
import {
  authenticated, chaveDeOrigem, draftOnlyIngestao, efetivo, isSuperAdmin, nunca,
  podeEscreverConteudo, revalidateAfterChange, uniquePorTenant, validaSlugKebab,
} from '@maicon-ramos-org/cms-core'
import { APIError, ValidationError, type CollectionBeforeValidateHook, type CollectionConfig, type CollectionSlug,
  type Field, type Plugin, type PayloadRequest } from 'payload'
import { idOferta, urlHTTP } from '../../ofertas-editoriais/contratos'
import { uniqueCupomPorLoja } from '../hooks/cupons'
import { tagsDaLoja } from '../hooks/tags-loja'

type Doc = Record<string, unknown>
const erro = (path: string, message: string): never => { throw new ValidationError({ errors: [{ path, message }] }) }
const tenant = (): Field => ({ ...tenantField({ name: 'tenant', tenantsArrayFieldName: 'tenants',
  tenantsArrayTenantFieldName: 'tenant', tenantsCollectionSlug: 'tenants', unique: false }), required: true })

async function noTenant(req: PayloadRequest, collection: string, rawId: unknown, tenantId: string, path: string): Promise<Doc> {
  const id = idOferta(rawId as never)
  if (!id) return erro(path, 'Referência obrigatória.')
  const result = await req.payload.find({ collection: collection as CollectionSlug, req, depth: 0, draft: true,
    overrideAccess: true, limit: 1, where: { and: [{ id: { equals: id } }, { tenant: { equals: tenantId } }] } })
  const doc = result.docs[0] as unknown as Doc | undefined
  return doc ?? erro(path, 'Referência deve existir no mesmo tenant.')
}

const validaVinculos = (refs: Record<string, string>, lista: readonly string[] = []): CollectionBeforeValidateHook =>
  async ({ data, originalDoc, req }) => {
    const tenantId = idOferta(efetivo(data, originalDoc, 'tenant') as never)
    if (!tenantId) return erro('tenant', 'Tenant obrigatório.')
    if (originalDoc?.id && tenantId !== idOferta(originalDoc.tenant)) return erro('tenant', 'Tenant é imutável.')
    if (req.user && !isSuperAdmin(req.user)) {
      const permissoes = (req.user as unknown as { tenants?: Array<{ tenant?: unknown }> }).tenants ?? []
      if (!permissoes.some(item => idOferta(item.tenant as never) === tenantId)) throw new APIError('Tenant não autorizado.', 403)
    }
    if (originalDoc?.origem && efetivo(data, originalDoc, 'origem') !== originalDoc.origem) return erro('origem', 'Origem é imutável.')
    for (const [field, collection] of Object.entries(refs)) {
      const value = efetivo(data, originalDoc, field)
      if (value == null) continue
      const values = lista.includes(field) ? value : [value]
      if (!Array.isArray(values) || values.length > 100) return erro(field, 'Use no máximo 100 referências.')
      const seen = new Set<string>()
      for (const [index, item] of values.entries()) {
        const id = idOferta(item as never)
        const path = lista.includes(field) ? `${field}.${index}` : field
        if (!id || seen.has(id)) return erro(path, 'Referência obrigatória e sem duplicatas.')
        if (collection === 'categorias_oferta' && originalDoc?.id && id === idOferta(originalDoc.id)) return erro(path, 'Categoria não pode ser pai de si mesma.')
        seen.add(id)
        await noTenant(req, collection, item, tenantId, path)
      }
    }
    return data
  }

const validaOfertaCatalogo: CollectionBeforeValidateHook = async (args) => {
  const { data, originalDoc, req } = args
  await validaVinculos({ loja: 'lojas', cupom: 'cupons', categorias: 'categorias_oferta' }, ['categorias'])(args)
  const tenantId = idOferta(efetivo(data, originalDoc, 'tenant') as never)
  const loja = efetivo(data, originalDoc, 'loja')
  const cupom = efetivo(data, originalDoc, 'cupom')
  if (loja != null && cupom != null) {
    const doc = await noTenant(req, 'cupons', cupom, tenantId, 'cupom')
    if (idOferta(doc.loja as never) !== idOferta(loja as never)) return erro('cupom', 'Cupom deve pertencer à loja da oferta.')
  }
  return data
}

const normalizaCupom: CollectionBeforeValidateHook = ({ data }) => {
  if (data && typeof data.codigo === 'string') data.codigo = data.codigo.trim().toUpperCase()
  return data
}

const validaLoja: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  const url = efetivo(data, originalDoc, 'url_site')
  if (url != null && !urlHTTP(url)) return erro('url_site', 'URL deve ser HTTP(S), sem credenciais ou porta não padrão.')
  return data
}

const acesso = { read: authenticated, create: podeEscreverConteudo, update: podeEscreverConteudo, delete: nunca }

const lojas: CollectionConfig = {
  slug: 'lojas', custom: { tenantCampoProprio: true }, admin: { group: 'Catálogo', useAsTitle: 'nome' },
  access: acesso, versions: { drafts: { validate: true }, maxPerDoc: 50 },
  indexes: [{ fields: ['tenant', 'slug'], unique: true }, { fields: ['tenant', 'origem'], unique: true }],
  fields: [tenant(), chaveDeOrigem, { name: 'nome', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, validate: validaSlugKebab },
    { name: 'url_site', type: 'text' }, { name: 'descricao', type: 'textarea' }],
  hooks: { beforeValidate: [uniquePorTenant('slug'), uniquePorTenant('origem'), validaVinculos({}), validaLoja],
    beforeChange: [draftOnlyIngestao], afterChange: [revalidateAfterChange('lojas', { tagsExtras: tagsDaLoja })] },
}

const cupons: CollectionConfig = {
  slug: 'cupons', custom: { tenantCampoProprio: true }, admin: { group: 'Catálogo', useAsTitle: 'codigo' },
  access: acesso, versions: { drafts: { validate: true }, maxPerDoc: 50 },
  indexes: [{ fields: ['tenant', 'loja', 'codigo'], unique: true }, { fields: ['tenant', 'origem'], unique: true }],
  fields: [tenant(), chaveDeOrigem, { name: 'loja', type: 'relationship', relationTo: 'lojas', required: true },
    { name: 'codigo', type: 'text', required: true,
      validate: (value: string | null | undefined) => !value || /^[A-Z0-9_-]{2,64}$/.test(value) || 'Código exige 2–64 caracteres [A-Z0-9_-].' },
    { name: 'desconto_tipo', type: 'select', options: ['percentual', 'valor', 'frete', 'outro'] },
    { name: 'desconto_valor', type: 'number', min: 0 },
    { name: 'condicoes', type: 'textarea' }, { name: 'validade', type: 'date' },
    { name: 'verificado_em', type: 'date', admin: { description: 'Metadado informado pelo publicador; revisão é feita fora do CMS.' } }],
  hooks: { beforeValidate: [normalizaCupom, uniquePorTenant('origem'), uniqueCupomPorLoja, validaVinculos({ loja: 'lojas' })],
    beforeChange: [draftOnlyIngestao], afterChange: [revalidateAfterChange('cupons', { tagsExtras: tagsDaLoja })] },
}

const categorias: CollectionConfig = {
  slug: 'categorias_oferta', custom: { tenantCampoProprio: true }, admin: { group: 'Catálogo', useAsTitle: 'nome' },
  access: acesso, versions: { drafts: { validate: true }, maxPerDoc: 50 },
  indexes: [{ fields: ['tenant', 'slug'], unique: true }, { fields: ['tenant', 'origem'], unique: true }],
  fields: [tenant(), chaveDeOrigem, { name: 'nome', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, validate: validaSlugKebab },
    { name: 'descricao', type: 'textarea' }, { name: 'pai', type: 'relationship', relationTo: 'categorias_oferta' }],
  hooks: { beforeValidate: [uniquePorTenant('slug'), uniquePorTenant('origem'), validaVinculos({ pai: 'categorias_oferta' })],
    beforeChange: [draftOnlyIngestao], afterChange: [revalidateAfterChange('categorias_oferta')] },
}

/** Opt-in: a oferta editorial continua sendo a única ficha de produto/destino comercial.
 * `verificacoes_ofertas_editoriais` já é a série de preço; nenhum cron é instalado aqui. */
export function catalogoEditorial(): Plugin {
  return config => {
    const current = config.collections ?? []
    if (!current.some(c => c.slug === 'ofertas_editoriais')) throw new Error('catalogoEditorial exige ofertasEditoriais antes.')
    if (['lojas', 'cupons', 'categorias_oferta'].some(slug => current.some(c => c.slug === slug))) {
      throw new Error('catalogoEditorial conflita com catálogo já instalado na instância.')
    }
    return { ...config, collections: [...current.map(collection => collection.slug !== 'ofertas_editoriais' ? collection : {
      ...collection, fields: [...collection.fields,
        { name: 'loja', type: 'relationship', relationTo: 'lojas' },
        { name: 'cupom', type: 'relationship', relationTo: 'cupons' },
        { name: 'categorias', type: 'relationship', relationTo: 'categorias_oferta', hasMany: true }],
      hooks: { ...collection.hooks, beforeValidate: [...(collection.hooks?.beforeValidate ?? []), validaOfertaCatalogo] },
    } as CollectionConfig), lojas, cupons, categorias] }
  }
}
