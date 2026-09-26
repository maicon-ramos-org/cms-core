# Frescor editorial da pesquisa — correção independente

Status: contrato escrito antes dos testes/código, implementado em 2026-09-26,
ainda não lançado. Base `main` c1f2c50;
não inclui a PR de ofertas editoriais nem altera o schema sem grafo opt-in.

## Problema observado

O import REST preservou a pesquisa, mas `updatedAt` é a data técnica da escrita no
Payload. Usá-la como revisão científica fez oito pesquisas antigas parecerem
atuais no dry-run de 56 conteúdos da instância: G1 reprovou nove com a data
original, contra apenas um usando o timestamp técnico. Todos os conteúdos seguem
draft. Isso não autoriza afrouxar G2–G4 nem publicar o acervo.

## Contrato aditivo

- `pesquisas.revisado_em`: data editorial opcional, sem default ou `now()`.
  Import informa a data original documentada (`research.updated_at` no snapshot),
  não o instante do upload. Atualizar texto/qualidade não altera essa data.
- G1 usa `revisado_em` quando preenchido. Data inválida, futura ou vencida não
  ganha fallback técnico. Sem campo preenchido, preserva temporariamente o
  comportamento legado `updatedAt`, explicitamente identificado como fallback.
- Um PATCH explícito de `revisado_em: null`/vazio é recusado com path, mesmo se a
  data anterior era ausente: não existe operação de limpeza que reative o
  fallback depois do backfill, inclusive Local API. Omitir o campo não o altera.
  Restaurar uma versão sem data editorial também é recusado: restoreVersion
  renova `updatedAt` e não pode fazer uma evidência antiga parecer recente.
  Versões com revisão documentada continuam restauráveis e auditadas.
  Nova pesquisa pode permanecer sem data editorial para compatibilidade; isso
  não dispensa a revisão/backfill de um acervo importado antes de ativar gates.
- Entre pesquisas da mesma entidade/tenant, seleciona a maior data efetiva,
  não a última atualização técnica. Duas consultas limitadas a um candidato
  (editorial preenchida e fallback legado) evitam paginação incompleta e
  carregamento ilimitado em memória. Empates são determinísticos por ID. Data futura continua bloqueada,
  não é silenciosamente ignorada em favor de outra pesquisa.
- Contexto mantém `atualizado_em` técnico para compatibilidade e acrescenta
  `revisado_em`, `data_frescor` e `base_frescor` (`revisado_em|updatedAt-legado`).
  Consumidor não precisa adivinhar qual relógio justificou G1.
- Tenant, versões/eventos, dry-run sem escrita e publish server-side permanecem.
  Sem grafo instalado não há campo/migration nova no site padrão.

## Provas e rollout

1. Testes vermelhos: import antigo + `updatedAt` recente reprova G1; data editorial
   válida prevalece sobre timestamp técnico velho; inválida/futura não faz fallback.
2. REST/PG16: PATCH/backfill preserva data, edição incidental não renova pesquisa,
   limpeza/null não contorna regra e publicação é bloqueada com pesquisa vencida.
3. Seleção de múltiplas pesquisas considera data efetiva e isolamento tenant;
   contexto informa ambos os timestamps. Gates desligados continuam opt-in.
4. `pnpm check`, schema padrão sem diff, CI completo e revisão antes de release.
5. Após release autorizada, instância gera/revisa migration, backfill dos 51
   registros via REST com credencial própria, segunda passagem idempotente e
   novo relatório read-only G1–G4. Esta PR não faz esse backfill nem publicação.

Compatibilidade não significa validação do acervo: enquanto houver pesquisa
importada usando `updatedAt-legado`, a migração não pode declarar G1 conferido.
Tipagem genérica de GeneratedTypes, semântica/literalidade de G2, capas e pautas
permanecem tarefas independentes.

## Evidências locais

- Oito testes falharam antes da implementação, incluindo import antigo com
  timestamp técnico recente e seleção da pesquisa errada pelo último import.
- Regressões adicionais detectaram a mescla automática de null no PATCH pelo
  Payload e o caminho separado de restoreVersion. A proteção roda antes da mescla
  para updates; restauração legada sem data é bloqueada, restauração datada passa.
- 45 testes focados passaram; `pnpm check` completo passou com 665 Vitest e
  47 testes de scripts/travas. Seis sentinelas condicionais skipped; suites PG16
  e MinIO reais executadas em serviços locais isolados.
- Referência padrão `confere:schema` sem diff. Nenhum backfill, publicação de
  conteúdo, migration de instância ou tag/release executado nesta prova.
