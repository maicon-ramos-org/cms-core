import type { CollectionConfig } from 'payload'

import { authenticated, sistemaOnly, superAdminOnly } from '@runzos/cms-core'

/**
 * Série diária do desconto por oferta (spec-desconto-e-historico §2).
 *
 * Existe ANTES da tela que vai exibi-la (F3) de propósito: a série só existe se a coleta
 * começar cedo. Esperar a fase de exibição pra começar a gravar significaria um gráfico
 * de "melhor dos últimos 12 meses" vazio por 12 meses. Coletar é barato; recuperar o
 * passado é impossível.
 *
 * O índice composto (oferta, data) é o que torna o job diário idempotente por natureza:
 * rodar duas vezes no mesmo dia não duplica linha.
 */
export const HistoricoDesconto: CollectionConfig = {
  slug: 'historico_desconto',
  indexes: [{ fields: ['oferta', 'data'], unique: true }],
  admin: {
    useAsTitle: 'data',
    group: 'Observabilidade',
    defaultColumns: ['oferta', 'data', 'desconto_pct', 'cupom_codigo'],
    description: 'Série do desconto — exibir só com ≥3 meses de dado (menos que isso não é histórico, é ruído).',
  },
  access: {
    // escrita só pelo papel sistema: quem grava é o job, não gente
    create: sistemaOnly,
    update: sistemaOnly,
    delete: superAdminOnly,
    read: authenticated,
  },
  fields: [
    { name: 'oferta', type: 'relationship', relationTo: 'ofertas', required: true, index: true },
    { name: 'data', type: 'date', required: true, index: true, admin: { description: 'um registro por oferta por dia' } },
    { name: 'desconto_pct', type: 'number', required: true, min: 0, max: 100, admin: { description: 'efetivo do dia (já composto quando houver)' } },
    { name: 'preco', type: 'number', min: 0 },
    { name: 'cupom_codigo', type: 'text', admin: { description: 'qual cupom estava ativo naquele dia' } },
    {
      name: 'fonte',
      type: 'select',
      required: true,
      defaultValue: 'snapshot-diario',
      options: ['snapshot-diario', 'import', 'manual'],
    },
  ],
}
