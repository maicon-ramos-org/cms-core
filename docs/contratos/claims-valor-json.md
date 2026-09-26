# Claims: preservação de valor JSON em PATCH e restore

Status: contrato da correção `.7`, escrito antes do código e ampliado após prova
vermelha de versões em 2026-09-26. Branch
separada desde o merge da `.6` (`c3fcd052`). A PR não publica automaticamente nem
executa migration de instância, backfill ou mudança de status/gates.

## Defeito e fronteira

Payload 3.88 entrega ao `field.beforeValidate` o fallback já salvo quando o valor
de entrada é `undefined`. Depois, valida strings com `JSON.parse`; o adapter JSON
também interpreta esse texto. Assim, PATCH de outro campo pode recusar `12%` ou
converter silenciosamente strings como `12`, `null`, `false`, `{}` e `[]`.

`restoreVersion` é diferente: passa o documento completo da versão e marca
`req.context.isRestoringVersion = true`; o fallback do documento atual é desativado.
Uma string nessa versão já é um valor nativo, não uma nova entrada JSON textual.

Há um segundo defeito, anterior ao hook: pg 8 já decodifica JSONB, mas o mapper
`PgJsonb.mapFromDriverValue` do Drizzle 0.45.2 tenta outro `JSON.parse` se recebe
string. Assim, `findVersions` converte `12` string em número, `null` string em null,
`{}`/`[]` em objeto/array e perde aspas de `"texto"`. O restore recebe esse valor
já alterado; somente um hook de campo seria insuficiente.

A prova SQL read-only diferencia armazenamento e decode: no main, a entrada
textual é persistida e seu decode atual remove a camada de texto; na versão,
`saveVersion` persiste o resultado já nativo. Portanto alterar o parser global
também mudaria a leitura dos documentos existentes. Não fazemos isso.

## Correção restrita a `claims.valor`

- Hook de campo `beforeValidate`, somente em `update` e para `value` string.
- `beforeOperation` de claims remove flag antiga de restore ao iniciar create ou
  update. Payload não a limpa no término; reutilização sequencial do mesmo req
  não pode transformar uma nova edição explícita em restore. `restoreVersion`
  conserva seu fluxo e marcação internos.
- PATCH/Local API com `siblingData.valor === undefined`: serializar o fallback
  com `JSON.stringify`, inclusive string vazia. Isso segue a definição de omissão
  do próprio Payload; `undefined` explícito em JavaScript também usa fallback.
- Restore com flag interna estritamente `true`: serializar a string da versão,
  nunca `previousValue` ou o documento atual. Versão sem valor não ganha fallback.
- Demais valores e entradas explícitas continuam intocados. Create e PATCH normais
  conservam o contrato JSON textual do Payload: uma string nativa é enviada como
  `JSON.stringify(string)`; JSON inválido continua REST 400 com `path=valor`.
- Não substituir validator, desativar validação, alterar ACL/tenant, status,
  proveniência, eventos ou versões; não generalizar o hook aos demais campos JSON.
- `grafoEditorial()` compõe `afterSchemaInit` do adapter PostgreSQL e troca apenas
  o mapper de leitura da coluna `_claims_v.version_valor` por identidade. A tabela
  é resolvida pelo `tableNameMap` e `versionsSuffix`; coluna ausente, renomeada ou
  não JSONB interrompe inicialização. Não modifica protótipos, parser pg, escrita,
  colunas main, metadados SQL ou demais JSONB. Sem grafo, nada é instalado.

## Provas de aceite

Testes JavaScript de valores e REST real/PG16 para texto não JSON, strings que
parecem JSON, vazia, aspas, barra e newline; objeto, array, número, booleano e null.
PATCH editorial omite o campo; GET, evento e nova versão devem preservar seu tipo
e conteúdo. Restore usa versão já anotada e valor atual diferente. Uma extensão
de proveniência da fixture deve continuar recusando versão não anotada com seu
próprio path, sem alteração de documento, eventos ou versões. Auth, papel, tenant,
Local API e tentativa HTTP de forjar a flag interna fazem parte da prova.

Upgrade no mesmo PG16: a configuração equivalente à `.6` retira somente os três
hooks novos. Ela grava create e update de seis strings ambíguas e comprova o decode
antigo incorreto. O runtime `.7` reabre o mesmo banco sem push/drop/migration;
bytes SQL completos de documentos e versões devem permanecer iguais antes e
depois de GET/findVersions. Restore posterior usa a versão antiga correta e não
reescreve o histórico original. Não é um teste de tarball antigo literal.

`generateMigration` compara schema do grafo antes/depois do mapper e exige SQL
vazio; `confere:schema` compara o default com as migrations versionadas. Outros
JSONB e outra instância de schema mantêm seus mappers e comportamento.

A fixture OpenNext usa coleção claims simplificada e os MESMOS hooks de produção,
pool por requisição e PG16. Prova transporte/runtime real de 14 tipos em
GET/PATCH/versions/restore, JSON inválido e outro JSONB, junto ao cold20/warm20.
Não prova o grafo/ACL completos no Worker; esses são cobertos na integração Node.

## Limites explícitos

O core não tem `field.access.update` em `claims.valor`. Payload executa ACL de campo
depois do hook e pode repor fallback bruto quando uma ACL customizada recusa o
campo; esta correção não promete preservar valores sob essa extensão. Instâncias
que acrescentem essa ACL precisam de contrato/prova próprios antes do uso. As ACLs
de coleção/tenant do core continuam obrigatórias e são testadas.

O contexto de restore é confiável somente dentro do fluxo Payload; consumidores
não devem mapear contexto fornecido por HTTP para `req.context`/Local API. A
correção não corrige valores eventualmente alterados anteriormente: reconciliação
com snapshot e retomada do backfill são operações separadas do consumidor.

Esta correção é específica de Payload/db-postgres 3.88.0, pg 8 com parser JSONB
padrão e Drizzle 0.45.2. `types.getTypeParser`/parsers customizados e acesso raw SQL
não recebem transformação pelo mapper e estão fora do contrato: SQL raw deve
interpretar o JSONB armazenado conforme sua própria representação, sem reutilizar
o formato de entrada REST. Upgrade dessas dependências exige repetir a matriz.
Instâncias que tenham gravado versões por outro caminho precisam auditar sua
representação antes de consumir. Não há migração/reparo automático de valores já
coergidos por operações antigas.

Uma req pode ser reutilizada sequencialmente; não a compartilhe em operações
concorrentes. Hooks customizados que escrevam claims dentro de um restore devem
usar contexto próprio para a operação aninhada, sem transportar
`isRestoringVersion`: o contexto mutável do Payload não é uma pilha de operações.
Não há promessa de isolamento para contextos aninhados compartilhados.

Sem novo peer/dependência ou mudança de schema. Esta PR não publica automaticamente
nem retoma backfill; aprovação e publicação são etapas separadas.
Uma adoção segura exige release confirmada, versão fixa e rehearsal com snapshot,
hashes/tipos pós-leitura e rollback validado; nunca escrever no banco diretamente.
