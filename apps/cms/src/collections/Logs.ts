import type { CollectionConfig } from 'payload'

import { authenticated, nunca, sistemaOnly, superAdminOnly } from '../access/roles'

/** Flywheel de demanda — toda query (chat|mcp|busca) logada. Retenção 12 meses (job PRD 09). */
export const QueriesLog: CollectionConfig = {
  slug: 'queries_log',
  admin: { group: 'Sistema' },
  access: {
    create: sistemaOnly,
    delete: superAdminOnly,
    read: authenticated,
    update: nunca,
  },
  fields: [
    { name: 'origem', type: 'select', required: true, options: ['chat', 'mcp', 'busca'] },
    { name: 'texto', type: 'text', required: true },
    { name: 'tools', type: 'json', admin: { description: 'tools/filtros usados na resposta' } },
    { name: 'achou', type: 'checkbox', required: true, defaultValue: false },
    { name: 'latencia_ms', type: 'number', min: 0 },
    { name: 'custo_usd', type: 'number', min: 0, admin: { description: 'só chat (inferência nossa)' } },
  ],
}

/** Log de cliques do /r/{id} — contrato redirect-afiliado.md. ip_hash, NUNCA IP puro. */
export const Cliques: CollectionConfig = {
  slug: 'cliques',
  admin: { group: 'Sistema', defaultColumns: ['tipo_doc', 'loja', 'programa', 'ref', 'createdAt'] },
  access: {
    create: sistemaOnly,
    delete: superAdminOnly,
    read: authenticated,
    update: nunca,
  },
  fields: [
    { name: 'tipo_doc', type: 'select', required: true, options: ['cupom', 'oferta', 'produto'] },
    { name: 'doc_id', type: 'text', required: true, index: true },
    { name: 'loja', type: 'relationship', relationTo: 'lojas', index: true },
    { name: 'programa', type: 'text' },
    {
      name: 'ref',
      type: 'select',
      required: true,
      defaultValue: 'pagina',
      options: ['pagina', 'chat', 'mcp', 'grupo-wa', 'grupo-tg', 'outro'],
      admin: { description: 'vira subid no programa — liga comissão ao canal (teste F0-T1)' },
    },
    { name: 'user_agent_class', type: 'select', options: ['humano', 'bot', 'agente-ia'] },
    { name: 'ip_hash', type: 'text', admin: { description: 'sha256(ip+salt) — IP puro não é armazenado' } },
  ],
}
