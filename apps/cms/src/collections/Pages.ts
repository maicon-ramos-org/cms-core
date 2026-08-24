import type { CollectionConfig } from 'payload'

import { authenticated, podeEscreverConteudo, superAdminOnly } from '../access/roles'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { draftOnlyIngestao, uniquePorTenant } from '../hooks/validations'

/** Pages WP: corpo livre OU template (apps re-render de data/{slug}.json, calculadora como ilha). */
export const Pages: CollectionConfig = {
  slug: 'pages',
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
    afterChange: [revalidateAfterChange('pages')],
    afterDelete: [revalidateAfterDelete('pages')],
  },
  fields: [
    { name: 'titulo', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true },
    {
      name: 'template',
      type: 'select',
      required: true,
      defaultValue: 'conteudo',
      options: ['conteudo', 'apps', 'calculadora', 'institucional'],
    },
    { name: 'corpo', type: 'richText', admin: { condition: (data) => data?.template === 'conteudo' || data?.template === 'institucional' } },
    {
      name: 'dados',
      type: 'json',
      admin: {
        condition: (data) => data?.template === 'apps' || data?.template === 'calculadora',
        description: 'dados estruturados do template (json tipado por template — mata o base64)',
      },
    },
    { name: 'ancoras_alvo', type: 'text', hasMany: true },
    { name: 'wordpress_id', type: 'text', unique: true, index: true },
    { name: 'slug_wp', type: 'text', index: true },
  ],
}
