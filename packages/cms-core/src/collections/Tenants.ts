import { ValidationError, type CollectionBeforeValidateHook, type CollectionConfig, type Field } from 'payload'

import { GRUPOS_DE_TEMA, PARES_CRITICOS, contraste } from '../lib/contraste'

/**
 * Regra 4 do design-tokens.md ("falhou, não sobe") aplicada no schema: cor é dado
 * editável, então a régua de contraste tem que morar aqui, não só no CI. Erro 400 com
 * `path` — o contrato pro agente, mesma convenção das outras coleções.
 *
 * Roda nos DOIS conjuntos de valores (PRD 12 RF3). O `path` diz em qual deles falhou:
 * `tema.cor_apoio` e `tema_escuro.cor_apoio` são erros diferentes, e quem recebe o 400
 * precisa saber qual paleta corrigir.
 */
const validaContraste: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  for (const grupo of GRUPOS_DE_TEMA) {
    const tema = {
      ...(originalDoc?.[grupo] ?? {}),
      ...(data?.[grupo] ?? {}),
    } as Record<string, unknown>
    // paleta escura desligada não tem o que reprovar — o site nem a emite
    if (grupo === 'tema_escuro' && tema.ativo !== true) continue
    for (const par of PARES_CRITICOS) {
      const frente = tema[par.frente]
      const fundo = tema[par.fundo]
      if (typeof frente !== 'string' || typeof fundo !== 'string' || !frente || !fundo) continue
      const ratio = contraste(frente, fundo)
      if (ratio === null) continue // hex inválido é problema do validate do campo
      if (ratio < par.minimo) {
        throw new ValidationError({
          collection: 'tenants',
          errors: [
            {
              message: `contraste ${ratio.toFixed(2)}:1 entre ${frente} e ${fundo} (${par.rotulo}) — mínimo WCAG AA é ${par.minimo}:1`,
              path: `${grupo}.${par.frente}`,
            },
          ],
        })
      }
    }
  }
  return data
}

/**
 * Os papéis de cor, em UMA lista — e as duas paletas nascem dela.
 *
 * Não é abstração por gosto: se o claro e o escuro fossem dois blocos de campos escritos à
 * mão, o dia em que alguém acrescentasse um papel só no claro o site ficaria com um token
 * indefinido no escuro — e o defeito apareceria em produção, à noite, na tela de quem
 * nunca reporta bug. Aqui é impossível declarar um papel só de um lado.
 *
 * O `validate` de hex existe porque a régua de contraste DEPENDE dele: `contraste()`
 * devolve `null` pro que não é hex, e null passa batido pela trava. Sem este validate, a
 * paleta reprovada entra pela porta de "roxo" em vez de "#6F57D3".
 */
const PAPEIS_DE_COR: Array<{ nome: string; descricao?: string }> = [
  // marca
  { nome: 'cor_primaria', descricao: 'marca: header, links, títulos de seção' },
  { nome: 'cor_sobre_marca', descricao: 'texto POR CIMA da cor da marca — chip ativo, CTA do cabeçalho' },
  { nome: 'cor_fundo' },
  // ação que monetiza — o par action/on_action é o que passa 6,82 no WCAG
  { nome: 'cor_acao', descricao: 'SÓ o botão que leva à loja (/r/{id}) — nenhum outro elemento' },
  { nome: 'cor_sobre_acao', descricao: 'texto dentro do botão de ação' },
  // sinalização
  { nome: 'cor_desconto', descricao: 'o número do desconto e badges' },
  { nome: 'cor_verificado', descricao: 'selo de verificação e checks' },
  // texto e superfícies
  { nome: 'cor_texto' },
  { nome: 'cor_apoio', descricao: 'legendas — passa em todos os fundos suaves' },
  { nome: 'cor_sutil', descricao: 'breadcrumb, placeholder' },
  { nome: 'cor_superficie' },
  { nome: 'cor_superficie_marca' },
  { nome: 'cor_superficie_verificado', descricao: 'fundo do selo de verificação' },
  { nome: 'cor_borda', descricao: 'borda de cartão, cabeçalho, tabela e menu' },
  { nome: 'cor_borda_codigo', descricao: 'borda tracejada do código do cupom (que É o botão de copiar)' },
  { nome: 'cor_superficie_expirado', descricao: 'acordeão de cupons expirados — nunca via opacity, que derruba o contraste' },
  { nome: 'cor_aviso', descricao: 'aviso dentro do bloco de expirados' },
]

const EH_HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const camposDeCor = (padroes: Record<string, string>, obrigatorios: string[] = []): Field[] =>
  PAPEIS_DE_COR.map(
    (papel): Field => ({
      name: papel.nome,
      type: 'text',
      required: obrigatorios.includes(papel.nome),
      defaultValue: padroes[papel.nome],
      validate: (value: string | null | undefined) =>
        !value || EH_HEX.test(value) || 'cor deve ser hex (#rgb ou #rrggbb) — a régua de contraste não lê outro formato',
      ...(papel.descricao ? { admin: { description: papel.descricao } } : {}),
    }),
  )

/** design-tokens.md v1.0.0, aprovado 27/08 com auditoria WCAG AA. */
const PADRAO_CLARO: Record<string, string> = {
  cor_primaria: '#6F57D3',
  cor_sobre_marca: '#ffffff',
  cor_fundo: '#ffffff',
  cor_acao: '#07C03B',
  cor_sobre_acao: '#04240b',
  cor_desconto: '#AC0167',
  cor_verificado: '#0a7a2c',
  cor_texto: '#242424',
  cor_apoio: '#6b6b6b',
  cor_sutil: '#746a90',
  cor_superficie: '#ffffff',
  cor_superficie_marca: '#faf9ff',
  cor_superficie_verificado: '#f4fdf7',
  cor_borda: '#e7e4f0',
  cor_borda_codigo: '#cbbff0',
  cor_superficie_expirado: '#f4f6f9',
  cor_aviso: '#9a5b08',
}

/**
 * PRD 12 — a paleta escura de referência, auditada com `lib/contraste.ts` nos 11 pares
 * críticos (o mais apertado sobra 1,5 ponto acima do mínimo).
 *
 * A marca CLAREIA (#6F57D3 → #B5A5F5) e o verde da ação também: cor escolhida para fundo
 * branco fica sem saturação percebida no escuro, e o botão que monetiza é o último lugar
 * onde se aceita isso. Já o texto DENTRO do botão inverte — vira quase-preto —, porque no
 * verde vivo do escuro é o escuro que contrasta.
 */
const PADRAO_ESCURO: Record<string, string> = {
  cor_primaria: '#B5A5F5',
  cor_sobre_marca: '#17132A',
  cor_fundo: '#121019',
  cor_acao: '#22C55E',
  cor_sobre_acao: '#062B12',
  cor_desconto: '#FF6FB1',
  cor_verificado: '#4ADE80',
  cor_texto: '#ECE9F5',
  cor_apoio: '#A9A2BD',
  cor_sutil: '#948DB0',
  cor_superficie: '#1B1826',
  cor_superficie_marca: '#221E33',
  cor_superficie_verificado: '#10261A',
  cor_borda: '#2E2A42',
  cor_borda_codigo: '#4A3F78',
  cor_superficie_expirado: '#191725',
  cor_aviso: '#F0B45E',
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
      name: 'nicho',
      type: 'text',
      maxLength: 60,
      admin: {
        description:
          'O tema da casa, em minúsculas e na forma que cabe DEPOIS de "de": "software e hospedagem", ' +
          '"impressão 3D". Entra no <title> da home, no manifest e no .well-known/mcp.json. ' +
          'Vazio, a frase simplesmente não sai (PRD 14 D4) — título curto é melhor que título de outro nicho.',
      },
    },
    {
      name: 'canonical_host',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      // o site troca este texto pelo dele (`ajustaCampo`), sem mudar o campo
      admin: { description: 'exemplo.com, loja.exemplo.com — migração de domínio = trocar aqui + 301' },
    },
    {
      name: 'tema',
      type: 'group',
      admin: {
        description:
          'Papéis do design system (design-tokens.md v1.0.0, auditado WCAG AA). Cor é DADO do tenant: o CSS do site nunca fixa hex, senão o multi-tenant quebra.',
      },
      fields: [
        ...camposDeCor(PADRAO_CLARO, ['cor_primaria', 'cor_fundo']),
        { name: 'logo', type: 'upload', relationTo: 'midia' },
        {
          name: 'favicon',
          type: 'upload',
          relationTo: 'midia',
          admin: {
            description:
              'ícone QUADRADO da aba. Separado do logo porque o logo costuma ser letreiro (largo e baixo) e ' +
              'letreiro em 16px é borrão — não é a mesma imagem em tamanho menor.',
          },
        },
        /*
         * O CONJUNTO de ícones, não um arquivo só. `favicon` acima é o histórico; cada
         * plataforma pede um formato próprio, e todos saem da MÍDIA do tenant — ícone em
         * `public/` é marca cravada, e o segundo tenant tem a dele.
         *
         * Recorte os cinco do LOGO vetorial, não de um PNG pequeno: recortado do vetor, o mesmo
         * símbolo sai nítido em 512.
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
      name: 'tema_escuro',
      type: 'group',
      admin: {
        description:
          'PRD 12 — os MESMOS papéis, com os valores de quando o sistema do leitor está no escuro. ' +
          'Não é filtro sobre o claro: é dado, e passa pela mesma trava de contraste. Sem `ativo`, o site serve só o claro.',
      },
      fields: [
        {
          name: 'ativo',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            description:
              'desligado, o site declara `color-scheme: light` e ignora a preferência do sistema — ' +
              'é o certo pra tenant cuja paleta escura ninguém curou ainda. Melhor claro do que um escuro chutado.',
          },
        },
        ...camposDeCor(PADRAO_ESCURO),
        {
          name: 'logo',
          type: 'upload',
          relationTo: 'midia',
          admin: {
            description:
              'OPCIONAL. Só preencha se o letreiro do tema claro for de tinta escura — aí ele some no fundo escuro. ' +
              'Vazio, o cabeçalho usa o logo normal, que é o caso de quem tem logo colorido ou claro.',
          },
        },
      ],
    },
    {
      name: 'webmcp_polyfill',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'carrega o polyfill do WebMCP em quem NÃO tem suporte nativo (~20KB, sob demanda). Desligado por padrão: sem extensão que consuma, as ferramentas registradas não são lidas por ninguém',
      },
    },
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
      name: 'seo',
      type: 'group',
      fields: [
        { name: 'gsc_property', type: 'text' },
        { name: 'sitemap_enabled', type: 'checkbox', defaultValue: true },
      ],
    },
  ],
}
