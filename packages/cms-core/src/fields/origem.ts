import type { Field } from 'payload'

/**
 * CHAVE DE ORIGEM — a idempotência que o slug não dá (incidente de 2026-09-19).
 *
 * O QUE JÁ EXISTE. O índice único `(tenant, slug)` e o upsert por slug dos publicadores
 * (`por_slug()` e, se achou, `PATCH` em vez de `POST`) barram a retentativa que repete o
 * mesmo POST — foi essa a causa dos 53 posts duplicados apagados em 19/09, publicados até
 * 5 vezes com os sufixos `-2`…`-5` que o WordPress inventava na colisão.
 *
 * A FRESTA QUE SOBRA. Editar o campo `slug` no JSON de origem: o `por_slug()` não acha
 * nada, o índice único não vê colisão (o slug é NOVO) e nasce um documento gêmeo. A guarda
 * por título idêntico é paliativo heurístico — se slug e título mudarem juntos, ela não vê.
 *
 * O CONSERTO. Uma chave que não é derivada de nada que o editor mexe: o identificador do
 * ARTEFATO que gerou o documento. Ele não muda quando o título ou o slug mudam, e é por
 * isso que serve de chave de upsert.
 *
 * ÚNICO POR TENANT, NÃO GLOBAL — ao contrário de `wordpress_id`, e igual a `slug`. Dois
 * tenants podem legitimamente gerar documento a partir do mesmo caminho de vault; o
 * backstop é `indexes: [{ fields: ['tenant', 'origem'], unique: true }]` em cada coleção, e
 * o 400 com `path` vem do hook `uniquePorTenant('origem')` (a mesma convenção do slug).
 *
 * OPCIONAL DE PROPÓSITO. Nulo é o valor honesto de quem veio do import do WordPress ou foi
 * criado à mão, e não existe backfill: chave de origem adivinhada é pior que ausente,
 * porque passa a casar documento errado. O Postgres aceita N linhas nulas num índice
 * único, então o acervo antigo inteiro convive sem colidir.
 */
export const chaveDeOrigem: Field = {
  name: 'origem',
  type: 'text',
  index: true,
  admin: {
    description:
      'chave de origem: identificador ESTÁVEL do artefato que gerou este documento (ex.: vault:modelos-paginas/data/qwen3.json). Único por tenant. Não é slug, não vira URL e não muda quando o título ou o slug mudam — é isso que o torna útil como chave de upsert da esteira. Vazio em documento antigo ou feito à mão',
  },
}
