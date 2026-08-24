import { ValidationError, type CollectionConfig, type CollectionBeforeValidateHook } from 'payload'

import { authenticated, podeEscreverConteudo, superAdminOnly } from '../access/roles'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { draftOnlyIngestao, uniqueCupomPorLoja } from '../hooks/validations'

/** beforeValidate: trim + uppercase (contrato colecoes.md). */
const normalizaCodigo: CollectionBeforeValidateHook = ({ data }) => {
  if (data && typeof data.codigo === 'string') data.codigo = data.codigo.trim().toUpperCase()
  return data
}

/** "verificado_em / metodo — ✔ ao publicar": estado publicado exige o selo. */
const exigeSeloAoPublicar: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  const estado = data?.estado ?? originalDoc?.estado
  if (estado === 'publicado') {
    const verificadoEm = data?.verificado_em ?? originalDoc?.verificado_em
    const metodo = data?.metodo ?? originalDoc?.metodo
    if (!verificadoEm || !metodo) {
      throw new ValidationError({
        collection: 'cupons',
        errors: [
          {
            message: 'Cupom com estado "publicado" exige verificado_em e metodo (o selo de verificação).',
            path: verificadoEm ? 'metodo' : 'verificado_em',
          },
        ],
      })
    }
  }
  return data
}

export const Cupons: CollectionConfig = {
  slug: 'cupons',
  admin: { useAsTitle: 'codigo', group: 'Catálogo', defaultColumns: ['codigo', 'loja', 'estado', 'validade'] },
  versions: { drafts: true, maxPerDoc: 50 },
  access: {
    create: podeEscreverConteudo,
    delete: superAdminOnly,
    read: authenticated,
    update: podeEscreverConteudo,
  },
  hooks: {
    beforeValidate: [normalizaCodigo, uniqueCupomPorLoja, exigeSeloAoPublicar],
    beforeChange: [draftOnlyIngestao],
    afterChange: [revalidateAfterChange('cupons')],
    afterDelete: [revalidateAfterDelete('cupons')],
  },
  fields: [
    { name: 'loja', type: 'relationship', relationTo: 'lojas', required: true, index: true },
    {
      name: 'codigo',
      type: 'text',
      required: true,
      index: true,
      validate: (value: string | null | undefined) =>
        !value || /^[A-Z0-9_-]{2,64}$/.test(value) || 'código deve ter 2-64 chars [A-Z0-9_-] (normalizado p/ maiúsculas)',
    },
    {
      name: 'desconto_tipo',
      type: 'select',
      required: true,
      options: [
        { label: '% percentual', value: 'percentual' },
        { label: 'Valor fixo', value: 'valor' },
        { label: 'Frete grátis', value: 'frete' },
        { label: 'Outro', value: 'outro' },
      ],
    },
    {
      name: 'desconto_valor',
      type: 'number',
      min: 0,
      validate: (value: number | null | undefined, { siblingData }: { siblingData: { desconto_tipo?: string } }) => {
        const tipo = siblingData?.desconto_tipo
        if ((tipo === 'percentual' || tipo === 'valor') && (value === null || value === undefined)) {
          return 'desconto_valor é obrigatório quando desconto_tipo é percentual ou valor'
        }
        if (tipo === 'percentual' && typeof value === 'number' && value > 100) return 'percentual não pode passar de 100'
        return true
      },
    },
    { name: 'condicoes', type: 'textarea', admin: { description: 'mínimo de compra, primeira compra etc.' } },
    { name: 'validade', type: 'date', admin: { description: 'null = sem data conhecida (decay cuida)' } },
    {
      name: 'estado',
      type: 'select',
      required: true,
      defaultValue: 'pendente',
      index: true,
      options: ['pendente', 'publicado', 'expirando', 'expirado', 'revisao'],
      admin: { description: 'máquina de estados PRD 07' },
    },
    { name: 'fontes_count', type: 'number', required: true, defaultValue: 1, min: 0 },
    {
      name: 'fontes',
      type: 'array',
      fields: [
        { name: 'origem', type: 'text', required: true },
        { name: 'ts', type: 'date', required: true },
      ],
    },
    { name: 'verificado_em', type: 'date' },
    { name: 'metodo', type: 'select', options: ['corroboracao', 'api', 'manual'] },
    { name: 'taxa_sucesso', type: 'number', min: 0, max: 100, admin: { description: 'feedback RF6 PRD 07' } },
    {
      name: 'url_afiliado_fonte',
      type: 'text',
      admin: { description: 'destino do builder /r/{id} — link cru NUNCA em HTML/mensagem' },
    },
  ],
}
