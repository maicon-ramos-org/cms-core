# Conteúdo editorial do produto canônico (`product_content/v1`)

O conteúdo de produto físico pertence a `produtos_fisicos`, não à variante ou ao listing. O CMS é o repositório estruturado. Pesquisa, veracidade, decisão de incluir FAQ, revisão e momento de publicação pertencem ao pipeline Hermes. O CMS não usa LLM nem heurísticas editoriais para barrar texto.

## Campos e validação

| Campo | Forma | Limite |
| --- | --- | --- |
| `meta_title` | texto opcional | 60 caracteres |
| `meta_description` | texto opcional | 155 caracteres |
| `resumo` | texto opcional | 1.000 caracteres |
| `descricao_markdown` | texto opcional | 20.000 caracteres |
| `destaques` | lista de textos opcional | 200 caracteres por item |
| `faq` | lista opcional de `{ pergunta, resposta }` | sem limite editorial de itens |
| `facts_hash` | SHA-256 hexadecimal minúsculo opcional | 64 caracteres |
| `content_generator`, `prompt_version` | textos opcionais de proveniência | 100 / 60 caracteres |
| `content_version` | contador do CMS | incrementado quando o conteúdo muda |
| `editorial_status` | estado informativo do pipeline | `sem_conteudo`, `rascunho`, `em_revisao`, `aprovado` |
| `editorial_refresh_em`, `editorial_refresh_motivo` | metadados opcionais | nunca exigidos para atualizar |
| `indexavel` | checkbox | `false` por padrão |
| `especificacoes_editoriais` | lista opcional de `{ rotulo, valor }` | até 30 pares de 80 / 300 caracteres |

O JSON Schema 2020-12 público e o validador do hook conferem formato e tamanho. FAQ repetida, FAQ vazia, texto contendo preço, campos editoriais ausentes ou conteúdo pré-existente **não** são erros do CMS. Os campos `faq` e `destaques` têm formato tipado; isso permite aos consumidores ler os dados com segurança, mas não avalia qualidade. Um erro estrutural na REST retorna o `path` do campo inválido.

`facts_hash` é uma ajuda para evitar geração idêntica, não uma prova de qualidade. `hashDeFatos` recebe JSON puro e canônico: não aceita `undefined`, `Date`, `Map`, `Set`, ciclos ou números não finitos. `planoDeConteudo` recomenda `gerar` para produto sem conteúdo, `reutilizar` para a mesma hash e `atualizar` nos demais casos. Essa recomendação não bloqueia PATCH.

## Fluxo do publicador Hermes

O agente que escreve no Payload usa sua **própria API key** com papel `agente`. Não compartilha a key de outro executor. A revisão humana, quando existir, termina **antes** do publicador chamar o CMS; nenhuma aprovação humana adicional é exigida pelo CMS.

1. `POST /api/produtos_fisicos` com `tenant`, identidade e conteúdo. Sem `estado`, nasce `draft`, `indexavel=false`. O publicador final pode enviar `estado: "published"` e `indexavel: true` já na criação, pois a aprovação ocorreu antes do CMS. Esta coleção usa `estado` próprio, não `_status` de drafts do Payload.
2. O publicador pode corrigir e atualizar o conteúdo por `PATCH /api/produtos_fisicos/{id}` mesmo quando já existe texto. Marcador de refresh não é necessário. `content_version` é controlado pelo CMS, e versões do Payload permitem rollback.
3. Também é possível publicar depois por `PATCH` com `{ "estado": "published", "indexavel": true }`. Isso não exige `editorial_status=aprovado`, FAQ nem proveniência preenchida; a decisão editorial veio do pipeline externo.
4. `indexavel=true` exige produto publicado e credencial `agente`, `editor`, `super-admin` ou Local API confiável. `ingestao` não pode publicar nem ligar indexação. Ao voltar para `draft`, o CMS desliga `indexavel`.

O status editorial permanece para observabilidade, mas não controla publicação, atualização ou indexação. O agente pode gravar `aprovado` caso reflita o próprio pipeline; não é exigido.

## Descoberta e leitura pública

`GET /api/afiliado/capabilities` é autenticado e anuncia `affiliate.catalog` 2.0, `affiliate.content` 1.0, `affiliate.preflight` 1.0 e `affiliate.offer-history` 1.0, mais categorias da instância, limites e JSON Schema. Consumidores devem usar `atendeCapacidades` e falhar fechado se a versão requerida faltar. `@maicon-ramos-org/afiliado/conteudo` exporta o contrato puro, o DTO público, Markdown e JSON-LD.

`produtoEditorialDTO` considera `indexable=true` apenas quando `estado=published` e `indexavel=true`. O status editorial e a completude não são portões escondidos. O mesmo DTO alimenta Markdown e JSON-LD; `FAQPage` só aparece se houver FAQ. `Offer` só nasce quando o site fornece uma oferta/preço válido; o conteúdo editorial não inventa preço, rating nem estoque.

`gtin`, `mpn`, imagem da biblioteca e `especificacoes_editoriais` podem aparecer no HTML, Markdown, JSON e `Product` JSON-LD. O JSON bruto `especificacoes` participa da identidade do catálogo e **não** é publicado automaticamente. O publicador escolhe explicitamente quais pares entram na ficha pública; dados de preço e de listing permanecem fora desse bloco.

## Migração por instância e legado

A versão `0.2.0-next.19` adiciona campos e enums à coleção física. Cada instância do Payload precisa executar sua migration aditiva antes de rodar o novo pacote; o `down` apaga os campos novos e **não** é rollback sem perda. A coluna legada `descricao` permanece intacta. `SQL_BACKFILL_DESCRICAO_LEGADA` é opcional e idempotente: copia `descricao` para `descricao_markdown` somente se o campo novo estiver vazio, iniciando em rascunho e sem indexar. Pode-se limitar por `tenant_id` na migration do site. Após o backfill, o agente pode atualizar o texto normalmente.

Testes de unidade verificam formato, DTO, hash, preflight e permissões do hook. O teste de integração REST/Payload/Postgres verifica draft-first, publicação/indexação pelo agente, atualização sem marcador, isolamento por tenant e backfill.
