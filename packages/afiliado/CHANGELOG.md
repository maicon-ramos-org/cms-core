# @maicon-ramos-org/afiliado

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
