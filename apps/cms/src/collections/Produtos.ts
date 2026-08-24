import { ValidationError, type CollectionConfig, type CollectionBeforeValidateHook, type CollectionBeforeChangeHook } from 'payload'

import { authenticated, podeEscreverConteudo, superAdminOnly } from '../access/roles'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { draftOnlyIngestao, efetivo, uniquePorTenant, validaSlugKebab } from '../hooks/validations'

/** "preco + preco_em ✔ juntos — NUNCA preço sem timestamp" (contrato). */
const precoComTimestamp: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  const preco = efetivo(data, originalDoc, 'preco')
  const precoEm = efetivo(data, originalDoc, 'preco_em')
  if ((preco === null || preco === undefined) !== (precoEm === null || precoEm === undefined)) {
    throw new ValidationError({
      collection: 'produtos',
      errors: [{ message: 'preco e preco_em andam juntos: os dois preenchidos ou os dois vazios.', path: preco == null ? 'preco' : 'preco_em' }],
    })
  }
  return data
}

/** Máquina PRD 08 — estado indexavel exige imagem + gate anti-thin completo. */
const gateIndexavel: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  const estado = efetivo(data, originalDoc, 'estado')
  if (estado !== 'indexavel') return data
  const imagem = efetivo(data, originalDoc, 'imagem')
  const gate = { ...(originalDoc?.gate_antithin ?? {}), ...(data?.gate_antithin ?? {}) } as Record<string, boolean>
  const faltas: string[] = []
  if (!imagem) faltas.push('imagem')
  for (const check of ['alternativas', 'faq', 'editorial']) {
    if (!gate[check]) faltas.push(`gate_antithin.${check}`)
  }
  if (faltas.length > 0) {
    throw new ValidationError({
      collection: 'produtos',
      errors: [{ message: `Estado "indexavel" exige: ${faltas.join(', ')} (gate anti-thin, PRD 08).`, path: faltas[0] ?? 'estado' }],
    })
  }
  return data
}

/** indexavel é DERIVADO do estado — controla meta/sitemap no site. */
const derivaIndexavel: CollectionBeforeChangeHook = ({ data }) => {
  if (data && typeof data === 'object' && 'estado' in data) {
    data.indexavel = data.estado === 'indexavel'
  }
  return data
}

export const Produtos: CollectionConfig = {
  slug: 'produtos',
  indexes: [{ fields: ['tenant', 'slug'], unique: true }],
  admin: { useAsTitle: 'titulo', group: 'Catálogo', defaultColumns: ['titulo', 'loja', 'estado', 'indexavel'] },
  versions: { drafts: true, maxPerDoc: 50 },
  access: {
    create: podeEscreverConteudo,
    delete: superAdminOnly,
    read: authenticated,
    update: podeEscreverConteudo,
  },
  hooks: {
    beforeValidate: [uniquePorTenant('slug'), precoComTimestamp, gateIndexavel],
    beforeChange: [draftOnlyIngestao, derivaIndexavel],
    afterChange: [revalidateAfterChange('produtos')],
    afterDelete: [revalidateAfterDelete('produtos')],
  },
  fields: [
    { name: 'titulo', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true, validate: validaSlugKebab, admin: { description: 'página /p/{slug}' } },
    { name: 'loja', type: 'relationship', relationTo: 'lojas', required: true, index: true },
    { name: 'imagem', type: 'upload', relationTo: 'midia', admin: { description: 'obrigatória p/ estado indexavel' } },
    { name: 'preco', type: 'number', min: 0 },
    { name: 'preco_em', type: 'date' },
    { name: 'cupom', type: 'relationship', relationTo: 'cupons' },
    { name: 'url_afiliado_fonte', type: 'text', required: true },
    { name: 'fonte_coleta', type: 'select', required: true, options: ['grupo', 'api', 'radar', 'manual'] },
    {
      name: 'estado',
      type: 'select',
      required: true,
      defaultValue: 'rascunho',
      index: true,
      options: ['rascunho', 'landing', 'indexavel', 'encerrado'],
      admin: { description: 'máquina PRD 08 — todos nascem landing noindex' },
    },
    { name: 'indexavel', type: 'checkbox', defaultValue: false, admin: { readOnly: true, description: 'derivado do estado' } },
    { name: 'kgr_allintitle', type: 'number', min: 0, admin: { description: 'preenchido pelo serviço KGR (dono da SERP quando ~0)' } },
    {
      name: 'gate_antithin',
      type: 'group',
      fields: [
        { name: 'alternativas', type: 'checkbox', defaultValue: false },
        { name: 'faq', type: 'checkbox', defaultValue: false },
        { name: 'editorial', type: 'checkbox', defaultValue: false },
      ],
    },
    { name: 'gsc_impressoes_90d', type: 'number', min: 0, admin: { description: 'alimentado PRD 09; job de poda lê' } },
    { name: 'gsc_cliques_90d', type: 'number', min: 0 },
    { name: 'ancoras_alvo', type: 'text', hasMany: true },
  ],
}
