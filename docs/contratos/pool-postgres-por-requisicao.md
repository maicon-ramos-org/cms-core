# PostgreSQL por requisição — plugin opt-in

Status: contrato aprovado, implementação e provas locais concluídas em 2026-09-26;
revisão/CI da PR ainda obrigatórios. Proposta escrita antes do código. Branch separada desde
`d2d488a`, depois das releases `cms-core@0.2.0-next.4` e `afiliado@0.2.0-next.7`.
Não faz parte dessas versões; nenhuma nova versão/tag está autorizada automaticamente.

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
