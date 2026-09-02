import { ValidationError, type CollectionConfig, type CollectionBeforeValidateHook } from 'payload'

import { authenticated, podeEscreverConteudo, superAdminOnly } from '../access/roles'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { draftOnlyIngestao, efetivo, uniquePorTenant, validaSlugKebab } from '../hooks/validations'

/** Template define o que é obrigatório: conteudo/institucional → corpo; apps/calculadora → dados. */
const exigeCampoDoTemplate: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  const template = efetivo<string>(data, originalDoc, 'template') ?? 'conteudo'
  const corpo = efetivo(data, originalDoc, 'corpo')
  const dados = efetivo(data, originalDoc, 'dados')
  if ((template === 'apps' || template === 'calculadora') && (dados === null || dados === undefined)) {
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

/** Pages WP: corpo livre OU template (apps re-render de data/{slug}.json, calculadora como ilha). */
export const Pages: CollectionConfig = {
  slug: 'pages',
  indexes: [{ fields: ['tenant', 'slug'], unique: true }],
  admin: { useAsTitle: 'titulo', group: 'Conteúdo' },
  versions: { drafts: true, maxPerDoc: 50 },
  access: {
    create: podeEscreverConteudo,
    delete: superAdminOnly,
    read: authenticated,
    update: podeEscreverConteudo,
  },
  hooks: {
    beforeValidate: [uniquePorTenant('slug'), exigeCampoDoTemplate],
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
      options: ['conteudo', 'apps', 'calculadora', 'institucional', 'contato', 'indice'],
    },
    { name: 'corpo', type: 'richText', admin: { condition: (data) => data?.template === 'conteudo' || data?.template === 'institucional' } },
    {
      name: 'dados',
      type: 'json',
      admin: {
        condition: (data) => data?.template === 'apps' || data?.template === 'calculadora',
        description: 'dados estruturados do template (json tipado por template — mata o base64)',
      },
    },
    { name: 'ancoras_alvo', type: 'text', hasMany: true },
    { name: 'wordpress_id', type: 'text', unique: true, index: true },
    { name: 'slug_wp', type: 'text', index: true },
  ],
}
