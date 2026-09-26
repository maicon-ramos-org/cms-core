# @maicon-ramos-org/afiliado

## Não lançado

- Helper interno `ultimasVerificacoesOfertas`: uma consulta SQL parametrizada por
  lote de até 100 ofertas, limitada ao tenant e a ofertas publicadas. Retorna só
  o check mais recente por oferta, sem carregar o histórico inteiro ou expor
  ator/notas. O chamador ainda deve autenticar o `site-reader` e vincular o
  tenant à identidade; não há endpoint ou ativação automática.
- Índice composto `(tenant, oferta, verificado_em)` para essa leitura. Cada
  instância precisa gerar/revisar a migration antes de usar o helper em produção.

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
