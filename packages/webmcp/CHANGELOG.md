# @maicon-ramos-org/webmcp

## 0.1.1 — 2026-09-27

- `withWebMcpOriginTrial` reutilizável por site: recebe o token first-party do secret
  do servidor e só inclui `Origin-Trial` em `GET 200 text/html` da origem HTTPS
  autorizada. Não ativa outros domínios, formatos ou respostas de erro.

## 0.1.0 — 2026-09-24

Primeira versão publicada. O código veio do repositório do primeiro site da plataforma, com
o histórico preservado (PRD 17 RF9); muda só o escopo do pacote, sem mudança de
comportamento.
