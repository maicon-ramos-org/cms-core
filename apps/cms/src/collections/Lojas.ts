import type { CollectionConfig } from 'payload'

import { authenticated, podeEscreverConteudo, superAdminOnly } from '../access/roles'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { uniquePorTenant, validaSlugKebab } from '../hooks/validations'

const urlValida = (value: string | null | undefined): true | string =>
  !value || /^https?:\/\/.+/.test(value) || 'URL deve ser absoluta (https://...)'

export const Lojas: CollectionConfig = {
  slug: 'lojas',
  indexes: [{ fields: ['tenant', 'slug'], unique: true }],
  admin: { useAsTitle: 'nome', group: 'Catálogo' },
  access: {
    create: podeEscreverConteudo,
    delete: superAdminOnly,
    read: authenticated,
    update: podeEscreverConteudo,
  },
  hooks: {
    beforeValidate: [uniquePorTenant('slug')],
    afterChange: [revalidateAfterChange('lojas')],
    afterDelete: [revalidateAfterDelete('lojas')],
  },
  fields: [
    { name: 'nome', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      validate: validaSlugKebab,
      admin: { description: 'usado em /cupom-{loja} e /empresa/{slug}' },
    },
    { name: 'logo', type: 'upload', relationTo: 'midia' },
    { name: 'url_site', type: 'text', required: true, validate: urlValida },
    {
      name: 'programa',
      type: 'select',
      required: true,
      options: ['hostinger', 'amazon', 'shopee', 'awin', 'impact', 'mercadolivre', 'hotmart', 'direto', 'outro'],
      admin: { description: 'qual rede/programa de afiliado paga esta loja' },
    },
    { name: 'descricao', type: 'richText' },
    {
      name: 'faq',
      type: 'array',
      admin: { description: 'visível na página + FAQPage schema' },
      fields: [
        { name: 'pergunta', type: 'text', required: true },
        { name: 'resposta', type: 'textarea', required: true },
      ],
    },
    { name: 'ancoras_alvo', type: 'text', hasMany: true, admin: { description: 'consumido pelo auto-linker (PRD 04)' } },
    { name: 'watch_url', type: 'text', validate: urlValida, admin: { description: 'página oficial de cupons (changedetection.io)' } },
  ],
}
