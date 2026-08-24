import type { CollectionConfig } from 'payload'

import { authenticated, nunca, podeEscreverConteudo, sistemaOnly, superAdminOnly } from '../access/roles'

/** Dicionário do auto-linker (PRD 04). Seed: mapa keyword→URL exportado do ILJ. */
export const LinkRules: CollectionConfig = {
  slug: 'link_rules',
  admin: { useAsTitle: 'id', group: 'SEO' },
  access: {
    create: podeEscreverConteudo,
    delete: superAdminOnly,
    read: authenticated,
    update: podeEscreverConteudo,
  },
  fields: [
    {
      name: 'destino',
      type: 'relationship',
      relationTo: ['posts', 'lojas', 'ofertas', 'produtos', 'pages'],
      required: true,
    },
    {
      name: 'ancoras_alvo',
      type: 'text',
      hasMany: true,
      required: true,
      validate: (value: string[] | null | undefined) =>
        (Array.isArray(value) && value.length > 0) || 'pelo menos uma âncora é obrigatória',
    },
    { name: 'prioridade', type: 'number', defaultValue: 0 },
    { name: 'ativo', type: 'checkbox', defaultValue: true },
  ],
}

/** Observabilidade do auto-linker — escrita SÓ pelo sistema (contrato colecoes.md). */
export const LinksGerados: CollectionConfig = {
  slug: 'links_gerados',
  admin: { group: 'SEO' },
  access: {
    create: sistemaOnly,
    delete: superAdminOnly,
    read: authenticated,
    update: nunca,
  },
  fields: [
    { name: 'origem_url', type: 'text', required: true, index: true },
    {
      name: 'destino',
      type: 'relationship',
      relationTo: ['posts', 'lojas', 'ofertas', 'produtos', 'pages'],
      required: true,
    },
    { name: 'ancora', type: 'text', required: true },
    { name: 'run_id', type: 'text', required: true, index: true },
  ],
}
