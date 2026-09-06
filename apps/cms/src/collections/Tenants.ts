import { ValidationError, type CollectionBeforeValidateHook, type CollectionConfig } from 'payload'

import { PARES_CRITICOS, contraste } from '../lib/contraste'

/**
 * Regra 4 do design-tokens.md ("falhou, não sobe") aplicada no schema: cor é dado
 * editável, então a régua de contraste tem que morar aqui, não só no CI. Erro 400 com
 * `path` — o contrato pro agente, mesma convenção das outras coleções.
 */
const validaContraste: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  const tema = { ...(originalDoc?.tema ?? {}), ...(data?.tema ?? {}) } as Record<string, string | undefined>
  for (const par of PARES_CRITICOS) {
    const frente = tema[par.frente]
    const fundo = tema[par.fundo]
    if (!frente || !fundo) continue
    const ratio = contraste(frente, fundo)
    if (ratio === null) continue // hex inválido é problema do validate do campo
    if (ratio < par.minimo) {
      throw new ValidationError({
        collection: 'tenants',
        errors: [
          {
            message: `contraste ${ratio.toFixed(2)}:1 entre ${frente} e ${fundo} (${par.rotulo}) — mínimo WCAG AA é ${par.minimo}:1`,
            path: `tema.${par.frente}`,
          },
        ],
      })
    }
  }
  return data
}

import { authenticated, superAdminOnly } from '../access/roles'

/** Contrato colecoes.md — tenants: o coração do multi-tenant. */
export const Tenants: CollectionConfig = {
  slug: 'tenants',
  hooks: { beforeValidate: [validaContraste] },
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
      admin: {
        description:
          'Papéis do design system (design-tokens.md v1.0.0, auditado WCAG AA). Cor é DADO do tenant: o CSS do site nunca fixa hex, senão o multi-tenant quebra.',
      },
      fields: [
        // marca
        { name: 'cor_primaria', type: 'text', required: true, defaultValue: '#6F57D3', admin: { description: 'marca: header, links, títulos de seção' } },
        { name: 'cor_fundo', type: 'text', required: true, defaultValue: '#ffffff' },
        // ação que monetiza — o par action/on_action é o que passa 6,82 no WCAG
        { name: 'cor_acao', type: 'text', defaultValue: '#07C03B', admin: { description: 'SÓ o botão que leva à loja (/r/{id}) — nenhum outro elemento' } },
        { name: 'cor_sobre_acao', type: 'text', defaultValue: '#04240b', admin: { description: 'texto dentro do botão de ação (escuro: branco no verde reprova, 2,44)' } },
        // sinalização
        { name: 'cor_desconto', type: 'text', defaultValue: '#AC0167', admin: { description: 'o número do desconto e badges' } },
        { name: 'cor_verificado', type: 'text', defaultValue: '#0a7a2c', admin: { description: 'selo de verificação e checks' } },
        // texto e superfícies
        { name: 'cor_texto', type: 'text', defaultValue: '#242424' },
        { name: 'cor_apoio', type: 'text', defaultValue: '#6b6b6b', admin: { description: 'legendas — passa em todos os fundos suaves' } },
        { name: 'cor_sutil', type: 'text', defaultValue: '#746a90', admin: { description: 'breadcrumb, placeholder' } },
        { name: 'cor_superficie', type: 'text', defaultValue: '#ffffff' },
        { name: 'cor_superficie_marca', type: 'text', defaultValue: '#faf9ff' },
        { name: 'cor_superficie_verificado', type: 'text', defaultValue: '#f4fdf7', admin: { description: 'fundo do selo de verificação' } },
        { name: 'cor_borda_codigo', type: 'text', defaultValue: '#cbbff0', admin: { description: 'borda tracejada do código do cupom (que É o botão de copiar)' } },
        { name: 'cor_superficie_expirado', type: 'text', defaultValue: '#f4f6f9', admin: { description: 'acordeão de cupons expirados — nunca via opacity, que derruba o contraste' } },
        { name: 'cor_aviso', type: 'text', defaultValue: '#9a5b08', admin: { description: 'aviso dentro do bloco de expirados' } },
        { name: 'logo', type: 'upload', relationTo: 'midia' },
        {
          name: 'favicon',
          type: 'upload',
          relationTo: 'midia',
          admin: {
            description:
              'ícone QUADRADO da aba. Separado do logo porque o logo é letreiro (1324x215 no runzos) e ' +
              'letreiro em 16px é borrão — não é a mesma imagem em tamanho menor.',
          },
        },
        /*
         * O CONJUNTO de ícones, não um arquivo só. `favicon` acima é o histórico; cada
         * plataforma pede um formato próprio, e todos saem da MÍDIA do tenant — ícone em
         * `public/` é marca cravada, e o segundo tenant tem a dele.
         *
         * Os cinco vieram do LOGO vetorial (o "O" de RUNZOS), não do PNG de 208px que o
         * WordPress serve: recortado do vetor, o mesmo símbolo sai nítido em 512.
         */
        {
          name: 'icones',
          type: 'group',
          fields: [
            { name: 'svg', type: 'upload', relationTo: 'midia', admin: { description: 'vetor — navegador moderno, nítido em qualquer tamanho' } },
            { name: 'ico', type: 'upload', relationTo: 'midia', admin: { description: 'favicon.ico 32px — navegador antigo' } },
            { name: 'apple', type: 'upload', relationTo: 'midia', admin: { description: 'apple-touch-icon 180px — atalho no iOS' } },
            { name: 'png192', type: 'upload', relationTo: 'midia', admin: { description: 'manifest 192px — Android' } },
            { name: 'png512', type: 'upload', relationTo: 'midia', admin: { description: 'manifest 512px — splash da PWA' } },
          ],
        },
        { name: 'fonte_titulos', type: 'text', defaultValue: 'Lexend Deca', admin: { description: 'família self-hosted (PRD 02)' } },
        { name: 'fonte_corpo', type: 'text', defaultValue: 'Open Sans', admin: { description: 'família self-hosted (PRD 02)' } },
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
    {
      name: 'webmcp_polyfill',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'carrega o polyfill do WebMCP em quem NÃO tem suporte nativo (~20KB, sob demanda). Desligado por padrão: sem extensão que consuma, as ferramentas registradas não são lidas por ninguém',
      },
    },
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
