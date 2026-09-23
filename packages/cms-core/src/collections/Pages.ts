import { ValidationError, type CollectionConfig, type CollectionBeforeValidateHook } from 'payload'

import { authenticated, podeEscreverConteudo, superAdminOnly } from '../access/roles'
import { chaveDeOrigem } from '../fields/origem'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { draftOnlyIngestao, efetivo, uniquePorTenant, validaSlugKebab } from '../hooks/validations'

/**
 * Template de página que o SITE acrescenta aos do núcleo (PRD 17 RF1b). O núcleo tem
 * `conteudo`, `institucional`, `contato` e `indice`; um template do site guarda os dados
 * estruturados dele no campo `dados` (json), que pode ser obrigatório ou opcional.
 */
export interface TemplateDePagina {
  valor: string
  dados: 'obrigatorio' | 'opcional'
}

/** Os templates do núcleo, na ordem em que o núcleo os declara. */
export const TEMPLATES_DO_NUCLEO = ['conteudo', 'institucional', 'contato', 'indice'] as const

/** Template define o que é obrigatório: conteudo/institucional → corpo; o do site que pede → dados. */
const exigeCampoDoTemplate = (exigemDados: ReadonlySet<string>): CollectionBeforeValidateHook => ({ data, originalDoc }) => {
  const template = efetivo<string>(data, originalDoc, 'template') ?? 'conteudo'
  const corpo = efetivo(data, originalDoc, 'corpo')
  const dados = efetivo(data, originalDoc, 'dados')
  if (exigemDados.has(template) && (dados === null || dados === undefined)) {
    throw new ValidationError({
      collection: 'pages',
      errors: [{ message: `template "${template}" exige o campo dados (json do template).`, path: 'dados' }],
    })
  }
  /*
   * `contato` fica de fora desta exigência: ali o conteúdo é o FORMULÁRIO, e um texto
   * acima dele é opcional. Exigir corpo obrigaria a inventar prosa pra uma página que
   * precisa de três campos e um botão.
   */
  if ((template === 'conteudo' || template === 'institucional') && (corpo === null || corpo === undefined)) {
    throw new ValidationError({
      collection: 'pages',
      errors: [{ message: `template "${template}" exige corpo (richText).`, path: 'corpo' }],
    })
  }
  return data
}

/** Pages: corpo livre OU template com `dados` (os do site; ex.: ficha renderizada de um json). */
export function paginas(templatesDoSite: readonly TemplateDePagina[] = []): CollectionConfig {
  const comDados = new Set(templatesDoSite.map((t) => t.valor))
  const exigemDados = new Set(templatesDoSite.filter((t) => t.dados === 'obrigatorio').map((t) => t.valor))
  return {
  // ganha o grupo `meta` do plugin de SEO (a fábrica do núcleo lê esta marca — PRD 17 RF1)
  custom: { seo: true },
  slug: 'pages',
  indexes: [
    { fields: ['tenant', 'slug'], unique: true },
    { fields: ['tenant', 'origem'], unique: true },
  ],
  admin: { useAsTitle: 'titulo', group: 'Conteúdo' },
  versions: { drafts: true, maxPerDoc: 50 },
  access: {
    create: podeEscreverConteudo,
    delete: superAdminOnly,
    read: authenticated,
    update: podeEscreverConteudo,
  },
  hooks: {
    beforeValidate: [uniquePorTenant('slug'), uniquePorTenant('origem'), exigeCampoDoTemplate(exigemDados)],
    beforeChange: [draftOnlyIngestao],
    afterChange: [revalidateAfterChange('pages')],
    afterDelete: [revalidateAfterDelete('pages')],
  },
  fields: [
    { name: 'titulo', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true, validate: validaSlugKebab },
    {
      name: 'template',
      type: 'select',
      required: true,
      defaultValue: 'conteudo',
      // a posição final de cada opção é a `ordem.templatesDePagina` do site (`ordem.ts`)
      options: [...TEMPLATES_DO_NUCLEO, ...templatesDoSite.map((t) => t.valor)],
    },
    { name: 'corpo', type: 'richText', admin: { condition: (data) => data?.template === 'conteudo' || data?.template === 'institucional' } },
    {
      name: 'dados',
      type: 'json',
      admin: {
        condition: (data) => comDados.has(data?.template),
        description: 'dados estruturados do template (json tipado por template — mata o base64)',
      },
    },
    { name: 'ancoras_alvo', type: 'text', hasMany: true },
    { name: 'wordpress_id', type: 'text', unique: true, index: true },
    { name: 'slug_wp', type: 'text', index: true },
    chaveDeOrigem,
  ],
  }
}
