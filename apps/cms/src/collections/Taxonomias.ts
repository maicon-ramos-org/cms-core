import type { CollectionConfig } from 'payload'

import { authenticated, podeEscreverConteudo, superAdminOnly } from '../access/roles'
import { uniquePorTenant, validaSlugKebab } from '../hooks/validations'

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
  // ganha o grupo `meta` do plugin de SEO (a fábrica do núcleo lê esta marca — PRD 17 RF1)
  custom: { seo: true },
  indexes: [{ fields: ['tenant', 'slug'], unique: true }],
  admin: { useAsTitle: 'nome', group: 'Conteúdo' },
  hooks: { beforeValidate: [uniquePorTenant('slug')] },
  fields: [
    { name: 'nome', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true, validate: validaSlugKebab },
    { name: 'descricao_seo', type: 'textarea' },
    { name: 'wordpress_id', type: 'text', unique: true, index: true },
    { name: 'slug_wp', type: 'text', index: true },
  ],
}

export const Tags: CollectionConfig = {
  ...base,
  slug: 'tags',
  indexes: [{ fields: ['tenant', 'slug'], unique: true }],
  admin: { useAsTitle: 'nome', group: 'Conteúdo' },
  hooks: { beforeValidate: [uniquePorTenant('slug')] },
  fields: [
    { name: 'nome', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true, validate: validaSlugKebab },
    { name: 'wordpress_id', type: 'text', unique: true, index: true },
    { name: 'slug_wp', type: 'text', index: true },
  ],
}

export const Autores: CollectionConfig = {
  ...base,
  slug: 'autores',
  indexes: [{ fields: ['tenant', 'slug'], unique: true }],
  admin: { useAsTitle: 'nome', group: 'Conteúdo' },
  hooks: { beforeValidate: [uniquePorTenant('slug')] },
  fields: [
    { name: 'nome', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true, validate: validaSlugKebab },
    { name: 'bio', type: 'textarea' },
    { name: 'avatar', type: 'upload', relationTo: 'midia' },
    { name: 'sameAs', type: 'text', hasMany: true, admin: { description: 'LinkedIn, GitHub etc. (fonte: perfil-maicon) — E-E-A-T' } },
    { name: 'wordpress_id', type: 'text', unique: true, index: true },
    { name: 'slug_wp', type: 'text', index: true },
  ],
}
