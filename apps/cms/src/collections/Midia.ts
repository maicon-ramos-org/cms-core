import type { CollectionConfig } from 'payload'

import { authenticated, podeEscreverConteudo, superAdminOnly } from '../access/roles'

export const Midia: CollectionConfig = {
  slug: 'midia',
  admin: { group: 'Conteúdo' },
  access: {
    create: podeEscreverConteudo,
    delete: superAdminOnly,
    read: () => true, // arquivos são públicos (servidos nas páginas)
    update: podeEscreverConteudo,
  },
  upload: {
    staticDir: 'media',
    mimeTypes: ['image/*', 'application/pdf'],
  },
  fields: [
    { name: 'alt', type: 'text', required: true },
    { name: 'credit', type: 'text' },
    { name: 'wp_url_antiga', type: 'text', index: true, admin: { description: 'manifesto do alias /wp-content/uploads/' } },
  ],
}
