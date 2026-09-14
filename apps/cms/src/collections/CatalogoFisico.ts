import { tenantField } from '@payloadcms/plugin-multi-tenant/fields'
import type { CollectionConfig, CollectionSlug, Field } from 'payload'
import { authenticated, nunca, podeEscreverConteudo } from '../access/roles'
import { validaSlugKebab } from '../hooks/validations'
import { appendOnly, depoisListing, historicoInterno, observaListing, semDelete, validaElegibilidade, validaProduto, validaRedirect, validaRelacoes, validaVariante, validaVinculo } from '../catalogo/hooks'

const text = (name: string, required = false): Field => ({ name, type: 'text', required })
const number = (name: string, required = false): Field => ({ name, type: 'number', min: 0, required })
const date = (name: string, required = false): Field => ({ name, type: 'date', required })
const rel = (name: string, relationTo: CollectionSlug, required = true): Field => ({ name, type: 'relationship', relationTo, required })
const select = (name: string, options: string[], defaultValue?: string): Field => ({ name, type: 'select', options, required: true, defaultValue })
const access = { read: authenticated, create: podeEscreverConteudo, update: podeEscreverConteudo, delete: nunca }
const base = (slug: CollectionSlug, fields: Field[]): CollectionConfig => ({
  slug, fields: [{ ...tenantField({ name: 'tenant', tenantsArrayFieldName: 'tenants',
    tenantsArrayTenantFieldName: 'tenant', tenantsCollectionSlug: 'tenants', unique: false }), required: true }, ...fields], access, admin: { group: 'Catálogo físico' },
  // Impede que um delete posterior invalide relações/auditoria, inclusive Local API.
  hooks: { beforeDelete: [semDelete] },
})

export const ProdutosFisicos: CollectionConfig = {
  versions: { maxPerDoc: 50 },
  ...base('produtos_fisicos', [text('nome', true),
    { name: 'slug', type: 'text', required: true, validate: validaSlugKebab }, text('marca', true), text('modelo', true),
    select('categoria', ['filamento', 'impressora', 'resina', 'acessorio']),
    { name: 'descricao', type: 'textarea' }, rel('imagem', 'midia', false), text('gtin'), text('mpn'),
    { name: 'especificacoes', type: 'json' }, select('estado', ['draft', 'review', 'published'], 'draft')]),
  indexes: [{ fields: ['tenant', 'slug'], unique: true }],
  hooks: { beforeDelete: [semDelete], beforeChange: [validaRelacoes({ imagem: 'midia' }), validaProduto] },
}
export const VariantesProduto: CollectionConfig = {
  ...base('variantes_produto', [rel('produto', 'produtos_fisicos'), text('nome', true), text('sku_fabricante'), text('gtin'),
    text('material'), text('cor'), number('peso_g'), number('diametro_mm'), text('acabamento'),
    { name: 'especificacoes', type: 'json' }, rel('imagem', 'midia', false),
    select('estado', ['incerta', 'confirmada'], 'incerta'),
    { name: 'chave_normalizada', type: 'text', admin: { readOnly: true } }]),
  indexes: [{ fields: ['tenant', 'produto', 'chave_normalizada'], unique: true }],
  hooks: { beforeDelete: [semDelete], beforeChange: [validaRelacoes({ produto: 'produtos_fisicos', imagem: 'midia' }), validaVariante] },
}
export const OfertasProduto: CollectionConfig = {
  ...base('ofertas_produto', [rel('variante', 'variantes_produto'), rel('loja', 'lojas'), text('seller_normalizado'), text('external_listing_id'),
    text('url_origem', true), text('url_afiliado'), { name: 'url_canonica', type: 'text', admin: { readOnly: true } },
    { name: 'chave_listing', type: 'text', admin: { readOnly: true } },
    { name: 'url_redirect', type: 'text', validate: (v: string | null | undefined) => !v || /^\/r\/[cpo]\d{1,12}$/.test(v) || 'Use caminho /r/{id} existente.' },
    number('preco', true), number('frete'), select('disponibilidade', ['disponivel', 'indisponivel', 'desconhecida'], 'desconhecida'),
    select('estado', ['draft', 'ativa', 'encerrada'], 'draft'), text('fonte', true), date('observado_em', true), date('validade'),
    { name: 'confianca', type: 'number', min: 0, max: 1 }]),
  indexes: [{ fields: ['tenant', 'chave_listing'], unique: true }],
  hooks: { beforeDelete: [semDelete], beforeChange: [validaRelacoes({ variante: 'variantes_produto', loja: 'lojas' }), validaRedirect, observaListing], afterChange: [depoisListing] },
}
export const HistoricoPrecoOferta: CollectionConfig = {
  ...base('historico_preco_oferta', [rel('oferta', 'ofertas_produto'), number('preco', true), number('frete'),
    select('disponibilidade', ['disponivel', 'indisponivel', 'desconhecida']), text('fonte', true), date('observado_em', true)]),
  access: { ...access, create: nunca, update: nunca },
  indexes: [{ fields: ['tenant', 'oferta', 'observado_em'], unique: true }],
  hooks: { beforeDelete: [semDelete], beforeChange: [historicoInterno, validaRelacoes({ oferta: 'ofertas_produto' })] },
}
export const VinculosCatalogo: CollectionConfig = {
  ...base('vinculos_catalogo', [text('entrada', true), rel('variante', 'variantes_produto'), rel('oferta', 'ofertas_produto', false),
    select('metodo', ['gtin', 'sku', 'url', 'atributos', 'humano']), { name: 'score', type: 'number', required: true, min: 0, max: 1 },
    { name: 'evidencia', type: 'json', required: true }, select('decisao', ['pendente', 'confirmado', 'rejeitado'], 'pendente'), date('observado_em', true)]),
  access: { ...access, update: nunca },
  hooks: { beforeDelete: [semDelete], beforeChange: [appendOnly, validaRelacoes({ variante: 'variantes_produto', oferta: 'ofertas_produto' }), validaVinculo] },
}
export const ElegibilidadeCupom: CollectionConfig = {
  ...base('elegibilidade_cupom', [rel('cupom', 'cupons'), rel('oferta', 'ofertas_produto'), number('minimo_pedido'),
    date('inicio'), date('fim'), date('verificado_em', true), text('fonte', true)]),
  indexes: [{ fields: ['tenant', 'cupom', 'oferta'], unique: true }],
  hooks: { beforeDelete: [semDelete], beforeChange: [validaRelacoes({ cupom: 'cupons', oferta: 'ofertas_produto' }), validaElegibilidade] },
}
export const catalogoFisico = [ProdutosFisicos, VariantesProduto, OfertasProduto, HistoricoPrecoOferta, VinculosCatalogo, ElegibilidadeCupom]
