/**
 * Capabilities do plugin de afiliado, descobríveis por consumidores (Hermes, sites) sem
 * conhecer tabelas: `GET /api/afiliado/capabilities` devolve este descritor. Quem exige uma
 * capability falha fechado quando ela falta ou a versão é incompatível (`atendeCapacidades`).
 */
import { CONTEUDO_SCHEMA, JSON_SCHEMA_CONTEUDO_V1, LIMITES_CONTEUDO, REGRAS_FORA_DO_JSON_SCHEMA, STATUS_AUTOMACAO, STATUS_EDITORIAL } from './contrato'

/** Versão do pacote que declara estas capabilities; um teste a mantém igual ao package.json. */
export const VERSAO_PLUGIN_AFILIADO = '0.2.0-next.19'

/**
 * Formato `major.minor`. Compatível = mesmo major e minor >= exigido.
 * - `affiliate.catalog` 2.0: produto → variante → listing, registro de categorias por instância,
 *   identidade de listing com seller, produto canônico dono do conteúdo;
 * - `affiliate.content` 1.0: `product_content/v1` no produto e indexação explícita;
 * - `affiliate.preflight` 1.0: evita geração idêntica sem bloquear atualização;
 * - `affiliate.offer-history` 1.0: histórico de preço append-only por listing.
 */
export const CAPACIDADES_AFILIADO = Object.freeze({
  'affiliate.catalog': '2.0',
  'affiliate.content': '1.0',
  'affiliate.preflight': '1.0',
  'affiliate.offer-history': '1.0',
} as const)
export type NomeCapacidade = keyof typeof CAPACIDADES_AFILIADO

const versao = (v: string): [number, number] | null => {
  const m = /^(\d+)\.(\d+)$/.exec(v)
  return m ? [Number(m[1]), Number(m[2])] : null
}

export interface ResultadoCapacidades { ok: boolean; faltando: string[]; incompativeis: string[] }

/** `oferecidas` vem do endpoint; `exigidas` é o que o consumidor precisa (`{'affiliate.content': '1.0'}`). */
export function atendeCapacidades(oferecidas: Readonly<Record<string, string>> | null | undefined, exigidas: Readonly<Record<string, string>>): ResultadoCapacidades {
  const faltando: string[] = [], incompativeis: string[] = []
  for (const [nome, pedida] of Object.entries(exigidas)) {
    const tem = oferecidas && Object.hasOwn(oferecidas, nome) ? oferecidas[nome] : undefined
    const p = versao(pedida)
    if (tem === undefined) { faltando.push(nome); continue }
    const t = versao(tem)
    if (!p || !t || t[0] !== p[0] || t[1] < p[1]) incompativeis.push(nome)
  }
  return { ok: !faltando.length && !incompativeis.length, faltando, incompativeis }
}

export interface CategoriaDescrita { slug: string; rotulo: string; atributosDeIdentidade: readonly string[]; versaoIdentidade: number; legada: boolean }

export function descritorCapacidades(categorias: readonly CategoriaDescrita[]) {
  return {
    plugin: 'afiliado', version: VERSAO_PLUGIN_AFILIADO, capabilities: CAPACIDADES_AFILIADO,
    content: {
      schema: CONTEUDO_SCHEMA, limits: LIMITES_CONTEUDO, statuses: STATUS_EDITORIAL, automationStatuses: STATUS_AUTOMACAO,
      jsonSchema: JSON_SCHEMA_CONTEUDO_V1,
      // o schema descreve só o formato; revisão e qualidade pertencem ao Hermes
      rulesOutsideJsonSchema: REGRAS_FORA_DO_JSON_SCHEMA,
      rules: ['content_belongs_to_canonical_product', 'draft_first', 'agent_may_update',
        'agent_may_publish_and_index_explicitly', 'indexable_defaults_false', 'facts_hash_supports_idempotency'],
    },
    catalog: {
      // só dados: callbacks de validação do site nunca saem da instância
      categories: categorias.map(c => ({ slug: c.slug, label: c.rotulo, identityAttributes: [...c.atributosDeIdentidade],
        identityVersion: c.versaoIdentidade, legacy: c.legada })),
    },
  }
}
