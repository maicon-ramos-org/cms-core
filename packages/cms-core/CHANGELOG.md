# @maicon-ramos-org/cms-core

## Não lançado

- `siteReader: true` adiciona papel exclusivo de tenant único e identidade mínima
  `GET /editorial/identity-v1`, sem conceder Users.read ou acesso a coleções,
  drafts, versões, auditoria, jobs, GraphQL e admin. Requer instalação explícita
  dos guards HTTP original, layout/página/metadata e server actions no consumidor;
  o plugin isolado não protege todos os transportes. Entrada pública `/site-reader`.
- Exceção explícita: a action nativa de idioma do Payload permanece disponível
  como no login anônimo, somente alterando cookie. Sentinelas de manifest/corpo
  exigem revisão se essa superfície mudar; a serverFunction da aplicação é negada.
- Override de método é recusado antes de ler corpo; credenciais são revalidadas
  sem cache global. Config com strategies custom, autoLogin ativo ou roles oculto/
  virtual/localizado falha fechada; o default permanece desligado e sem alteração
  de schema. Ativar exige migration aditiva do enum de roles na própria instância.
- Integração/provas somente na referência local/CI. Sem ativação de sites, release
  automática, publicação de conteúdo ou concessão de URL/tracking afiliado ao reader.
  Contrato e limites: `docs/contratos/site-reader.md`.

## 0.2.0-next.8 — 2026-09-26 (pré-lançamento)

- A auditoria append-only do grafo compara a identidade dos campos relacionais
  de topo (`relationship` e `upload`) antes de registrar `eventos.campos`.
  Payload 3.88 fornece `previousDoc` com `depth:0` e o documento atualizado com
  a profundidade da resposta; povoar a mesma relação não é mais registrado como
  alteração. IDs, ordem das listas, coleção polimórfica e nulidade continuam
  sensíveis a mudanças reais. JSON e demais campos mantêm a comparação anterior.
  Limite conhecido: em posts, o `seoPlugin` com `tabbedUI` envolve os campos em
  tabs; esta normalização de `collection.fields` não alcança seus vínculos, nem
  o upload aninhado `posts.meta.image`. Esses campos ainda podem refletir
  diferença de população na auditoria de posts.
- Escritas auditadas nas coleções do grafo e em posts recusam `select` antes de
  persistir (`400`, `path=select`) em create, update e restore de versão, inclusive
  Local API e atualização em lote. Uma resposta parcial ocultaria campos do
  `afterChange` e produziria auditoria incompleta. Consultas GET com `select`
  continuam disponíveis; respostas completas de escrita não mudam.
- Sem consulta adicional, mudança de schema/migration, reescrita de eventos
  históricos, backfill ou ativação automática de instância. O pacote afiliado
  distribuído requer pin alinhado em release própria.

## 0.2.0-next.7 — 2026-09-26 (pré-lançamento)

- Preserva exatamente `claims.valor` string em PATCH que omite o campo e no
  restore de versão. O hook serializa somente valores nativos desses ramos;
  create/edição explícita mantêm o contrato textual JSON e entradas inválidas
  continuam 400 com `path=valor`, sem relaxar ACL, validator ou proveniência.
- No grafo opt-in, `afterSchemaInit` impede o segundo parse de JSONB somente em
  `_claims_v.version_valor`. Corrige a leitura/restauração de strings históricas
  como `12` e `null`; não muda parser global, main, escrita, schema ou outros JSONB.
  Acoplado ao Payload 3.88/pg 8/Drizzle 0.45.2, falha fechado se a coluna esperada
  não existir. Detalhes e limites em `docs/contratos/claims-valor-json.md`.
- Sem migration, edição de acervo, retomada de backfill, atualização automática de
  instância ou versão/publicação de afiliado/editorial. Valores já alterados por
  operações anteriores exigem reconciliação separada com snapshot.

## 0.2.0-next.6 — 2026-09-26 (pré-lançamento)

- Corrige TS2367 ao compilar `derivadosViaImages` em consumidores cujo Payload
  resolve tipos transitivos de Sharp 0.35.x, que não declaram o alias legado `jpg`.
  O formato recebido é validado na fronteira runtime, sem depender desse union
  externo para comparar o alias. `jpg` e `jpeg` continuam produzindo `image/jpeg`,
  fundo branco, qualidade solicitada e extensão `.jpg`; formatos não suportados
  continuam recusados. O JavaScript emitido permanece idêntico.
- Regressão compila o módulo real contra um contrato de `ImageSize` sem `jpg`,
  além das provas runtime dos dois aliases. A correção não muda schema, versões
  de Payload/Sharp ou ativação de plugins; o peer de runtime Sharp permanece
  `0.34.2`. Afiliado/editorial não recebem versão nem publicação nesta entrega.

## 0.2.0-next.5 — 2026-09-26 (pré-lançamento)

Pré-lançamento na dist-tag `next`; `latest` permanece em `0.1.0`. Ativação explícita
somente na plataforma Worker. Não muda schema, migrations, comportamento padrão
Node ou pins de instâncias. Não inclui nova versão de afiliado ou editorial.

- Plugin opt-in `poolPostgresPorRequisicao(obterContexto)` isola fila, clientes e
  listeners PostgreSQL por identidade de invocação, com conexão do binding atual.
  Sem acoplar o núcleo a OpenNext/Cloudflare, modificar driver global ou alterar
  Node/schema padrão. Falha fechado sem contexto, ao trocar conexão no mesmo
  request e com réplicas. Libera o cliente de bootstrap do adapter 3.88.
- Contrato e provas em `docs/contratos/pool-postgres-por-requisicao.md`.
  Consumidor instala somente no Worker e resolve `waitUntil` dinamicamente.
  Provas Workerd/PG16 e Worker OpenNext gerado cobrem concorrência cold/warm,
  autenticação, isolamento tenant e encerramento sem sessões residuais.

## 0.2.0-next.4 — 2026-09-26 (pré-lançamento)

Pré-lançamento na dist-tag `next`; `latest` permanece em `0.1.0`. Mudanças opt-in:
instâncias com grafo devem gerar/revisar migration de `pesquisas.revisado_em`
(inclusive versões) e preservar a data editorial original no backfill via REST.
Schema padrão sem grafo permanece igual; nenhuma instância é atualizada pelo pacote.

- Entrada pura `./pautas` com estados/papéis, registro imutável de formatos,
  classificação das oito falhas, avanço de uma etapa, cooldown e recovery por
  papel real de retorno. Sem I/O, relógio global, prioridade recalculada ou IDs
  arredondados. Não entrega coleção/fila/jobs; não importa histórico operacional
  nem habilita live_verified, publicação ou scheduler. Contrato incremental em
  `docs/contratos/pautas-incrementais.md`.
- G1 passa a usar `pesquisas.revisado_em` quando informado, sem renovar frescor
  por import/edição técnica. Campo opt-in sem default; clearing explícito em PATCH
  não pode reativar fallback. Pesquisa sem data conserva compatibilidade `updatedAt`
  marcada como legado, que exige auditoria/backfill antes de aprovar migração.
- Seleção de pesquisa por maior data efetiva, com duas consultas limitadas e
  tenant explícito. Contexto distingue revisão editorial e atualização técnica;
  REST/dry-run/publicação usam a mesma regra. Default sem grafo não muda schema.

## 0.2.0-next.3 — 2026-09-25 (pré-lançamento)

- Entrada opt-in `./grafo`: coleções de entidades, relações, fontes, claims,
  pesquisas, clusters e eventos. Vínculos de tenant são verificados por hooks,
  inclusive na Local API; origem de import é imutável e única por tenant.
- Contexto autenticado e limitado, sem corpo de post; eventos append-only com ator
  da credencial; novos posts de agente entram em draft.
- Respostas dos endpoints autenticados declaram `private, no-store`; isolamento
  também é provado nas rotas REST genéricas e no histórico de versões. Auditoria
  suporta hooks concorrentes no mesmo request sem perder sua autorização interna.
- Markdown/Lexical, registro extensível de formatos, avaliação determinística e
  dry-run dos gates iniciais G1–G4. Ativação por tenant, sempre reavaliada ao salvar
  conteúdo publicado. Uploads usam IDs de mídia do mesmo tenant.
- Contrato e limites em `docs/contratos/grafo-editorial.md`: ainda não entrega G5,
  vetores, fila de pauta, migração de instância ou operação de produção.

## 0.2.0-next.2 — 2026-09-25 (pré-lançamento, PRD 24 RF2)

Pré-lançamento na dist-tag `next`; o `latest` continua em `0.1.0`. Publicado junto com
`@maicon-ramos-org/afiliado@0.2.0-next.5`, que depende deste pacote por `workspace:*`.

### Novo: os derivados da mídia sem `sharp` (PRD 24 RF2)

- `derivadosViaImages(env.IMAGES)` — o `GeradorDeDerivados` pelo binding Images da Cloudflare,
  para passar em `midia.derivados` junto com `sharp: null`. Gera cada `imageSizes` da coleção
  com a regra do Payload traduzida para as opções da Cloudflare (o tamanho que o Payload
  omitiria é omitido; `cover` recorta e amplia; um lado só mantém a proporção; sem `quality`,
  a padrão do `sharp`; JPEG sobre branco; nome `{base}-{largura}x{altura}.{extensão}`). O que
  não tem tradução (`withoutReduction`, `trimOptions`, `fit: 'outside'`) falha no upload
  dizendo qual tamanho. Original TIFF ou AVIF — que o `sharp` redimensiona, mas o binding não
  aceita como entrada fora do plano Enterprise — falha no upload dizendo o tipo, e o erro do
  binding sai com o tipo, o arquivo e o tamanho (o original em `cause`). Tipos novos:
  `BindingImages` (o subconjunto do binding que o gerador usa; o `env.IMAGES` cabe nele sem
  conversão), `MIME_REDIMENSIONAVEIS` (a lista do `sharp`) e `MIME_DO_BINDING_IMAGES` (a
  entrada do binding: JPEG, PNG, GIF, WebP).
- **O formato de saída vem do binding, nunca do pedido.** Provado com um Worker de teste
  (binding Images de verdade, plano Paid) em 2026-09-25: de um PNG 3200×1800,
  `output({format:'image/avif', quality:55})` em 1600×900 (a `capa` desta coleção) saiu AVIF de
  verdade (`ftypavif`; `contentType()` e `info()` concordando em `image/avif`, 38,8KB contra
  45,6KB do mesmo corte em WebP) — o limite de 1.200px da página de limites da Cloudflare **não
  vale** para este uso; 1200×675 e 640×360 também saíram AVIF. Mas 2400×1350 pedido em AVIF
  voltou WebP **silenciosamente** (sem erro; `contentType()` e `info()` já diziam `image/webp`):
  o fallback existe acima de ~1.600–2.400px. Por isso `mimeType`, a extensão do `filename` e o
  `filesize` de cada derivado saem sempre do que `resultado.contentType()`/`info()` devolveram —
  nunca um `.avif` com WebP dentro — e quando o formato devolvido difere do pedido o gerador
  avisa no `logger` (`EntradaDoGerador.logger`, o `payload.logger`), sem falhar o upload.
- A coleção `midia` ganha um `beforeChange` (`midia/derivados-sem-sharp.ts`) que, **só quando
  a config vem sem `sharp`**, chama o gerador de `custom.derivados` e preenche `data.sizes` e
  `req.payloadUploadSizes` — o que o `storage-s3` sobe. Com `sharp`, não faz nada.
- `hooks/og-sem-transparencia.ts` deixou de importar `sharp` e `node:fs`: usa o `sharp` da
  config e `req.file.data`. Em Node a saída é a mesma, byte a byte. O recorte do Payload que
  ele refaz mora em `midia/derivados-sharp.ts`. A entrada principal fica sem `node:fs` e sem
  `import` estático do `sharp` (o da fábrica é sob demanda desde a RF1).
- Só upload novo passa pelo gerador; o acervo continua sendo regenerado em Node
  (`regeneraAcervo`, em `@maicon-ramos-org/cms-core/scripts`).

## 0.2.0-next.1 — 2026-09-24 (pré-lançamento, PRD 24 RF0.10)

Pré-lançamento na dist-tag `next` (RF4): o `latest` continua em `0.1.0` até a versão estável
`0.2.0` sair. Publicado junto com `@maicon-ramos-org/afiliado` (que depende deste pacote por
`workspace:*`) para o `pnpm pack` não fixar `afiliado` numa cópia velha do núcleo — sem isso o
site consumidor acabaria com duas versões de `cms-core` na árvore. `@maicon-ramos-org/editorial`
não muda nesta rodada (a RF3 que mexe nele ainda não fechou) e fica em `0.1.0`; como `editorial`
não depende de `cms-core`, não há duplicação a evitar.

O núcleo passa a montar o CMS nos dois formatos: em Node (VPS, CI, scripts) e num Worker da
Cloudflare. O que difere entre os dois vem por opção da fábrica; **sem as opções novas, a
config sai igual à da 0.1.0** (mesmas coleções, mesmo schema, mesmo `payload-types.ts`).

### Quebra: os scripts têm entrada própria (nota de migração)

O que só roda em Node — ciclo de vida do processo, portão de migração, semente, a trava do
schema e os scripts de acervo da mídia — saiu de `@maicon-ramos-org/cms-core` e mora em
`@maicon-ramos-org/cms-core/scripts`. A entrada principal é a que o CMS carrega (num Worker,
inclusive), e ela arrastava `node:fs` e `node:os` por esses scripts.

| Sai de `@maicon-ramos-org/cms-core`, entra em `@maicon-ramos-org/cms-core/scripts` |
|---|
| `mantemVivo`, `sair`, `SaidaInesperada`, `semSaidaDoProcesso` |
| `portaoDeMigracao` (e o tipo `OpcoesDoPortao`) |
| `semeia`, `aplicaSemente`, `upsert` (e os tipos `Semente`, `ContextoDoConteudo`, `ResultadoDaSemente`, `TenantDaSemente`, `UsuarioDaSemente`) |
| `confereSchema`, `confereSchemaNoPayload` |
| `copiaAcervo`, `clienteR2`, `chavesDaMidia` (e os tipos `BucketS3`, `MidiaParaCopia`, `RelatorioDaCopia`) |
| `regeneraAcervo`, `DERIVADOS`, `temTodosOsDerivados` (e os tipos `BucketRegenera`, `MidiaDoAcervo`, `RelatorioDaRegeneracao`) |

Continuam na entrada principal: `emPool`, `editorFeatures`, `ajustaCampo`, `configR2*`,
`urlPublica`, as coleções, os hooks e o acesso.

No site, só muda a origem do import:

```ts
// antes
import { mantemVivo, sair } from '@maicon-ramos-org/cms-core'
// depois
import { mantemVivo, sair } from '@maicon-ramos-org/cms-core/scripts'
```

### Novo: a fábrica injetável

`OpcoesCmsCore` ganha, todas opcionais e com o padrão igual ao de antes:

- `sharp` — sem a opção, a fábrica carrega o `sharp` (sob demanda, não mais por `import`
  estático); `null` desliga os `imageSizes` gerados pelo Payload, o recorte e o ponto focal
  (as coleções de upload saem com `crop: false` e `focalPoint: false`). Os `imageSizes`
  continuam declarados: são as colunas de `sizes`, as mesmas nos dois formatos — um teste
  confere que a migração gerada com `sharp: null` é idêntica à de sempre.
- `db: { connectionString, maxUses? }` — sem a opção, `DATABASE_URL`. Num Worker, a string do
  Hyperdrive e `maxUses: 1`.
- `midia.r2` — o bucket; sem a opção, as `R2_*` do ambiente, como antes.
- `midia.derivados` — um `GeradorDeDerivados` (tipos novos em `midia/derivados.ts`,
  exportados pela entrada principal), que a fábrica entrega à coleção `midia` em
  `custom.derivados`. O hook que o usa e a implementação pelo binding Images estão logo
  abaixo (RF2).
- `graphQL: { disable }` e `logger` — repassados à config do Payload.

O `sharp` virou dependência par **opcional** (`peerDependenciesMeta`). Sem ele instalado e
sem a opção, a fábrica falha dizendo o que fazer (instalar, ou passar `sharp: null`).

### Muda: a revalidação agrupa as tags de cada operação

Antes, cada documento salvo disparava um POST ao site, sem esperar. Agora a fábrica põe em
toda coleção — sem nada a fazer no site — um `beforeOperation` (`revalidateBeforeOperation`),
que abre o quadro da operação de escrita, e um `afterOperation` (`revalidateAfterOperation`),
que o fecha. `afterChange` e `afterDelete` só acumulam as tags no quadro aberto, e a operação
envia uma vez, em lotes de até 100 tags por POST (`TAGS_POR_POST`), cada tag uma vez. Um
`update` em massa de 250 documentos passa de 250 POSTs a 3.

- **O save não espera o envio**, como antes: o Payload roda o `afterOperation` antes do commit
  da transação, e o site avisado antes do commit re-renderiza a página com o dado anterior e o
  guarda em cache. O POST sai e a promessa vai para `revalidacao.emSegundoPlano` (opção nova da
  fábrica, guardada no `custom` da config, que é só do servidor). Sem a opção, a promessa fica
  solta — em Node, o de sempre. Num Worker, `(p) => getCloudflareContext().ctx.waitUntil(p)`,
  para ela não morrer com a resposta.
- **Escrita aninhada não parte o lote.** Um hook que grava em outra coleção com o mesmo `req`
  (o histórico de preço do catálogo do afiliado, por exemplo) abre um quadro por cima do da
  operação de fora; ao terminar, entrega as tags a ela, e só a de fora envia. Uma escrita
  aninhada que falha e é engolida pelo hook não prende as tags da de fora; uma operação que
  falhou num `req` que segue em uso passa as tags dela para a operação seguinte, quando esta
  começa noutra transação.
- Resposta de erro do site (o 429 de purge recusado, por exemplo) vira warning no logger,
  como a falha de rede já virava. A promessa do envio nunca rejeita.
- As tags de cada documento não mudam. Hook usado numa config que não veio da fábrica (ou
  chamado sem operação aberta) envia na hora, um POST por documento, como antes.
- Scripts de import continuam com `REVALIDATE_URL=` vazio e um purge geral no fim.
- Limite conhecido: operações concorrentes com o MESMO `req` (um `Promise.all` de escritas
  num hook) podem sair em mais de um envio — nenhuma tag se perde, só o agrupamento.

## 0.1.0 — 2026-09-24

Primeira versão publicada. O código veio do repositório do primeiro site da plataforma, com
o histórico preservado (PRD 17 RF9); muda só o escopo do pacote, sem mudança de
comportamento.
