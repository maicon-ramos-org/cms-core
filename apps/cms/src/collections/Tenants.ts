import type { CollectionConfig } from 'payload'

import { authenticated, superAdminOnly } from '../access/roles'

/** Contrato colecoes.md — tenants: o coração do multi-tenant. */
export const Tenants: CollectionConfig = {
  slug: 'tenants',
  admin: { useAsTitle: 'nome', group: 'Sistema' },
  access: {
    create: superAdminOnly,
    delete: superAdminOnly,
    read: authenticated,
    update: superAdminOnly,
  },
  fields: [
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      // imutável após criado — migração de domínio muda canonical_host, nunca o slug
      access: { update: () => false },
      validate: (value: string | null | undefined) =>
        !value || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) || 'slug deve ser kebab-case ([a-z0-9-])',
    },
    { name: 'nome', type: 'text', required: true },
    {
      name: 'canonical_host',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'runzos.com, 3d.runzos.com — migração de domínio = trocar aqui + 301' },
    },
    {
      name: 'tema',
      type: 'group',
      fields: [
        { name: 'cor_primaria', type: 'text', required: true, defaultValue: '#0ea5e9' },
        { name: 'cor_fundo', type: 'text', required: true, defaultValue: '#ffffff' },
        { name: 'logo', type: 'upload', relationTo: 'midia' },
        { name: 'fonte', type: 'text', admin: { description: 'família self-hosted (Fonts API)' } },
      ],
    },
    {
      name: 'programas_ativos',
      type: 'array',
      admin: { description: 'IDs/tags de afiliado NUNCA no banco — aqui vai o NOME da env var' },
      fields: [
        {
          name: 'programa',
          type: 'select',
          required: true,
          options: ['hostinger', 'amazon', 'shopee', 'awin', 'impact', 'mercadolivre', 'hotmart', 'direto', 'outro'],
        },
        {
          name: 'id_afiliado_env',
          type: 'text',
          required: true,
          admin: { description: 'ex.: AFF_AMAZON_TAG — o valor mora no .env do web/bot' },
        },
      ],
    },
    {
      name: 'canais',
      type: 'group',
      fields: [
        { name: 'whatsapp_group_id', type: 'text' },
        { name: 'telegram_channel_id', type: 'text' },
        { name: 'telegram_ingest_chat_ids', type: 'text', hasMany: true },
      ],
    },
    { name: 'chat_enabled', type: 'checkbox', required: true, defaultValue: false },
    { name: 'broadcast_enabled', type: 'checkbox', required: true, defaultValue: false },
    { name: 'chat_system_prompt', type: 'textarea' },
    {
      name: 'autolinker',
      type: 'group',
      fields: [
        { name: 'max_links_pagina', type: 'number', required: true, defaultValue: 5, min: 0 },
        { name: 'stoplist', type: 'text', hasMany: true },
        { name: 'whitelist_cross_tenant', type: 'relationship', relationTo: 'tenants', hasMany: true },
      ],
    },
    {
      name: 'ingestao',
      type: 'group',
      fields: [
        { name: 'corroboracao_min', type: 'number', defaultValue: 2, min: 1 },
        { name: 'teto_publicacao_dia', type: 'number', min: 0 },
      ],
    },
    {
      name: 'seo',
      type: 'group',
      fields: [
        {
          name: 'title_pattern_loja',
          type: 'text',
          required: true,
          defaultValue: '{n} Cupons {loja} Testados em {mes} {ano}',
        },
        { name: 'gsc_property', type: 'text' },
        { name: 'sitemap_enabled', type: 'checkbox', defaultValue: true },
      ],
    },
  ],
}
