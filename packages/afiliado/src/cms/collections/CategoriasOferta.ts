import { ValidationError, type CollectionBeforeValidateHook, type CollectionConfig } from 'payload'

import { authenticated, podeEscreverConteudo, superAdminOnly } from '@maicon-ramos-org/cms-core'
import { efetivo, uniquePorTenant, validaSlugKebab } from '@maicon-ramos-org/cms-core'

/**
 * Taxonomia do CATÁLOGO (spec-desconto-e-historico §3.3) — separada da taxonomia
 * editorial (`categorias`, as 7 do blog) de propósito: um chip nunca mistura taxonomias.
 *
 * `navegacao` nasce `nao_curada` porque o dado do WP é inconsistente (28 raízes pra 33
 * termos, com duplicatas tipo Hospedagem/Hospedagem VPS/VPS). Assim as 33 páginas
 * existem hoje e a barra de chips segue vazia até a curadoria — o filtro inconsistente
 * nunca chega a existir.
 */

const erro = (message: string, path: string): never => {
  throw new ValidationError({ collection: 'categorias_oferta', errors: [{ message, path }] })
}

/**
 * As invariantes do sinônimo. Tudo lido com `efetivo()` (semântica `in`): com `??` um
 * `PATCH {equivalente_a: null}` herdaria o valor antigo e furaria a checagem.
 */
const validaSinonimo: CollectionBeforeValidateHook = async ({ data, originalDoc, req, operation }) => {
  const navegacao = efetivo<string>(data, originalDoc, 'navegacao') ?? 'nao_curada'
  const equivalente = efetivo<number | string | { id?: number | string } | null>(data, originalDoc, 'equivalente_a')
  const equivalenteId =
    equivalente && typeof equivalente === 'object' ? equivalente.id : (equivalente as number | string | null)

  if (navegacao === 'sinonimo' && (equivalenteId === null || equivalenteId === undefined)) {
    erro('navegacao "sinonimo" exige equivalente_a — sinônimo sem canônico não navega pra lugar nenhum.', 'equivalente_a')
  }

  if (equivalenteId !== null && equivalenteId !== undefined) {
    const idAtual = (originalDoc as { id?: number | string } | undefined)?.id
    if (operation === 'update' && idAtual !== undefined && String(idAtual) === String(equivalenteId)) {
      erro('equivalente_a não pode apontar pra si mesmo.', 'equivalente_a')
    }
    const alvo = (await req.payload.findByID({
      collection: 'categorias_oferta',
      id: equivalenteId,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    })) as { navegacao?: string } | null
    if (alvo && alvo.navegacao !== 'canonica') {
      erro(
        `equivalente_a deve apontar pra um termo canônico (o alvo está como "${alvo.navegacao ?? 'nao_curada'}") — sinônimo aponta sempre direto pro canônico, sem cadeia.`,
        'equivalente_a',
      )
    }
  }
  return data
}

export const CategoriasOferta: CollectionConfig = {
  // ganha o grupo `meta` do plugin de SEO (a fábrica do núcleo lê esta marca — PRD 17 RF1)
  custom: { seo: true },
  slug: 'categorias_oferta',
  indexes: [{ fields: ['tenant', 'slug'], unique: true }],
  admin: {
    useAsTitle: 'nome',
    group: 'Catálogo',
    defaultColumns: ['nome', 'navegacao', 'pai', 'ordem_chip'],
    description: 'Taxonomia do catálogo. Só termos "canonica" viram chip; a curadoria NUNCA muda URL.',
  },
  access: {
    create: podeEscreverConteudo,
    delete: superAdminOnly,
    read: authenticated,
    update: podeEscreverConteudo,
  },
  hooks: { beforeValidate: [uniquePorTenant('slug'), validaSinonimo] },
  fields: [
    { name: 'nome', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true, validate: validaSlugKebab },
    { name: 'pai', type: 'relationship', relationTo: 'categorias_oferta', admin: { description: 'hierarquia vinda do WP' } },
    { name: 'descricao', type: 'richText' },
    {
      name: 'navegacao',
      type: 'select',
      required: true,
      defaultValue: 'nao_curada',
      index: true,
      options: [
        { label: 'Não curada (não aparece em chip)', value: 'nao_curada' },
        { label: 'Canônica (aparece na barra)', value: 'canonica' },
        { label: 'Sinônimo (aponta pra uma canônica)', value: 'sinonimo' },
        { label: 'Oculta', value: 'oculta' },
      ],
    },
    {
      name: 'equivalente_a',
      type: 'relationship',
      relationTo: 'categorias_oferta',
      admin: { description: 'obrigatório quando navegacao=sinonimo; aponta direto pro canônico' },
    },
    { name: 'ordem_chip', type: 'number', admin: { description: 'quando preenchido, vence a ordem por volume de ofertas' } },
    { name: 'wordpress_id', type: 'text', unique: true, index: true },
    { name: 'slug_wp', type: 'text', index: true },
  ],
}
