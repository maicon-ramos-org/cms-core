import type { CollectionConfig } from 'payload'

import { authenticated, podeEscreverConteudo, superAdminOnly } from '../access/roles'

export const Midia: CollectionConfig = {
  slug: 'midia',
  admin: { group: 'Conteúdo' },
  access: {
    create: podeEscreverConteudo,
    delete: superAdminOnly,
    read: () => true, // arquivos são públicos (servidos nas páginas)
    update: podeEscreverConteudo,
  },
  upload: {
    staticDir: 'media',
    mimeTypes: ['image/*', 'application/pdf'],
    /*
     * Um derivado só, do tamanho do cartão da vitrine. O original migrado do WP tem
     * 1280px de largura e o cartão renderiza em ~300px: a home servia 836KB de imagem
     * onde ~200KB bastam. 640 = 2x do cartão, que cobre tela retina sem virar upscale.
     *
     * NÃO existe um tamanho "grande": no corpo do artigo a imagem ocupa a largura toda
     * e o original é o tamanho certo. Tamanho que ninguém pede é byte em disco e coluna
     * no banco.
     *
     * Isto vale pra upload NOVO. Os 2.534 arquivos que já estavam aqui precisam do
     * `regenera:tamanhos` — o Payload não reprocessa o acervo sozinho.
     */
    imageSizes: [
      {
        name: 'cartao',
        width: 640,
        withoutEnlargement: true,
        /*
         * avif em TODO derivado, independente do formato do original. Medido no acervo:
         * as seis imagens de cartão mais pesadas somavam 146KB mantendo o formato de
         * origem e 62KB em avif — o ganho vem dos PNG e WebP migrados (um PNG de 63KB
         * vira 4KB). Quem já era avif fica igual, então não há troca ruim aqui.
         */
        formatOptions: { format: 'avif', options: {} },
      },
    ],
  },
  fields: [
    { name: 'alt', type: 'text', required: true },
    { name: 'credit', type: 'text' },
    { name: 'wp_url_antiga', type: 'text', index: true, admin: { description: 'manifesto do alias /wp-content/uploads/' } },
  ],
}
