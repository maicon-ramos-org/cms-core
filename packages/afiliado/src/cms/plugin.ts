import type { Field, Plugin } from 'payload'

import { acrescentaAoGrupoDoTenant, acrescentaCamposAoTenant, acrescentaDestinosDoAutoLinker } from '@runzos/cms-core'

import { protegeReferencias } from './catalogo/protegeReferencias'
import { Banners } from './collections/Banners'
import { catalogoFisico } from './collections/CatalogoFisico'
import { CategoriasOferta } from './collections/CategoriasOferta'
import { Cliques } from './collections/Cliques'
import { Cupons } from './collections/Cupons'
import { HistoricoDesconto } from './collections/HistoricoDesconto'
import { Lojas } from './collections/Lojas'
import { Ofertas } from './collections/Ofertas'
import { Produtos } from './collections/Produtos'
import { snapshotDescontoTask } from './jobs/snapshotDesconto'

/**
 * O plugin de afiliado (PRD 17 RF1, ADR-0011): tudo o que um site de cupom e oferta
 * acrescenta ao núcleo, num plugin do Payload — como o `plugin-seo` acrescenta o `meta`.
 * - as coleções de loja, cupom, oferta, produto, banner, clique, histórico de desconto,
 *   categoria de oferta e as seis do catálogo físico (ADR-0010);
 * - `programas_ativos` em `tenants`, e `title_pattern_loja` no grupo `tenants.seo`;
 * - `lojas`, `ofertas` e `produtos` como destino de link do auto-linker;
 * - a proteção de referência do catálogo físico em TODA coleção — inclusive nas do núcleo,
 *   como `midia` e `tenants`, que o catálogo referencia;
 * - a tarefa do snapshot diário de desconto. QUANDO ela roda é do site (`jobs.autoRun`).
 *
 * Acrescenta no fim; a posição final de cada coisa é a `ordem` que o site passa à fábrica.
 */
export const programasAtivos: Field = {
  name: 'programas_ativos',
  type: 'array',
  admin: { description: 'IDs/tags de afiliado NUNCA no banco — aqui vai o NOME da env var' },
  fields: [
    {
      name: 'programa',
      type: 'select',
      required: true,
      options: ['hostinger', 'cloudways', 'amazon', 'shopee', 'awin', 'impact', 'mercadolivre', 'hotmart', 'direto', 'outro'],
    },
    {
      name: 'id_afiliado_env',
      type: 'text',
      required: true,
      admin: { description: 'ex.: AFF_AMAZON_TAG — o valor mora no .env do web/bot' },
    },
  ],
}

const titlePatternLoja: Field = {
  name: 'title_pattern_loja',
  type: 'text',
  required: true,
  defaultValue: '{n} Cupons {loja} Testados em {mes} {ano}',
}

export const afiliado = (): Plugin => (config) => {
  let c: typeof config = {
    ...config,
    collections: [
      ...(config.collections ?? []),
      Lojas,
      Cupons,
      Ofertas,
      Produtos,
      Banners,
      Cliques,
      HistoricoDesconto,
      CategoriasOferta,
      ...catalogoFisico,
    ],
    jobs: { ...config.jobs, tasks: [...(config.jobs?.tasks ?? []), snapshotDescontoTask] },
  }
  c = acrescentaCamposAoTenant(c, [programasAtivos])
  c = acrescentaAoGrupoDoTenant(c, 'seo', [titlePatternLoja])
  c = acrescentaDestinosDoAutoLinker(c, ['lojas', 'ofertas', 'produtos'])
  return { ...c, collections: (c.collections ?? []).map(protegeReferencias) }
}
