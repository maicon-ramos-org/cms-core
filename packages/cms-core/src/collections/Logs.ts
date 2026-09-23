import type { CollectionConfig } from 'payload'

import { nunca, sistemaOnly, superAdminOnly } from '../access/roles'

/** Flywheel de demanda — toda query (chat|mcp|busca) logada. Retenção 12 meses (job PRD 09). */
export const QueriesLog: CollectionConfig = {
  slug: 'queries_log',
  admin: { group: 'Sistema' },
  access: {
    create: sistemaOnly,
    delete: superAdminOnly,
    read: sistemaOnly, // least-privilege: ip_hash/queries não são pra agente de conteúdo
    update: nunca,
  },
  fields: [
    /*
     * `webmcp` = ferramenta chamada pelo agente DENTRO do navegador (PRD 11). Separado de
     * `mcp` de propósito: são públicos diferentes com atritos diferentes — o remoto exige
     * que a pessoa adicione um conector, o do navegador não. Somar os dois num número só
     * apagaria justamente a comparação que interessa medir.
     */
    { name: 'origem', type: 'select', required: true, options: ['chat', 'mcp', 'webmcp', 'busca'] },
    { name: 'texto', type: 'text', required: true },
    { name: 'tools', type: 'json', admin: { description: 'tools/filtros usados na resposta' } },
    { name: 'achou', type: 'checkbox', required: true, defaultValue: false },
    { name: 'latencia_ms', type: 'number', min: 0 },
    { name: 'custo_usd', type: 'number', min: 0, admin: { description: 'só chat (inferência nossa)' } },
  ],
}
