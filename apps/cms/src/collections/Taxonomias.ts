import type { CollectionConfig } from 'payload'

import { authenticated, podeEscreverConteudo, superAdminOnly } from '../access/roles'
import { uniquePorTenant } from '../hooks/validations'

const base = {
  access: {
    create: podeEscreverConteudo,
    delete: superAdminOnly,
    read: authenticated,
    update: podeEscreverConteudo,
  },
} satisfies Partial<CollectionConfig>

/** As 7 categorias curadas migram; tags livres; autores p/ E-E-A-T. */
export const Categorias: CollectionConfig = {
  ...base,
  slug: 'categorias',
  admin: { useAsTitle: 'nome', group: 'Conteúdo' },
  hooks: { beforeValidate: [uniquePorTenant('slug')] },
  fields: [
    { name: 'nome', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true },
    { name: 'descricao_seo', type: 'textarea' },
    { name: 'wordpress_id', type: 'text', unique: true, index: true },
    { name: 'slug_wp', type: 'text', index: true },
  ],
}

export const Tags: CollectionConfig = {
  ...base,
  slug: 'tags',
  admin: { useAsTitle: 'nome', group: 'Conteúdo' },
  hooks: { beforeValidate: [uniquePorTenant('slug')] },
  fields: [
    { name: 'nome', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true },
    { name: 'wordpress_id', type: 'text', unique: true, index: true },
  ],
}

export const Autores: CollectionConfig = {
  ...base,
  slug: 'autores',
  admin: { useAsTitle: 'nome', group: 'Conteúdo' },
  hooks: { beforeValidate: [uniquePorTenant('slug')] },
  fields: [
    { name: 'nome', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true },
    { name: 'bio', type: 'textarea' },
    { name: 'avatar', type: 'upload', relationTo: 'midia' },
    { name: 'sameAs', type: 'text', hasMany: true, admin: { description: 'LinkedIn, GitHub etc. (fonte: perfil-maicon) — E-E-A-T' } },
    { name: 'wordpress_id', type: 'text', unique: true, index: true },
  ],
}
