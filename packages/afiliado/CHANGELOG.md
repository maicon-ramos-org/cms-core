# @maicon-ramos-org/afiliado

## Não publicado

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
