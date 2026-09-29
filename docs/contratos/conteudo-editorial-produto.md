# Conteúdo editorial do produto canônico (`product_content/v1`)

Status: implementado em `afiliado@0.2.0-next.18` (consumo só depois da publicação confirmada;
merge/CI não publicam pacote). Contrato escrito para o plugin de afiliado, sem conhecer site,
tenant, vertical ou loja.

## Princípios

1. **Conteúdo pertence ao produto canônico** (`produtos_fisicos`), nunca à variante, ao
   listing ou à oferta. Oferta guarda só o dado comercial e sua frescura (`observado_em`).
2. **Draft-first.** Automação cria conteúdo como `rascunho`; aprovar, publicar e indexar são
   decisões humanas.
3. **Sem sobrescrita automática.** Conteúdo existente só muda por edição humana ou por um
   refresh que um editor pediu de forma explícita.
4. **Idempotência.** `facts_hash` (SHA-256 do pacote factual) e `content_version` tornam a
   reescrita repetível: mesma hash, mesma saída, nenhuma escrita.
5. **Preço, estoque, promoção e link não entram no texto editorial** (o validador rejeita
   `R$ 99` e "50 reais"); o site os lê da oferta, com data.
6. **Sem schema duplicado:** os campos vivem uma vez, em `produtos_fisicos`; DTO, Markdown,
   JSON-LD e JSON Schema saem do mesmo módulo puro (`afiliado/conteudo`).

## Campos em `produtos_fisicos`

| Campo | Tipo | Regra |
|---|---|---|
| `meta_title` | text | ≤ 60 caracteres |
| `meta_description` | text | ≤ 155 caracteres |
| `resumo` | textarea | ≤ 1000 |
| `descricao_markdown` | textarea | ≤ 20000 |
| `destaques` | json | lista de 1–12 textos de até 200 |
| `faq` | json | lista de 1–12 `{pergunta, resposta}`; objeto estrito, sem campo extra, sem pergunta repetida |
| `facts_hash` | text | SHA-256 hexadecimal minúsculo (64) |
| `content_generator` | text | gerador/modelo, ≤ 100 |
| `prompt_version` | text | opcional, ≤ 60 |
| `content_version` | number | **do CMS**: 1 na primeira gravação, +1 a cada mudança aceita; valor enviado é ignorado |
| `editorial_status` | select | `sem_conteudo` (default), `rascunho`, `em_revisao`, `aprovado` |
| `editorial_refresh_em` / `editorial_refresh_motivo` | date / text | marcador de refresh, só editor |
| `indexavel` | checkbox | **default `false`** |
| `descricao` | textarea | legado, preservado (ver migração) |

Campos JSON são validados por tipo em `beforeChange` (path do erro: `faq.0.resposta`).
Completo = todos os campos de conteúdo + `facts_hash` + `content_generator`.

## Quem pode o quê

Editor humano = `super-admin` ou `editor`. Todo o resto (`ingestao`, `agente`, script sem
usuário) é automação.

| Ação | Automação | Editor |
|---|---|---|
| Criar conteúdo em produto vazio | sim, pacote completo, vira `rascunho` | sim (rascunho pode ser parcial) |
| Preencher campo vazio de produto com conteúdo | sim, pacote completo | sim |
| Alterar/limpar campo já preenchido (inclui `descricao`, `facts_hash`) | **não** — salvo refresh pendente | sim |
| Reenviar o mesmo conteúdo | sim, no-op (versão não muda) | sim |
| `editorial_status` | só `sem_conteudo`/`rascunho`/`em_revisao` | qualquer |
| `em_revisao`/`aprovado` | exigem conteúdo completo e válido | idem |
| Pedir ou limpar refresh | **não** | sim (só onde há conteúdo) |
| `indexavel: true` | **não** | só com `estado=published`, `aprovado` e conteúdo completo |

O portão fecha sozinho: sair de `aprovado` (ou perder completude) desliga `indexavel`.

### Refresh explícito

1. Editor grava `editorial_refresh_em` (+ motivo).
2. A automação envia o pacote completo novo: passa **uma vez**. O CMS limpa o marcador,
   devolve `editorial_status` a `rascunho`, desliga `indexavel` e incrementa `content_version`.
3. Uma segunda reescrita exige novo pedido. Pedir e reescrever na mesma chamada é recusado
   (o marcador só vale se já estava gravado).

## Preflight editorial (`affiliate.preflight` 1.0)

Função pura `planoDeConteudo(produto | null, { facts_hash })`, sobre campos legíveis por REST:

| Situação | Decisão |
|---|---|
| produto inexistente no tenant | `gerar` (`produto_novo`) |
| existe, sem conteúdo (nem `descricao`) | `gerar` (`sem_conteudo`) |
| existe com conteúdo, mesma `facts_hash` | `reutilizar` |
| existe com conteúdo, sem refresh | `nao_gerar` (`conteudo_existente`) — mesmo "fraco" |
| refresh pendente, `facts_hash` nova | `refresh` |
| refresh pendente, mesma `facts_hash` | `reutilizar` |
| refresh pendente, sem `facts_hash` | `nao_gerar` |

Consumidores em outra linguagem reimplementam a tabela; o CMS revalida tudo na escrita.
Matching e escolha de variante/listing continuam fora deste contrato.

## Capabilities

`GET /api/afiliado/capabilities` (usuário autenticado; a identidade pública `site-reader`
não passa; `Cache-Control: no-store`) devolve:

```json
{
  "plugin": "afiliado",
  "version": "0.2.0-next.18",
  "capabilities": {
    "affiliate.catalog": "2.0",
    "affiliate.content": "1.0",
    "affiliate.preflight": "1.0",
    "affiliate.offer-history": "1.0"
  },
  "content": { "schema": "product_content/v1", "limits": {}, "statuses": [], "jsonSchema": {}, "rules": [] },
  "catalog": { "categories": [{ "slug": "", "label": "", "identityAttributes": [], "identityVersion": 1, "legacy": false }] }
}
```

Versões são `major.minor`: compatível = mesmo major e minor ≥ o exigido
(`atendeCapacidades`). O consumidor **falha fechado** quando a capability falta ou é
incompatível — por exemplo, um site em `afiliado` ≤ `next.17` responde 404 nesse caminho e
não deve receber escrita de conteúdo. `affiliate.catalog` 2.0 reúne o modelo
produto→variante→listing, o registro de categorias por instância e a identidade de listing
com seller; `affiliate.offer-history` 1.0 é o histórico append-only de preço. A capability
descreve o **contrato** que o pacote instalado oferece, não que o site já migrou o banco:
a migration continua sendo pré-requisito (o gate `confere:schema` a exige).

O endpoint só descreve a instância (versões, limites, categorias — nunca callbacks do site
nem dado de tenant).

## Migração e compatibilidade

- Só colunas novas, todas nulas ou com default (`editorial_status='sem_conteudo'`,
  `indexavel=false`); linhas existentes ficam iguais. A migration da referência
  (`20260929_125623_conteudo_editorial_produto`) é o modelo; cada site gera a sua com
  `payload migrate:create` contra o pacote instalado (30 instruções: 14 colunas na tabela
  principal, 14 na de versões, 2 enums).
- `descricao` **não é apagada nem copiada sozinha**. O DTO cai para ela como texto
  (`origin: "legado"`), que nunca torna o produto indexável. Automação também não a
  sobrescreve.
- Promoção opt-in da descrição antiga: `SQL_BACKFILL_DESCRICAO_LEGADA` (exportado por
  `afiliado/cms`) copia `descricao` para `descricao_markdown` como `rascunho`, só onde o
  conteúdo estruturado está vazio e o status é `sem_conteudo`; idempotente, não sobrescreve,
  não liga `indexavel`, não toca a tabela de versões. Rode na migration do site se e quando
  o editor quiser (acrescente `AND tenant_id = <id>` para um tenant).
- Tenant: além do isolamento do multi-tenant, as coleções do catálogo agora recusam escrita
  cujo `tenant` não seja um dos do usuário (super-admin exceto) — antes, o `tenant` do corpo
  bastava para criar documento em outro tenant.

## DTO para o site (`@maicon-ramos-org/afiliado/conteudo`)

Módulo puro (sem Payload/Node), para HTML, `.md` e JSON-LD do **mesmo** produto:

- `produtoEditorialDTO(produto)` → `{ schema, slug, name, brand, model, category, origin,
  content: { metaTitle, metaDescription, summary, descriptionMarkdown, highlights, faq },
  provenance, editorial, indexable }`. `indexable` só é `true` com `indexavel`, `published`,
  `aprovado` e conteúdo completo e válido.
- `produtoMarkdown(dto)`: conteúdo estável, sem oferta. Preço/oferta são do site, com data.
- `produtoJsonLd(dto, { canonical, imagem?, ofertas? })`: `Product` + `FAQPage` (só com FAQ).
  `Offer` só nasce de oferta com preço fornecida pelo site; nada de rating, frete ou
  disponibilidade inventados.
- `JSON_SCHEMA_CONTEUDO_V1`, `LIMITES_CONTEUDO`, `validarConteudo`, `planoDeConteudo`.
- `hashDeFatos(pacote)` (em `afiliado/cms`): JSON canônico ordenado + SHA-256.

O núcleo não traz rota nem template de site. As rotas físicas atuais do plugin
(`/p/{slug}`, `.md`, `.json`) **não** foram alteradas nesta entrega: continuam `noindex`,
sem sitemap físico, sem JSON-LD completo. Adotar o DTO nelas, o sitemap e o `llms.txt` é a
etapa seguinte, depende do portão de imagem/oferta de cada site e fica fora deste PR.

## Fora de escopo (decisões abertas)

- Imagem aprovada e conformidade do programa de afiliados: o portão `indexavel` **não** as
  verifica. O site decide (política de indexação) antes de incluir a URL no sitemap.
- Oferta ativa/fresca como condição de indexação: também do site (lê `observado_em`).
- Hubs, linkagem interna, sitemap e `llms.txt`.
- Entidades do LLM (`entidades` do rascunho de saída) não têm campo: não foram pedidas.
