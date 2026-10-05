# @maicon-ramos-org/afiliado

## 0.2.0-next.23 — 2026-10-03 (pré-lançamento; não publicado)

- A ficha física `/p/{slug}` ganha apresentação responsiva com imagem/estado sem
  foto, identidade e opções de compra antes da análise. Cada listing tem cartão
  de loja/variante e CTA; especificações públicas, destaques, prós/contras e FAQ
  continuam separados, com navegação por âncoras e um único H1/main. Cores/fontes
  vêm do tenant, sem JavaScript adicional, dados inventados ou mudanças de URL/schema.
- `OpcoesCompraProduto.astro` é reutilizável por layouts consumidores e recebe
  apenas a monetização do DTO. Preserva destinos/parâmetros, desativa prefetch e
  marca links patrocinados; cupom literal nunca entra no componente. Preço já
  autorizado exige moeda/valor/data válidos; o reader Amazon conserva preço e
  estoque ausentes. Loja é resolvida com `depth: 1`, sem consulta por cartão, e
  relações populadas de outro tenant são recusadas. Testes de HTML real, múltiplas
  lojas/variantes e integração Payload/Postgres protegem esse comportamento.

- `uniqueCupomPorLoja` (cupons) e a validação de sinônimo de `categorias_oferta` consultam com
  o `req` da escrita, dentro da transação. Sem ele, a consulta pedia uma 2ª conexão enquanto
  a da transação estava presa: com uma conexão só (Hyperdrive com shard de uma vaga, Pool
  `max: 1`), a gravação travava até o timeout. Sem mudança de schema, rota ou contrato.
  Acompanha `cms-core@0.2.0-next.15`, que protege também o que ainda consulta sem `req`.

## 0.2.0-next.22 — 2026-10-02 (pré-lançamento; não publicado)

- `FichaMonetizavelDTO` (`monetizable_content/v1`) e adaptadores de produto/oferta
  editorial na entrada `conteudo`, reaproveitando o contrato editorial existente.
  Conteúdo e listings comerciais são separados; prós/contras são preservados.
  Não altera collections, migrations, rotas, layouts ou a escrita dos publicadores.
- Markdown/HTML reaproveitados e ponte opcional para `Product` JSON-LD. Campos
  vazios de marca/modelo deixam de gerar rótulos ou propriedades vazias.
  Software/serviço não são classificados automaticamente como produto físico.
- Contrato e limites documentados em `FICHA-MONETIZAVEL.md`; testes de paridade,
  isolamento, ausência de gate editorial e independência entre conteúdo e preço.
- A página pública da oferta legada passa a consumir a ficha em HTML, Markdown e
  JSON, preservando URLs, rich text, layout comum/lifetime e CTAs. O código do
  cupom continua oculto até o clique; apenas máscara e condições entram na leitura.
  Ciclo de cobrança, preço anterior, descontos e selos ficam na monetização.
- O JSON-LD da oferta só cria `Offer` com preço positivo/finito, moeda e URL válidos;
  não usa loja como marca, data de observação como início de estoque nem presume
  disponibilidade. Mantém o grafo legado, sem reclassificar software nesta etapa.
  Prós/contras explícitos são preservados; não cria validação editorial no CMS.
- Testes locais do template Astro real com fixtures isoladas cobrem oferta comum,
  lifetime com/sem cupom, falta de preço/editorial e recusa de draft/outro tenant.
  Não publica pacote, executa migration ou altera instâncias consumidoras.
- A leitura pública do produto físico canônico também passa pela ficha em HTML,
  Markdown, JSON e JSON-LD, mantendo `/p/{slug}`, layout/CSS, metadados, noindex,
  imagem e links finais validados. Variantes/listings ficam na monetização; preço,
  estoque e `Offer` não são inventados. Prós/contras explícitos são reaproveitados.
- Testes reais dos três formatos protegem isolamento por tenant, vínculos de
  variantes/listings, parâmetros dos links e prioridade do físico por slug.
  O fallback de `produtos` legado permanece intacto; não funde collections ou banco.
- Integração focada com Payload/PostgreSQL reais, REST autenticada e seis rotas
  Astro comprova paridade do núcleo editorial, isolamento multi-tenant, lifetime,
  cupom literal oculto e dois listings na mesma ficha. Leituras repetidas não
  modificam documentos, versões ou histórico. Banco local exclusivo descartável;
  sem alteração de collections, migrations ou adapters de produção.
- O gerador legado `llms` da extensão usa a ficha compartilhada em uma seção
  `Fichas monetizáveis`, com título e URLs HTML/Markdown canônicas. Leitura de
  metadados paginada/tenant-scoped, deduplicação apenas por canonical e ordenação
  estável; sem campos comerciais ou consultas de listings. Oferta legada publicada
  conserva sua elegibilidade, físico exige publicação/indexação explícita.
  Não reativa o gancho na rota pública estática nem publica a seção nos sites:
  adoção requer geração de artefato fora da requisição pública.
- Preparação de release: documentação do contrato incluída no tarball, versão
  anunciada pelas capabilities sincronizada e tipagem do título físico validada
  pelo `astro check` do consumidor de referência. Sem mudança de schema.

## 0.2.0-next.21 — 2026-10-01 (pré-lançamento)

- O publicador final pode criar `produtos_fisicos` já com `estado: published` e
  `indexavel: true`; aprovação e revisão continuam fora do CMS. Ingestão segue
  impedida de publicar. Não altera o padrão `draft` quando o estado é omitido.
- A ficha física passa a resolver e mostrar imagem da biblioteca, GTIN/MPN e
  especificações editoriais opt-in no HTML, Markdown, JSON e `Product` JSON-LD.
  O JSON bruto de identidade `especificacoes` não é exposto; não são inventados
  preço, oferta ou avaliação. Campo novo requer migration aditiva por instância.
- `produtoCanonico()` instala apenas `produtos_fisicos`, sem impor lojas, cupons,
  listings Amazon ou rotas ao site consumidor. A opção `vincularOfertasEditoriais`
  acrescenta a relação opcional `ofertas_editoriais.produto` com verificação do
  mesmo tenant. Nenhuma oferta antiga é convertida ou indexada automaticamente;
  a instância que optar pelo vínculo precisa gerar e revisar a migration.
- Mudanças no catálogo físico agora avisam a revalidação do site por tenant,
  inclusive produto, listing e observação de preço, para não servir ficha antiga.

## 0.2.0-next.20 — 2026-10-01 (pré-lançamento)

- A ficha pública do produto físico usa o conteúdo editorial canônico em HTML,
  Markdown, JSON e Schema.org; a flag de indexação do publicador controla meta,
  cabeçalho e sitemap. Markdown é renderizado sem HTML cru ou protocolos perigosos.
- A publicação do produto não inventa preço de ofertas no Schema.org; o conteúdo
  continua separado de preço, listing e variante.

## 0.2.0-next.19 — 2026-10-01 (pré-lançamento)

- **Conteúdo editorial no produto canônico** (`product_content/v1`, contrato em
  `docs/contratos/conteudo-editorial-produto.md`): `produtos_fisicos` ganha `meta_title`
  (≤ 60), `meta_description` (≤ 155), `resumo`, `descricao_markdown`, `destaques`, `faq`,
  `facts_hash`, `content_generator`, `prompt_version`, `content_version`,
  `editorial_status`, metadados opcionais de refresh e `indexavel` (default `false`).
  Validação estrutural de FAQ/destaques; draft-first; o agente publicador pode atualizar
  conteúdo existente e, em PATCH explícito, publicar e indexar sem aprovação no CMS.
  Pesquisa e revisão editorial, incluindo FAQ e preços no texto, pertencem ao Hermes.
  **Migration aditiva obrigatória por instância** (30 instruções, todas com default ou
  nulas; `descricao` legada permanece intacta). `SQL_BACKFILL_DESCRICAO_LEGADA` é opt-in.
- Capabilities `affiliate.catalog` 2.0, `affiliate.content` 1.0, `affiliate.preflight` 1.0 e
  `affiliate.offer-history` 1.0 em `GET /api/afiliado/capabilities` (autenticado), com
  limites, JSON Schema e categorias da instância. Consumidores falham fechado com
  `atendeCapacidades`.
- Nova entrada `@maicon-ramos-org/afiliado/conteudo` (pura): validadores, `planoDeConteudo`,
  DTO público, Markdown, JSON-LD e JSON Schema. Rotas do plugin **não** mudam.
- **JSON Schema estrutural** (`JSON_SCHEMA_CONTEUDO_V1`): campos opcionais, tipos e limites;
  não julga FAQ repetida, completude ou preço no texto. A revisão externa é documentada em
  `capabilities.content.rulesOutsideJsonSchema`. Testes de paridade Ajv × `validarConteudo`.
- **`hashDeFatos` só aceita JSON real** (null, boolean, número finito, string, arrays e
  objetos planos); recusa `undefined`, `Date`/`Map`/`Set`/classes, função, `NaN`/`Infinity`,
  ciclos etc. com `PacoteFactualInvalidoError` (sem valores na mensagem) — antes, `undefined`
  era descartado e podia colidir hashes. Quem enviava `undefined` deve remover a chave.
- Migration de conteúdo editorial testada em schema antigo populado (`up` preserva legado);
  `down` é **destrutivo** (apaga o conteúdo editorial novo) e não é rollback sem perda.
- `afiliado({ catalogo: { incluirCategoriasPadrao: false } })`: instância só com as próprias
  categorias (default `true`, sem efeito para quem já consome).
- Correção de isolamento: as coleções do catálogo físico recusam escrita quando o `tenant`
  do corpo não pertence ao usuário (antes, um usuário de outro tenant criava documentos
  informando o id do tenant alheio). Super-admin e Local API sem usuário não mudam.

## 0.2.0-next.18 — 2026-09-29 (pré-lançamento)

- Fichas de produtos físicos publicados podem ser servidas por snapshot R2,
  mantendo expiração curta e invalidação explícita. CTAs, Schema.org, JSON e
  Markdown de produtos Amazon usam o link especial final, validado e etiquetado,
  sem redirecionamento intermediário. URLs antigas `/r/f{id}` exibem uma página
  de transição com clique explícito; não fazem 302 automático.
- Alinha `editorial@0.2.0-next.9` para compartilhar o cache de páginas.

## 0.2.0-next.17 — 2026-09-27 (pré-lançamento)

- Os redirects físico (`/r/{id}`) e editorial agora respondem a `Purpose`,
  `Sec-Purpose`, `X-Purpose` e `X-Moz` com `prefetch`/`prerender` antes de consultar
  o CMS ou registrar clique. O GET afirmativo mantém o comportamento anterior.
  Não muda schema, dados ou URLs comerciais.

## 0.2.0-next.16 — 2026-09-27 (pré-lançamento)

- Alinha `editorial@0.2.0-next.4` para que também as rotas afiliadas usem o
  Service Binding interno quando a instância o configurar. Sem mudança de schema.

## Não lançado

## 0.2.0-next.15 — 2026-09-27 (pré-lançamento)

- `catalogoEditorial()` é extensão opt-in da coleção única
  `ofertas_editoriais`: lojas, cupons e categorias relacionados, sem criar uma
  segunda coleção de ofertas e sem monitoramento automático. Ativar exige
  migration aditiva por instância.
- Ofertas e produtos públicos ganham JSON allowlist em paralelo a HTML/Markdown.
  Dados comerciais sensíveis (destino afiliado, comissão e código do cupom)
  continuam ocultos; CTA passa por `/r`. A ficha física ganha Markdown; ofertas
  antigas em `/apps/` anunciam alternates nesse caminho canônico.
- Alinha as dependências distribuídas a `cms-core@0.2.0-next.14` e
  `editorial@0.2.0-next.3`. Não ativa catálogo, purge ou cron em nenhum site.

## 0.2.0-next.14 — 2026-09-27 (pré-lançamento; publicação pendente)

- A credencial publicadora pode criar uma oferta editorial já aprovada com
  `_status: published` em uma única chamada REST. Sem `_status`, continua draft;
  a credencial de ingestão permanece draft-only. Host afiliado permitido para
  oferta ativa publicada, tenant, identidade e vínculos seguem validados.
- Alinha a dependência distribuída a `cms-core@0.2.0-next.13`. Não muda schema
  nem ativa plugins em outra instância automaticamente.

## 0.2.0-next.13 — 2026-09-26 (pré-lançamento; publicação pendente)

Alinha a dependência distribuída a `cms-core@0.2.0-next.11`, que deixa a
avaliação editorial exclusivamente no pipeline externo. O `pnpm pack` converte
`workspace:*` no pin exato; o código do plugin afiliado não muda. Sem migration,
ativação em site ou deploy automático. Publicar este pacote somente depois de
confirmar a publicação do core `.11` na dist-tag `next`.

## 0.2.0-next.12 — 2026-09-26 (pré-lançamento)

Alinha a dependência distribuída a `cms-core@0.2.0-next.10`, que oferece o
render privado opt-in. Não há mudança de código ou schema no afiliado, nem
ativação em site. O `latest` permanece em `0.1.0`.

## 0.2.0-next.11 — 2026-09-26 (pré-lançamento)

- Helper interno `ultimasVerificacoesOfertas`: uma consulta SQL parametrizada por
  lote de até 100 ofertas, limitada ao tenant e a ofertas publicadas. Retorna só
  o check mais recente por oferta, sem carregar o histórico inteiro ou expor
  ator/notas. O chamador ainda deve autenticar o `site-reader` e vincular o
  tenant à identidade; não há endpoint ou ativação automática.
- Índice composto `(tenant, oferta, verificado_em)` para essa leitura. Cada
  instância precisa gerar/revisar a migration antes de usar o helper em produção.

Alinha a dependência distribuída a `cms-core@0.2.0-next.9`, que contém o
`site-reader` opt-in. Este pacote não ativa reader nem consulta em nenhum site;
`latest` continua em `0.1.0`.

## 0.2.0-next.10 — 2026-09-26 (pré-lançamento)

Alinha somente a dependência distribuída a `cms-core@0.2.0-next.8`, que audita
campos relacionais reais nos eventos do grafo e rejeita `select` em escritas
auditadas. O `pnpm pack` converte `workspace:*` no pin exato; não é necessário
override transitivo. O código-fonte do afiliado permanece idêntico ao `.9`, sem
mudança de schema ou ativação automática de plugins.

Conserva `editorial@0.2.0-next.2` e `afflinks`, `desconto`, `schema` em `0.1.0`.
A PR não publica automaticamente: a release na dist-tag `next` depende da
publicação verificada do core `.8` e dos gates de CI/revisão; `latest` permanece
`0.1.0`. Nenhum pin de instância, conteúdo, backfill ou deploy é alterado.

## 0.2.0-next.9 — 2026-09-26 (pré-lançamento)

Alinha somente a dependência distribuída a `cms-core@0.2.0-next.7`: inclui as
correções de tipos Sharp e preservação de `claims.valor` em PATCH/versões sem
instalar duas versões do núcleo. O `pnpm pack` converte `workspace:*` no pin exato;
não é necessário override transitivo. O código-fonte do afiliado permanece
idêntico ao `.8`, sem mudança de schema ou ativação automática de plugins.

Conserva `editorial@0.2.0-next.2` e `afflinks`, `desconto`, `schema` em `0.1.0`.
Não publica o editorial nem distribui suas mudanças ainda não lançadas da PR #18.
A PR não publica automaticamente: a release na dist-tag `next` depende da
publicação verificada do core `.7` e dos gates de CI/revisão; `latest` permanece
`0.1.0`. Nenhum pin de instância, conteúdo, backfill ou deploy é alterado.

## 0.2.0-next.8 — 2026-09-26 (pré-lançamento)

Pré-lançamento na dist-tag `next`; `latest` permanece em `0.1.0`. Sem mudança de
código, schema ou ativação: alinha a dependência distribuída a
`cms-core@0.2.0-next.5`, já publicado, para o consumidor não instalar duas versões
do núcleo ao usar o helper opt-in de Pool por requisição. O `pnpm pack` converte
`workspace:*` no pin exato; nenhum override transitivo é necessário.

Conserva `editorial@0.2.0-next.2` e `afflinks`, `desconto`, `schema` em `0.1.0`.
Não inclui PR #18, não ativa memoização SSR nem o Pool Worker automaticamente.
Ativação na plataforma, `waitUntil` dinâmico e prova concorrente do bundle da
instância continuam necessários; nenhuma publicação de conteúdo ou deploy é feito.

## 0.2.0-next.7 — 2026-09-26 (pré-lançamento)

Pré-lançamento na dist-tag `next`; `latest` permanece em `0.1.0`. O pacote fixa
`cms-core@0.2.0-next.4` e conserva `editorial@0.2.0-next.2`. Ativar ofertas exige
`grafoEditorial()` antes de `ofertasEditoriais()` e migration revisada da instância;
atualizar o pacote não ativa ofertas, categorias extras nem memoização SSR.

- Plugin separado `ofertasEditoriais({ programas })`: ofertas editoriais draft-first,
  histórico append-only, escolhas por vocabulário do tenant, decimais exatos nullable,
  espelhos de um nível e dados comerciais privados. Não exige identidade física nem
  fabrica marca/modelo. Ativação e migration são explícitas por instância; default intacto.
- DTO público por allowlist e helper opt-in de redirect `web/lib/ofertas-editoriais`:
  destinos validados por programa, 302 no-store/noindex, prefetch 204 sem I/O,
  tracking privado limitado e aliases legados sensíveis a caixa. Nenhuma rota é
  injetada automaticamente; import completo e paridade são aceites do consumidor.
- Registro opt-in de categorias físicas por instância via
  `afiliado({ catalogo: { categoriasAdicionais } })`. Políticas declaram atributos
  de identidade escalares, versão e validação pura; o pacote não inventa categoria,
  marca ou modelo para o acervo. Tenant, draft-first e identidade imutável permanecem.
- Funções `chaveVariante`, `avaliaMatch` e `selecionaMatch` aceitam registro opcional.
  As quatro categorias padrão preservam enum, schema, hashes e matching; categorias
  adicionais usam os atributos declarados, não todos os metadados. Cada site precisa
  revisar sua migration de enum antes de habilitar uma categoria.

## 0.2.0-next.6 — 2026-09-25 (pré-lançamento, PRD 24)

Pré-lançamento na dist-tag `next`; o `latest` continua em `0.1.0`. Fixa
`@maicon-ramos-org/cms-core@0.2.0-next.2` e `@maicon-ramos-org/editorial@0.2.0-next.2`, os
mesmos do 0.2.0-next.5.

### Corrigiu

- Cliques do `/r/{id}` voltam a ser gravados nos Workers (PRD 24). Lá, o POST de
  `/api/cliques` ao CMS (também num Worker) leva de 1,3 s a 1,5 s, e o teto de 1,5 s abortava
  quase todo registro — a coleção `cliques` parou de receber cliques na virada, sem erro
  visível (a falha só vira aviso no log). Agora, quando o adaptador oferece o `waitUntil` do
  Worker (`locals.cfContext`, do `@astrojs/cloudflare`), o registro começa antes do redirect
  e termina depois da resposta, com teto de 10 s: o redirect não espera o CMS. Em Node (sem
  `waitUntil`) nada muda: o redirect espera o registro, com o teto de 1,5 s.
- O POST do clique pede `?depth=0`: a resposta não popula mais o tenant e a loja, que
  ninguém lê.

## 0.2.0-next.5 — 2026-09-25 (pré-lançamento, PRD 24 RF2)

Pré-lançamento na dist-tag `next`; o `latest` continua em `0.1.0`. Sem mudança de código no
afiliado: sai de novo só para fixar `@maicon-ramos-org/cms-core@0.2.0-next.2` (com os derivados
sem `sharp` da RF2) no pacote publicado, e o site não ficar com duas cópias do núcleo.

## 0.2.0-next.4 — 2026-09-25 (pré-lançamento, PRD 24)

Pré-lançamento na dist-tag `next` (RF4): o `latest` continua em `0.1.0`.

### Corrigiu

- CLS do banner da home (PRD 24 — achado do Lighthouse móvel, 0,188 em dev): a caixa que o
  navegador reserva pro `<picture>` de `Banner.astro` agora usa a proporção de CADA imagem
  (larga e estreita têm proporções diferentes — a estreita costuma ser 300x250, não um
  recorte da larga). O `<source>` da estreita ganha `width`/`height` próprios, e o CSS reserva
  o espaço certo por breakpoint (`aspect-ratio`), em vez de só a proporção da larga aplicada
  às duas larguras. Sem mudança visual nem no LCP.

## 0.2.0-next.3 — 2026-09-25 (pré-lançamento, PRD 24 RF10.10)

Pré-lançamento na dist-tag `next` (RF4): o `latest` continua em `0.1.0`. Publicado junto com
`@maicon-ramos-org/editorial` 0.2.0-next.2 (dependência `workspace:*` deste pacote), que
corrige o CMS fora do ar virando 404 guardável em cache — nenhuma mudança de código neste
pacote, só o `pnpm pack` fixando a versão nova do tema na dependência.

## 0.2.0-next.2 — 2026-09-25 (pré-lançamento, PRD 24 RF3)

Pré-lançamento na dist-tag `next` (RF4): o `latest` continua em `0.1.0`. Publicado junto com
`@maicon-ramos-org/editorial` 0.2.0-next.1 (dependência `workspace:*` deste pacote).

### Mudou

- Entrada `web` portável para Workers (PRD 24 RF3): o `/r/{id}` lê o ID de afiliado e o
  catálogo lê a etiqueta da loja por `variavel` do `@maicon-ramos-org/editorial/lib/ambiente`,
  e o IP do clique por `ipDoCliente`. Em Node, o comportamento é o de antes.

## 0.2.0-next.1 — 2026-09-24 (pré-lançamento, PRD 24 RF0.10)

Pré-lançamento na dist-tag `next` (RF4): o `latest` continua em `0.1.0`. Publicado junto com
`@maicon-ramos-org/cms-core` 0.2.0-next.1 (dependência `workspace:*` deste pacote), para o
`pnpm pack` fixar a mesma versão do núcleo nos dois lugares e o site consumidor não instalar
duas cópias de `cms-core`.

### Mudou

- A task `snapshotDesconto` ganha agenda própria (`schedule`): todo dia às 03:10 UTC, na fila
  `diario` (`agendaDoSnapshot`, exportado). Até aqui ela não tinha agenda e ninguém a
  enfileirava: o `jobs.autoRun` do site rodava a fila `diario` vazia, e a série de
  `historico_desconto` parou no dia da execução manual (PRD 24 RF8).
- Num banco que nunca agendou a task, o primeiro tique já roda (`primeiraPassadaNaHora`, o
  `beforeSchedule` da agenda); o Payload sozinho só agendaria para o 03:10 seguinte. Depois,
  no máximo uma execução por dia — pelo `autoRun` (Node) ou pela rota
  `GET /api/payload-jobs/run?queue=diario` (Cron Trigger dos Workers), mesmo com os dois
  relógios no mesmo banco.
- Um job do snapshot que fica preso em `processing` (o processo morreu no meio: deploy ou
  reinício às 03:10, ou a requisição do Cron Trigger cortada por CPU) não trava mais a agenda.
  O Payload 3.88 conta esse job como pendente para sempre e nunca mais agenda; antes da
  contagem, o `primeiraPassadaNaHora` marca como erro (`hasError`, `error` com o motivo, sem
  apagar) os jobs agendados da task em `processing` parados há mais de 6 h
  (`JOB_PRESO_DEPOIS_DE_MS`, `soltaJobsPresos`, exportados) e avisa no log. No dia seguinte o
  snapshot volta a rodar uma vez.

### Migração no site

- Com a agenda, o Payload cria o global `payload-jobs-stats` e o campo `meta` em
  `payload-jobs`. Ao receber esta versão o site gera a migration (`migrate:create`):
  `CREATE TABLE "payload_jobs_stats"` e `ALTER TABLE "payload_jobs" ADD COLUMN "meta" jsonb`;
  e regenera o `payload-types.ts`.
- O relógio continua sendo do site. Node: `jobs.autoRun` com `cron: agendaDoSnapshot.cron` e
  `queue: agendaDoSnapshot.queue`. Workers: um Cron Trigger que chama só
  `/api/payload-jobs/run?queue=diario` (essa rota agenda antes de rodar; chamar antes
  `/api/payload-jobs/handle-schedules` sem `?queue=diario` agenda a fila `default`, não a
  `diario`).
- O Payload apaga o job ao concluir (`jobs.deleteJobOnComplete`, padrão `true`): a prova de
  que o snapshot rodou é a linha do dia em `historico_desconto` e o `lastScheduledRun` em
  `payload_jobs_stats`, não um job concluído em `payload_jobs`.

## 0.1.0 — 2026-09-24

Primeira versão publicada. O código veio do repositório do primeiro site da plataforma, com
o histórico preservado (PRD 17 RF9); muda só o escopo do pacote, sem mudança de
comportamento.
