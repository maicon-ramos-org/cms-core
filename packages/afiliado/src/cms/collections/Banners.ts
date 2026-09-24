import type { CollectionConfig } from 'payload'

import { authenticated, podeEscreverConteudo } from '@maicon-ramos-org/cms-core'
import { revalidateAfterChange, revalidateAfterDelete } from '@maicon-ramos-org/cms-core'
import { tagsDaLoja } from '../hooks/tags-loja'

/**
 * Banner promocional (contrato colecoes.md). Existe porque a home do WordPress tem um, e
 * ele é conteúdo do tenant — imagem em `public/` seria marca hardcoded.
 *
 * O DESTINO É UM RELACIONAMENTO com oferta, não um campo de URL. Não é limitação: campo de
 * URL livre num banner é o caminho mais fácil pra um link de afiliado entrar cru no HTML
 * sem passar pelo `/r/{id}`, que é regra dura do projeto. O banner do WP já apontava pra
 * página da oferta; o schema apenas garante que continue assim.
 */
export const Banners: CollectionConfig = {
  slug: 'banners',
  admin: {
    group: 'Conteúdo',
    useAsTitle: 'nome',
    defaultColumns: ['nome', 'posicao', 'ativo', 'termina_em'],
  },
  access: {
    read: authenticated,
    create: podeEscreverConteudo,
    update: podeEscreverConteudo,
    delete: podeEscreverConteudo,
  },
  hooks: {
    afterChange: [revalidateAfterChange('banners', { tagsExtras: tagsDaLoja })],
    afterDelete: [revalidateAfterDelete('banners', { tagsExtras: tagsDaLoja })],
  },
  fields: [
    {
      name: 'nome',
      type: 'text',
      required: true,
      admin: { description: 'rótulo interno — não aparece no site' },
    },
    {
      name: 'imagem',
      type: 'upload',
      relationTo: 'midia',
      required: true,
      admin: { description: 'versão larga (ex.: 970x250). O alt sai da mídia' },
    },
    {
      name: 'imagem_mobile',
      type: 'upload',
      relationTo: 'midia',
      admin: { description: 'versão estreita (300x250). Sem ela, a larga serve as duas' },
    },
    {
      name: 'oferta',
      type: 'relationship',
      relationTo: 'ofertas',
      required: true,
      admin: { description: 'destino do clique — sempre uma página nossa, nunca URL externa' },
    },
    {
      name: 'posicao',
      type: 'select',
      required: true,
      defaultValue: 'home_topo',
      options: ['home_topo'],
      admin: { description: 'um slot hoje; o campo existe pra o segundo não virar hardcode' },
    },
    { name: 'ativo', type: 'checkbox', defaultValue: true },
    {
      name: 'inicia_em',
      type: 'date',
      admin: { description: 'opcional — fora da janela, o banner não renderiza' },
    },
    { name: 'termina_em', type: 'date' },
  ],
}
