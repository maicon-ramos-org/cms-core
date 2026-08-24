import type { CollectionConfig } from 'payload'

import { authenticated, podeEscreverConteudo, superAdminOnly } from '../access/roles'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { draftOnlyIngestao, uniquePorTenant, validaSlugKebab } from '../hooks/validations'

/** Páginas de oferta/empresa (ex-WooCommerce) — contrato colecoes.md. */
export const Ofertas: CollectionConfig = {
  slug: 'ofertas',
  indexes: [{ fields: ['tenant', 'slug'], unique: true }],
  admin: { useAsTitle: 'titulo', group: 'Catálogo' },
  versions: { drafts: true, maxPerDoc: 50 },
  access: {
    create: podeEscreverConteudo,
    delete: superAdminOnly,
    read: authenticated,
    update: podeEscreverConteudo,
  },
  hooks: {
    beforeValidate: [uniquePorTenant('slug')],
    beforeChange: [draftOnlyIngestao],
    afterChange: [revalidateAfterChange('ofertas')],
    afterDelete: [revalidateAfterDelete('ofertas')],
  },
  fields: [
    { name: 'loja', type: 'relationship', relationTo: 'lojas', required: true, index: true },
    { name: 'titulo', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true, validate: validaSlugKebab },
    {
      name: 'tipo',
      type: 'select',
      required: true,
      options: ['cupom', 'credito', 'lifetime', 'desconto_api'],
      admin: { description: 'taxonomia do overview Runzos' },
    },
    {
      name: 'preco',
      type: 'group',
      fields: [
        { name: 'valor', type: 'number', min: 0 },
        { name: 'moeda', type: 'text', defaultValue: 'BRL' },
        { name: 'ciclo', type: 'select', options: ['unico', 'mensal', 'anual'] },
        { name: 'preco_em', type: 'date', admin: { description: 'quando o preço foi visto — nunca preço sem timestamp' } },
      ],
    },
    { name: 'cupom', type: 'relationship', relationTo: 'cupons' },
    { name: 'corpo', type: 'richText', required: true },
    { name: 'destaque', type: 'checkbox', defaultValue: false, admin: { description: 'home/hubs' } },
    { name: 'wordpress_id', type: 'text', unique: true, index: true, admin: { description: '{post_type}:{ID} — import idempotente' } },
    { name: 'slug_wp', type: 'text', index: true },
    { name: 'ancoras_alvo', type: 'text', hasMany: true },
  ],
}
