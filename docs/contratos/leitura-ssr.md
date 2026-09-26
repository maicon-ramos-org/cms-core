# Leituras CMS deduplicadas por requisição SSR

Status: implementação opt-in em revisão, contrato escrito antes do código. Não lançado.

## Escopo e ganho verificável

Uma página pode pedir a mesma navegação no cabeçalho e no rodapé. O cliente
`cmsFetch` hoje executa dois GETs idênticos. Esta mudança os reduz a um durante
o mesmo render, sem guardar dados entre requisições. Não promete resolver a
latência fria inteira, não agrega consultas diferentes e não cria cache em KV.

O comportamento padrão de `editorial()` permanece sem memo. O site pode habilitar:

```ts
editorial({ config: {
  tenantPadrao: 'exemplo',
  memoLeituras: { caminhosPublicos: ['/', '/blog/*', '/search-index.json'] },
} })
```

Os caminhos são exatos; `/*` no final permite descendentes do prefixo, respeitando
o limite de segmento. Não há wildcard geral `/*`. O site declara somente rotas
públicas. Caminhos reservados (`/r`, `/api`, `/admin`, `/login`, `/logout`,
`/preview`) nunca participam, mesmo declarados. Requests com cookie,
Authorization, indicador `draft`/`preview`, cache-control no-store/private/no-cache,
ou método diferente de GET também não participam. Ausência da opção não altera
rotas, headers, respostas ou quantidade de leituras.

## Vida e identidade

- Contexto novo após resolver tenant, via `AsyncLocalStorage.run/getStore`, sem
  mapa global de resultados. Node e Workers com compatibilidade Node são alvos.
- Toda entrada no middleware suspende contexto herdado. Um rewrite de rota pública
  para rota privada não herda o memo da rota de origem.
- GETs de `cmsFetch` com URL e opções efetivas idênticas compartilham a promessa
  pendente e o resultado concluído. A chave inclui URL completa (origem, query,
  filtros de tenant/status/idioma) e headers efetivos, inclusive identidade CMS.
  Não se reordena query nem se elimina parâmetro. Nada disso é logado.
- Opções customizadas além de método GET e headers, corpo, sinal de cancelamento,
  no-store/no-cache/private, cookies e queries de draft/preview desabilitam memo
  dessa chamada. POST/PATCH/DELETE e os logs de clique nunca são deduplicados.
- Objetos entregues são cópias independentes. Erros são removidos, permitindo
  retry dentro do request; não se guarda falha nem resultado entre requests.
- Resposta CMS privada/no-store/no-cache ou com Set-Cookie não é reaproveitada;
  consumidores concorrentes aguardando essa resposta fazem leitura independente.
- Limites fixos: 64 chaves, 256 KiB de JSON serializado por resultado e 1 MiB de
  JSON retido por request. Ao exceder, segue a leitura normal, sem derrubar render.
  Os limites de JSON não são uma promessa de tamanho exato do heap.
- O contexto acompanha o corpo streamed até EOF/cancelamento/erro e então é
  desativado e limpo; tarefas tardias não reaproveitam dados. Não bufferiza HTML.
  Uma resposta pública que devolva no-store/private desativa o contexto.

`comContextoLeituraCms`, `semContextoLeituraCms` e `leituraCmsNaRequisicao` são utilitários server-side da
entrada já existente `editorial/lib/*`; não acrescentam exports ao CMS/afiliado.
O middleware conserva negociação Markdown/rewrite, Vary Host/Accept, canonical,
status, cache tags/TTL e invalidação existentes. Não ativa a opção nos consumidores.

## Plano de arquivos antes da implementação

- Este contrato; `packages/editorial/CHANGELOG.md` em seção ainda não lançada.
- Novo `packages/editorial/src/lib/contexto-requisicao.ts`.
- `packages/editorial/src/{config,middleware}.ts` e `src/lib/cms.ts`.
- Testes `packages/editorial/tests/lib/contexto-requisicao.spec.ts`,
  `tests/cms-memo.spec.ts`, `tests/middleware-memo.spec.ts`,
  `tests/memo-workers.spec.ts`, `tests/memo-ssr.spec.ts` e fixtures SSR próprias.
- `scripts/confere-core-sem-node.mjs` e seu teste: permitir somente o import
  nomeado de AsyncLocalStorage; outras APIs de async_hooks continuam reprovadas.
- `packages/editorial/package.json` e lock: Miniflare e adapter Node, somente
  dependências de teste, nas versões já resolvidas pelo workspace.

## Aceite / verificação

- [x] Testes inicialmente vermelhos antes da implementação.
- [x] Duplicatas concorrentes/sequenciais 2→1; consultas diferentes não colapsam.
- [x] Isolamento de requests concorrentes, tenants, identidade e Accept; cópias
  independentes; rejeição, retry, limites e bypass de escritas/privado.
- [x] Opt-in real: padrão não deduplica; caminhos públicos permitidos deduplicam.
- [x] HTML completo sem JS, Markdown e JSON idênticos, headers preservados;
  streaming/cancelamento e tarefas tardias em Node e workerd locais.
- [x] Regressões de afiliado/waitUntil passam sem alterar seus arquivos.
- [x] `pnpm check` completo com banco/bucket de teste isolados; diff check.

Sem mudança editorial, escrita/trace/deploy em produção ou release nesta etapa.
Commit/PR de revisão autorizados após `pnpm check`; ativação é outra entrega.
Tenant single-flight, projeções populate/select, relógio do banner, endpoints
agregados e warm pós-publicação ficam em PRs futuras.

## Evidência e limites — 2026-09-26

`pnpm check` completo passou antes e depois de atualizar a base para `c1f2c50`
(PR #17 mesclada): 276 testes do editorial, incluindo 64 novos (sete workerd e
três Astro SSR construído), e 48 testes dos scripts. Tipos e demais pacotes verdes.
Revisão independente read-only do contrato/contexto/cliente/middleware não achou
P0/P1; não substitui a execução própria dos testes. Banco base exclusivo `cms_core_ssr_memo`
em Postgres 16 descartável e MinIO local; nenhuma credencial real ou `.env` de site.
A primeira rodada foi interrompida sem aceitar schema push sobre outra base de
QA já preenchida; a rodada verde usou uma base nova. Nenhuma produção envolvida.

A prova SSR compara corpos completos byte a byte com memo ativo/inativo e conta
chamadas ao CMS fixture. Ela prova redução de requests, não percentis/ganho de
latência em produção. Responses 404/503 continuam erros, podem ser tentadas de novo
e não se tornam sucesso nem se propagam para a requisição seguinte.

Um consumidor relatou 404 intermitente em produção durante esta implementação.
É investigação separada: este código ainda não foi publicado/ativado naquele
ambiente; não existe evidência causal ligando o incidente ao memo. A ativação em
consumidores requer revisão/CI/release e smoke próprios, sem mascarar esse risco.

## Referência do runtime

A Cloudflare documenta `AsyncLocalStorage.run/getStore` no Workers; `enterWith`
e `disable` não são suportados e não serão usados:
https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/
Isso não substitui a prova local de isolamento e streaming em workerd.
