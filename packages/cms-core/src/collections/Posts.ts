import type { CollectionConfig } from 'payload'

import { authenticated, podeEscreverConteudo, superAdminOnly } from '../access/roles'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { draftOnlyIngestao, uniquePorTenant, validaSlugKebab } from '../hooks/validations'

/** Migração WP (PRD 03) — paridade de URL /{slug}. */
export const Posts: CollectionConfig = {
  // ganha o grupo `meta` do plugin de SEO (a fábrica do núcleo lê esta marca — PRD 17 RF1)
  custom: { seo: true },
  slug: 'posts',
  indexes: [{ fields: ['tenant', 'slug'], unique: true }],
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
    { name: 'slug', type: 'text', required: true, index: true, validate: validaSlugKebab },
    { name: 'corpo', type: 'richText', required: true },
    { name: 'categoria', type: 'relationship', relationTo: 'categorias' },
    { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true },
    { name: 'autor', type: 'relationship', relationTo: 'autores' },
    { name: 'capa', type: 'upload', relationTo: 'midia' },
    { name: 'schema_extra', type: 'json', admin: { description: 'JSON-LD extra migrado do vault (opcional)' } },
    {
      name: 'faq',
      type: 'array',
      admin: { description: 'FAQ que o WP publicava no JSON-LD; vira FAQPage no site (import:faq)' },
      fields: [
        { name: 'pergunta', type: 'text', required: true },
        { name: 'resposta', type: 'textarea', required: true },
      ],
    },
    {
      name: 'tipo_schema',
      type: 'text',
      hasMany: true,
      admin: {
        description:
          'Subtipo de Article que o WP declarava nesta URL (NewsArticle, TechArticle…). ' +
          'Vazio = BlogPosting. Preenchido por `import:tipo-artigo` a partir do crawl de paridade.',
      },
    },
    { name: 'ancoras_alvo', type: 'text', hasMany: true, admin: { description: 'auto-linker (PRD 04)' } },
    {
      name: 'publicado_em',
      type: 'date',
      index: true,
      admin: { description: 'data real de publicação (do WP na migração) — createdAt é a data do import' },
    },
    { name: 'atualizado_em', type: 'date', admin: { description: 'última atualização real do conteúdo' } },
    { name: 'wordpress_id', type: 'text', unique: true, index: true },
    { name: 'slug_wp', type: 'text', index: true },
  ],
}
