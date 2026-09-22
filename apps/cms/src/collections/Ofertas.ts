import { ValidationError, type CollectionBeforeValidateHook, type CollectionConfig } from 'payload'

import { authenticated, podeEscreverConteudo, superAdminOnly } from '../access/roles'
import { chaveDeOrigem } from '../fields/origem'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { draftOnlyIngestao, efetivo, uniquePorTenant, validaSlugKebab } from '../hooks/validations'

/**
 * Desconto sem timestamp não existe (mesma regra de `produtos.preco` + `preco_em`):
 * um "70% OFF" sem data é promessa que ninguém pode auditar.
 */
const exigeTimestampDoDesconto: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  const desconto = efetivo<{ valor?: number | null; verificado_em?: string | null }>(data, originalDoc, 'desconto_loja')
  if (desconto && typeof desconto.valor === 'number' && !desconto.verificado_em) {
    throw new ValidationError({
      collection: 'ofertas',
      errors: [
        {
          message: 'desconto_loja.valor exige desconto_loja.verificado_em — desconto sem timestamp não é auditável.',
          path: 'desconto_loja.verificado_em',
        },
      ],
    })
  }
  return data
}

/** Páginas de oferta/empresa (ex-WooCommerce) — contrato colecoes.md. */
export const Ofertas: CollectionConfig = {
  slug: 'ofertas',
  indexes: [
    { fields: ['tenant', 'slug'], unique: true },
    { fields: ['tenant', 'origem'], unique: true },
  ],
  admin: { useAsTitle: 'titulo', group: 'Catálogo' },
  versions: { drafts: true, maxPerDoc: 50 },
  access: {
    create: podeEscreverConteudo,
    delete: superAdminOnly,
    read: authenticated,
    update: podeEscreverConteudo,
  },
  hooks: {
    beforeValidate: [uniquePorTenant('slug'), uniquePorTenant('origem'), exigeTimestampDoDesconto],
    beforeChange: [draftOnlyIngestao],
    afterChange: [revalidateAfterChange('ofertas')],
    afterDelete: [revalidateAfterDelete('ofertas')],
  },
  fields: [
    { name: 'loja', type: 'relationship', relationTo: 'lojas', required: true, index: true },
    { name: 'titulo', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true, validate: validaSlugKebab },
    {
      name: 'tipo',
      type: 'select',
      required: true,
      options: ['cupom', 'credito', 'lifetime', 'desconto_api'],
      admin: { description: 'taxonomia do overview Runzos' },
    },
    {
      name: 'preco',
      type: 'group',
      fields: [
        { name: 'valor', type: 'number', min: 0 },
        { name: 'moeda', type: 'text', defaultValue: 'BRL' },
        { name: 'ciclo', type: 'select', options: ['unico', 'mensal', 'anual'] },
        { name: 'preco_em', type: 'date', admin: { description: 'quando o preço foi visto — nunca preço sem timestamp' } },
      ],
    },
    {
      name: 'desconto_loja',
      type: 'group',
      admin: { description: 'o desconto que a LOJA já dá — alimenta o formato empilhado (spec-desconto-e-historico)' },
      fields: [
        {
          name: 'valor',
          type: 'number',
          min: 0,
          // 99 e não 95: o teto de 95 era palpite de plausibilidade, e 4 dos 57 deals do
          // AppSumo publicados têm 96% e 97%. O teto segue existindo pra barrar erro de
          // parsing — 100%+ é bug, não oferta. O 0,95 do `compor()` é outro limite, de
          // composição, e não muda.
          max: 99,
        },
        { name: 'tipo', type: 'select', options: ['percentual', 'valor'], defaultValue: 'percentual' },
        { name: 'moeda', type: 'text', defaultValue: 'BRL', admin: { condition: (_d, sibling) => sibling?.tipo === 'valor' } },
        {
          name: 'verificado_em',
          type: 'date',
          admin: { description: 'quando esse desconto foi visto — obrigatório junto com o valor' },
        },
        { name: 'fonte', type: 'select', options: ['site-loja', 'programa', 'manual'] },
      ],
    },
    {
      name: 'categorias',
      type: 'relationship',
      relationTo: 'categorias_oferta',
      hasMany: true,
      index: true,
      admin: { description: 'categorias do Woo — a página /categoria-oferta/{slug} lista por aqui' },
    },
    { name: 'cupom', type: 'relationship', relationTo: 'cupons' },
    {
      name: 'url_afiliado_fonte',
      type: 'text',
      admin: {
        description: 'destino do /r/o{id} quando não há cupom (crédito, lifetime, desconto já no link)',
      },
    },
    {
      name: 'faq',
      type: 'array',
      admin: { description: 'FAQ que o WP publicava no JSON-LD; vira FAQPage no site (import:faq)' },
      fields: [
        { name: 'pergunta', type: 'text', required: true },
        { name: 'resposta', type: 'textarea', required: true },
      ],
    },
    { name: 'corpo', type: 'richText', required: true },
    {
      name: 'imagem',
      type: 'upload',
      relationTo: 'midia',
      admin: { description: 'imagem do cartão nas vitrines — sem ela o cartão vira só texto' },
    },
    {
      name: 'headline',
      type: 'text',
      maxLength: 160,
      admin: {
        description:
          'a linha abaixo do H1 e no card lateral (migrada do brand_headline do WP). Escreva você — nunca saída de LLM',
      },
    },
    {
      name: 'rotulo_oferta',
      type: 'text',
      maxLength: 60,
      admin: {
        description:
          'o diferencial em uma linha, no destaque do card ("Até 70% de desconto"). É RÓTULO editorial, não medição: não vale como desconto verificado e não entra na composição — para número com data, use desconto_loja',
      },
    },
    {
      name: 'beneficios',
      type: 'array',
      /*
       * A lista "Funcionalidades" da página do WP. Array de objeto e não `text hasMany`
       * porque um dia isto ganha ícone ou destaque por item, e migrar de lista de string
       * pra lista de objeto depois custa migration em cima de dado publicado.
       */
      admin: { description: 'itens da lista de funcionalidades (migrados do benefit_bullets do WP)' },
      fields: [{ name: 'texto', type: 'text', required: true, maxLength: 200 }],
    },
    {
      name: 'resumo',
      type: 'textarea',
      maxLength: 200,
      admin: {
        description:
          'a linha de descrição do cartão (migrada do short_description/excerpt do WP). Escreva você — nunca saída de LLM: aqui se fala de preço e benefício',
      },
    },
    {
      /**
       * A estrutura da página de LIFETIME (contrato: `ofertas.dados`). Espelha
       * `pages.dados`, e pelo mesmo motivo: richText guarda PROSA, não estrutura. Os seis
       * destaques do deal são título + descrição e o FAQ é pergunta + resposta; passando
       * por Lexical viram parágrafos soltos e a página perde o formato. O que é grade
       * continua grade porque o dado continua estruturado.
       */
      name: 'dados',
      type: 'json',
      admin: {
        condition: (data) => data?.tipo === 'lifetime',
        description: 'estrutura da página de lifetime (destaques, veredito, faq) — extraída do WP, nunca de LLM',
      },
    },
    { name: 'destaque', type: 'checkbox', defaultValue: false, admin: { description: 'home/hubs' } },
    { name: 'wordpress_id', type: 'text', unique: true, index: true, admin: { description: '{post_type}:{ID} — import idempotente' } },
    { name: 'slug_wp', type: 'text', index: true },
    { name: 'ancoras_alvo', type: 'text', hasMany: true },
    chaveDeOrigem,
  ],
}
