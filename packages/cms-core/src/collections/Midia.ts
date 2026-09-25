import type { CollectionConfig } from 'payload'

import { authenticated, podeEscreverConteudo, superAdminOnly } from '../access/roles'
import { nomeBaseUnico } from '../hooks/nome-base-unico'
import { ogSemTransparencia } from '../hooks/og-sem-transparencia'
import { derivadosSemSharp } from '../midia/derivados-sem-sharp'

export const Midia: CollectionConfig = {
  slug: 'midia',
  admin: { group: 'Conteúdo' },
  access: {
    create: podeEscreverConteudo,
    delete: superAdminOnly,
    read: () => true, // arquivos são públicos (servidos nas páginas)
    update: podeEscreverConteudo,
  },
  hooks: {
    // dois registros não dividem o nome-base: os derivados herdam esse nome (PRD 18 RF5)
    beforeOperation: [nomeBaseUnico],
    /*
     * Sem `sharp` na config (num Worker), os derivados saem do gerador da fábrica (PRD 24 RF2);
     * com `sharp`, o Payload já os gerou e o primeiro hook não faz nada. Depois, o `og` de
     * imagem transparente com fundo branco, não preto (PRD 18 RF5) — só com `sharp`.
     */
    beforeChange: [derivadosSemSharp, ogSemTransparencia],
  },
  upload: {
    staticDir: 'media',
    mimeTypes: ['image/*', 'application/pdf'],
    /*
     * Três derivados, cada um com UM uso (PRD 18 RF4, ADR-0012; tabela em colecoes.md):
     * `cartao` pra vitrine, `capa` pro hero do post, `og` pra rede social.
     *
     * `cartao`: o original migrado do WP tem 1280px de largura e o cartão renderiza em
     * ~300px: a home servia 836KB de imagem onde ~200KB bastam. 640 = 2x do cartão, que
     * cobre tela retina sem virar upscale.
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
      {
        /*
         * O hero do post: 1600×900, recorte 16:9 pelo centro. 1600 cobre a capa no
         * desktop (~896px de largura) em tela retina. Portado do `toAvif()` do Alma
         * (`packages/core/src/cli/rehost-images.ts`), que mediu 60–90% de redução em
         * capas geradas por IA com AVIF q55.
         *
         * `withoutEnlargement: false` É DE PROPÓSITO, e é o que faz o derivado existir.
         * Medido no acervo em 2026-09-23: 778 das 782 capas de post têm menos de
         * 1600×900 (372 são 1280×720, 180 são 1200×630). Com o campo indefinido (padrão
         * do Payload 3.88), `getImageResizeAction` devolve `'omit'` quando a original é
         * menor nos DOIS eixos: a `capa` simplesmente não seria gerada para 99,5% dos
         * posts. E `true` também não serve: com `cover`, o sharp deixa de recortar para
         * 16:9 — medido no sharp 0.34.2, 1200×630 continua 1200×630 e 1536×1024 vira
         * 1536×900 —, que é o motivo de o próprio `toAvif()` do Alma ampliar. Ampliar
         * 1280→1600 (25% por eixo) sai barato em AVIF: na capa usada na prova do RF4,
         * 19,9KB na `capa` 1600×900 contra 14,1KB da original 1280×720.
         */
        name: 'capa',
        width: 1600,
        height: 900,
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: false,
        formatOptions: { format: 'avif', options: { quality: 55 } },
      },
      {
        /*
         * A imagem de compartilhamento (`og:image` / `twitter:image`): 1200×630 é a
         * medida que Facebook, LinkedIn e o cartão grande do X pedem. JPEG e não AVIF
         * porque rede social NÃO lê AVIF — e por isso também não há "fallback" da
         * `capa` no `og:image`: sem este derivado, a página não emite a etiqueta.
         *
         * Amplia pelo mesmo motivo da `capa`: 28 das 782 capas de post seriam omitidas
         * com o padrão do Payload (as menores que 1200×630 nos dois eixos).
         */
        name: 'og',
        width: 1200,
        height: 630,
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: false,
        formatOptions: { format: 'jpeg', options: { quality: 80 } },
      },
    ],
  },
  fields: [
    { name: 'alt', type: 'text', required: true },
    { name: 'credit', type: 'text' },
    { name: 'wp_url_antiga', type: 'text', index: true, admin: { description: 'manifesto do alias /wp-content/uploads/' } },
  ],
}
