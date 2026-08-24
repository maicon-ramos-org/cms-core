import type { CollectionConfig } from 'payload'

import { authenticated, isSuperAdmin, superAdminOnly } from '../access/roles'

/**
 * Contrato PRD 01 RF3 — auth com useAPIKey; uma key POR agente
 * (hermes-redator, hermes-estrategista, hermes-severino, claude-code-build,
 * ingestao-worker, web-server). Roles definem o que cada um pode.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: { useAPIKey: true },
  admin: { useAsTitle: 'email', group: 'Sistema' },
  access: {
    create: superAdminOnly,
    delete: superAdminOnly,
    read: authenticated,
    update: ({ req, id }) => isSuperAdmin(req.user) || req.user?.id === id,
  },
  fields: [
    { name: 'nome', type: 'text', required: true },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['editor'],
      options: [
        { label: 'Super Admin', value: 'super-admin' },
        { label: 'Agente', value: 'agente' },
        { label: 'Editor', value: 'editor' },
        { label: 'Ingestão (só draft)', value: 'ingestao' },
        { label: 'Sistema (logs)', value: 'sistema' },
      ],
      access: { update: ({ req }) => isSuperAdmin(req.user) },
    },
  ],
}
