# PostgreSQL por requisição — plugin opt-in

Status: contrato aprovado, implementação revisada e CI da PR #23 verde em 2026-09-26,
integrada ao main em `6f3f91e`. Preparação da versão `cms-core@0.2.0-next.5` em PR
separada; consumir somente após publicação e registry confirmados. Proposta escrita
antes do código, em branch desde `d2d488a`, depois das releases
`cms-core@0.2.0-next.4` e `afiliado@0.2.0-next.7`. Não faz parte dessas versões;
nenhuma tag/publicação é autorizada automaticamente pela preparação da versão.

## Problema e limite

Payload 3.88 mantém um singleton e o adapter PostgreSQL mantém um Pool/fila global.
No runtime Workers, conexões e promessas pertencem à invocação. `maxUses: 1` evita
reutilização de um cliente, mas não isola a fila global: uma prova com 20 requests
concorrentes reproduziu respostas penduradas; pools por invocação passaram.

A implementação de origem já foi provada em um CMS real. A extração conserva a
fachada por contexto e a liberação do cliente de bootstrap do adapter; não copia
configuração, marca, banco, credenciais ou dependência de OpenNext para o núcleo.
Não é um pool distribuído, um proxy de autenticação nem uma política de tenant.

## Interface implementada (ainda não publicada)

```ts
export interface ContextoConexaoPostgres {
  identidade: object
  connectionString: string
}

export function poolPostgresPorRequisicao(
  obterContexto: () => ContextoConexaoPostgres,
): Plugin
```

Export pela entrada principal de `cms-core`, sem novo pacote ou import de runtime
Node/Cloudflare/OpenNext. O plugin só é acrescentado explicitamente pela plataforma
do Worker; fábrica padrão e Node permanecem intocados.

O getter é síncrono e confiável, executado na requisição atual. `identidade` deve
ser o objeto estável do contexto da invocação (por exemplo, `ctx` do Worker), nunca
o tenant, a URL, um objeto novo a cada chamada ou entrada enviada pelo cliente.
`connectionString` vem do binding atual; não é um fallback capturado no bootstrap.
Uma identidade não pode trocar de banco durante sua vida. Contexto ausente/inválido
falha fechado, sem imprimir URL de conexão, SQL, senha ou corpo de erro do provedor.

## Garantias e restrições

- Somente adapter `postgres` da versão suportada pelo pacote (Payload 3.88).
  Réplicas são recusadas explicitamente nesta fase: um getter representa um binding.
- A fachada permanece estável para Drizzle, mas cada identidade tem um Pool real
  separado em WeakMap; `maxUses: 1` é imposto. As demais opções do Pool são mantidas.
- `query`, `connect` Promise/callback, transação/rollback, eventos/listeners e `end`
  pertencem ao Pool da invocação. Guardar um método e usá-lo em outra invocação falha.
  Retornos encadeáveis não podem deixar escapar o Pool real da requisição.
- Não altera `pg`, seu prototype ou o Pool de outra instância. Decora somente
  `config.db.init`, o adapter resultante e sua cópia de `adapter.pg`.
- O cliente de monitoramento reservado no bootstrap de db-postgres 3.88 é liberado,
  inclusive em erro. O plugin não encerra todos os pools nem retém contexto global.
  Nessa versão, `adapter.connect` com Pool existente não reserva outro monitor;
  o ramo é provado com `hotReload` real e sockets residuais zero. Atualizar o
  adapter exige rever essa premissa, não assumir compatibilidade futura.
- I/O após a resposta exige o `waitUntil` do contexto atual. O consumidor deve
  resolver esse getter dinamicamente; nunca usar o `ctx` da primeira montagem como
  fallback. O núcleo não assume que um retorno de resposta equivale ao fim da invocação.
- Não muda schema, migrations, tenant/access, API keys, drafts, cache ou revalidação.
  Instalar/atualizar o pacote não ativa o plugin; nenhum deploy faz parte desta PR.

## Provas antes da PR

1. Testes vermelhos de identidade/isolamento, getters inválidos, troca de banco,
   métodos capturados, réplicas, callback/Promise, listeners, bootstrap e Node intacto.
2. Workerd real + PG16 local isolado: reproduzir a falha global; pelo menos 20
   requisições concorrentes para query, transação, rollback, erro e fila interna;
   `end` isolado, cancelamento, waitUntil e ausência de sockets residuais.
3. Payload REST real + PG16: singleton, requests concorrentes, permissões e
   fechamento do bootstrap sem mudar o contrato HTTP ou enfraquecer tenant.
4. Worker OpenNext realmente gerado da referência: 20 GETs autenticados no cold
   start e 20 warm, além de conferir a identidade sintética autenticada. Fixture
   local dedicada, sem dotenv/IDs remotos, segredo real, publicação ou deploy.
5. `pnpm check`, schema padrão sem diff e CI completo. A prova OpenNext não pode
   ficar escondida atrás de `continue-on-error` ou ser apresentada como executada
   quando skipped. Builds e testes locais não autorizam automaticamente release.

## Consumo por instância

A plataforma mapeia seu `getCloudflareContext()` atual para a interface genérica e
instala o plugin somente no Worker. Deve também corrigir seu `waitUntil` dinâmico.
Antes de deploy, repetir a prova cold/concorrente no Worker gerado daquela instância.
Ensaios Node podem continuar usando as versões publicadas; a versão com este helper
será proposta e publicada separadamente, após revisão e autorização explícita.

## Evidência local e limites da entrega

- `pnpm check`: 776 testes Vitest e 47 testes das travas passaram; nove sentinelas
  condicionais de CI ficaram skipped na execução local. Inclui 13 unitários do
  helper, nove Workerd/PG16, quatro Payload REST/PG16 e três da plataforma.
- `pnpm confere:schema`: schema padrão em dia, nenhuma migration gerada.
- `pnpm build:workers` e `CI=1 TESTAR_POOL_OPENNEXT=1 pnpm test:pool:opennext`:
  Worker realmente gerado, três testes passaram sem skips. São 20 leituras
  autenticadas concorrentes no cold start, 20 warm e identidade autenticada
  conferida. Dois tenants distintos, nenhuma leitura cruzada.
- A fixture confirma zero sessões PostgreSQL após o seed e após parar o Worker.
  O seed Node usa subprocesso com ambiente mínimo e saída restrita ao ID sintético:
  no adapter 3.88, `payload.destroy()` não encerra o Pool; `pool.end()` aguardou um
  monitor ainda emprestado (`total=1`, `idle=0`). Encerrar o CLI após writes aguardados
  fecha essa conexão sem alterar internals nem executar `pg_terminate_backend`.
  Essa particularidade da fixture Node não é evidência de defeito no helper Worker.
- O CI exige o build e a prova OpenNext; não há `continue-on-error`. A trava de marca
  ignora apenas o diretório de artefato `.open-next`, como já fazia com `.next`, com
  regressão. Fontes, testes e scripts continuam sujeitos à varredura.

Não é conclusão do objetivo de performance: o CMS de uma instância ainda apresentou
miss frio em torno de quatro segundos apesar do Pool estável. A deduplicação GET por
request (PR #18) não faz parte desta entrega nem das releases `.4`/`.7` e permanece
um recorte separado, a ser medido antes de ativação. Nenhum pin, deploy, tag ou
versão publicada muda nesta PR.

## Uma conexão por vez na invocação (cms-core 0.2.0-next.15)

Achado em produção numa instância: o Hyperdrive reparte o limite de conexões de origem em
shards de UMA conexão. Toda escrita do Payload abre uma transação (`pool.connect()`, BEGIN até
o COMMIT) e, no meio dela, há consultas soltas sem `req` — o `checkDocumentLockStatus` do
próprio Payload em todo PATCH/DELETE pela REST, hooks de terceiros e, até a 0.2.0-next.14, o
`uniquePorTenant` e o `slugDeRelacao` do núcleo. Quando a 2ª consulta caía no shard que a
transação segurava, esperava uma vaga que só abriria no COMMIT: FATAL 58000 ("Timed out while
waiting for an open slot in the pool.") e 500 de ~15 s. Pool `max: 1` reproduz o mesmo.

Garantias acrescentadas ao Pool real de cada invocação (`criaPoolDaInvocacao`):

- Enquanto a invocação tem exatamente UM cliente emprestado em forma de promessa (a transação
  do drizzle, ou o monitor do bootstrap), `pool.query` roda nesse cliente, na fila dele, dentro
  da transação — o que o Payload faria se recebesse `req`. Com dois emprestados, ou com
  callback, vai ao Pool como antes. A identidade continua isolando invocações: o cliente de
  uma nunca recebe consulta de outra.
- O desvio é incondicional, mesmo com `max` > 1: do lado do cliente não dá para saber se o
  Hyperdrive teria outra vaga. Mudança de semântica para a consulta solta: ela passa a ver o
  que a escrita já gravou (não commitado), como veria com `req`.
- Quando o cliente está numa transação (estado `T` no último `readyForQuery` da `Connection`
  do `pg`), a consulta desviada roda num `SAVEPOINT`: se ela falhar, `ROLLBACK TO SAVEPOINT`
  devolve a transação ao estado de antes e o erro chega a quem chamou. Um hook que trata o erro
  de uma consulta opcional (`try { … } catch {}`) não derruba o COMMIT, como não derrubava
  quando a consulta ia por outra conexão. Custo: duas idas ao banco a mais por consulta
  desviada (`SAVEPOINT` e `RELEASE`). Fora de transação (monitor do bootstrap), sem savepoint.
- O cliente só volta ao Pool depois que as consultas desviadas para ele terminam.
- **Limite:** só a consulta SOLTA é desviada. Um hook que GRAVA sem `req`
  (`req.payload.create(...)` sem passar `req`) abre uma 2ª transação, e o `pool.connect()` dela
  ainda espera outra conexão: com uma conexão só (Hyperdrive com shard de uma vaga, ou
  `max: 1`), essa escrita ainda trava até o `connectionTimeoutMillis` e dá 500. Hook que grava
  dentro de uma escrita precisa passar `req` — o que o Payload recomenda e o núcleo faz.
- Ouvinte de `error` no Pool da invocação: o fechamento de socket pedido pelo próprio `pg`
  (`client._ending`, rotina com `maxUses: 1` no `pg-cloudflare`) fica em silêncio; outra queda
  de cliente ocioso vira um aviso JSON no `console.warn`, sem `unhandledRejection`.

Prova: `tests/pool-uma-conexao.spec.ts` (unitários) e `tests/int/pool-uma-conexao.int.spec.ts`
(Payload REST real + PostgreSQL com Pool `max: 1` e `connectionTimeoutMillis` de 2 s:
create/update/delete de tags e posts, uma coleção com hook de terceiro que consulta (lê) sem
`req`, e outra cujo hook tolera a falha de uma consulta solta; sem a correção, o próprio bootstrap da fixture falha com "timeout exceeded when trying
to connect").
