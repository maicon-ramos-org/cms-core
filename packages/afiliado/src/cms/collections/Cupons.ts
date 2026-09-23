import { ValidationError, type CollectionConfig, type CollectionBeforeValidateHook } from 'payload'

import { authenticated, podeEscreverConteudo, superAdminOnly } from '@runzos/cms-core'
import { revalidateAfterChange, revalidateAfterDelete } from '@runzos/cms-core'
import { draftOnlyIngestao, efetivo } from '@runzos/cms-core'

import { uniqueCupomPorLoja } from '../hooks/cupons'
import { tagsDaLoja } from '../hooks/tags-loja'

/** beforeValidate: trim + uppercase (contrato colecoes.md). */
const normalizaCodigo: CollectionBeforeValidateHook = ({ data }) => {
  if (data && typeof data.codigo === 'string') data.codigo = data.codigo.trim().toUpperCase()
  return data
}

/** "verificado_em / metodo — ✔ ao publicar": estado publicado exige o selo. */
const exigeSeloAoPublicar: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  const estado = efetivo(data, originalDoc, 'estado')
  // `importado` é exceção declarada, não afrouxamento: o WP não tinha verificação porque o
  // selo é feature nova. As outras origens seguem exigindo — a regra nasceu pra conter
  // agente inventando cupom, e para agente ela vale inteira.
  const origem = efetivo(data, originalDoc, 'origem')
  if (estado === 'publicado' && origem !== 'importado') {
    // efetivo(): PATCH {verificado_em: null} não pode passar herdando o valor antigo
    const verificadoEm = efetivo(data, originalDoc, 'verificado_em')
    const metodo = efetivo(data, originalDoc, 'metodo')
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

/** fontes presentes ⇒ fontes_count reflete a trilha (coerência da corroboração). */
const derivaFontesCount: CollectionBeforeValidateHook = ({ data }) => {
  if (data && Array.isArray(data.fontes)) data.fontes_count = data.fontes.length
  return data
}

export const Cupons: CollectionConfig = {
  slug: 'cupons',
  // backstop de banco contra corrida — o hook uniqueCupomPorLoja dá o 400 amigável
  indexes: [{ fields: ['loja', 'codigo'], unique: true }],
  admin: { useAsTitle: 'codigo', group: 'Catálogo', defaultColumns: ['codigo', 'loja', 'estado', 'validade'] },
  versions: { drafts: true, maxPerDoc: 50 },
  access: {
    create: podeEscreverConteudo,
    delete: superAdminOnly,
    read: authenticated,
    update: podeEscreverConteudo,
  },
  hooks: {
    beforeValidate: [normalizaCodigo, derivaFontesCount, uniqueCupomPorLoja, exigeSeloAoPublicar],
    beforeChange: [draftOnlyIngestao],
    afterChange: [revalidateAfterChange('cupons', { tagsExtras: tagsDaLoja })],
    afterDelete: [revalidateAfterDelete('cupons', { tagsExtras: tagsDaLoja })],
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
    {
      name: 'aplica_sobre',
      type: 'select',
      required: true,
      defaultValue: 'desconhecido',
      options: [
        { label: 'Sobre o preço cheio (soma direta)', value: 'preco_cheio' },
        { label: 'Sobre o preço já com desconto da loja', value: 'preco_ja_descontado' },
        { label: 'Desconhecido', value: 'desconhecido' },
      ],
      admin: {
        description:
          'sobre QUAL preço o cupom incide. Varia por loja e campanha — errar isso é prometer desconto que o usuário não recebe. Desconhecido faz a composição não exibir total.',
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
    { name: 'fontes_count', type: 'number', required: true, defaultValue: 1, min: 0, admin: { description: 'derivado de fontes[] quando a trilha existe' } },
    {
      name: 'fontes',
      type: 'array',
      fields: [
        { name: 'origem', type: 'text', required: true },
        { name: 'ts', type: 'date', required: true },
      ],
    },
    {
      name: 'origem',
      type: 'select',
      required: true,
      defaultValue: 'manual',
      index: true,
      options: [
        { label: 'importado (migração do WP — publica sem selo)', value: 'importado' },
        { label: 'agente (exige verificação para publicar)', value: 'agente' },
        { label: 'manual (exige verificação para publicar)', value: 'manual' },
      ],
      admin: { description: 'governa a exigência do selo — ver colecoes.md' },
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
