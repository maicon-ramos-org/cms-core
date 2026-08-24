import type { CollectionConfig } from 'payload'

import { authenticated, podeEscreverConteudo, superAdminOnly } from '../access/roles'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { draftOnlyIngestao, uniquePorTenant } from '../hooks/validations'

/** Migração WP (PRD 03) — paridade de URL /{slug}. */
export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: { useAsTitle: 'titulo', group: 'Conteúdo' },
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
    afterChange: [revalidateAfterChange('posts')],
    afterDelete: [revalidateAfterDelete('posts')],
  },
  fields: [
    { name: 'titulo', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true },
    { name: 'corpo', type: 'richText', required: true },
    { name: 'categoria', type: 'relationship', relationTo: 'categorias' },
    { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true },
    { name: 'autor', type: 'relationship', relationTo: 'autores' },
    { name: 'capa', type: 'upload', relationTo: 'midia' },
    { name: 'schema_extra', type: 'json', admin: { description: 'JSON-LD extra migrado do vault (opcional)' } },
    { name: 'ancoras_alvo', type: 'text', hasMany: true, admin: { description: 'auto-linker (PRD 04)' } },
    { name: 'wordpress_id', type: 'text', unique: true, index: true },
    { name: 'slug_wp', type: 'text', index: true },
  ],
}
