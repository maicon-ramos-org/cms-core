# Grafo de dados — contrato da publicação pelo agente

Status: base publicada em `cms-core@0.2.0-next.3`; este documento foi atualizado
para a decisão de 2026-09-26. Até `next.10`, o plugin ainda executa G1–G4;
a retirada entra apenas após publicação da próxima versão.
Referências: PRDs 20, 22 e 23 e ADR-0013 do repositório da
plataforma. Não fecha esses três PRDs.
O consumo de cada pré-lançamento exige publicação confirmada no registry, não
somente merge/CI. As versões são fixadas pela instância; `latest` permanece 0.1.0.

## Ativação e compatibilidade

`grafoEditorial({ formatos? })`, exportado de `@maicon-ramos-org/cms-core/grafo`, é
um plugin passado a `cmsCore({ plugins: [...] })`. Ativação explícita permite gerar
e revisar a migration de cada instância antes de alterar seu banco. Sem o plugin,
a config e o schema atuais permanecem iguais. O pacote `schema` existente é
preservado. Dependências continuam fixas; instalar não ativa o plugin nem migra banco.

O núcleo registra `artigo`; o site/plugin registra os outros formatos por
`{ slug, rotulo, intencao }`. Campos específicos de receita/oferta continuam
sendo responsabilidade do site ou plugin. Formatos organizam os dados; não
disparam ou validam etapas editoriais.

## Coleções

Todas recebem `tenant`, obrigatório e imutável. Referências são verificadas no
servidor, inclusive em Local API, e devem pertencer ao mesmo tenant. Erro de
contrato retorna `ValidationError` (400) com `path`. Nenhuma coleção exige vetor,
Neon ou KV. Implantação prevista: Postgres 16 na VPS, banco/role por site, frontend
SSR/cache na Cloudflare.

| Coleção | Campos da entrega | Identidade/versões |
| --- | --- | --- |
| entidades | nome, slug, tipo, resumo, wikidata_qid, ymyl, saude (json) | tenant+slug único, versions |
| relacoes | de, para, tipo, peso (real finito, sem teto) | tenant+de+para+tipo único; de diferente de para |
| fontes | url, publisher opcional, titulo, tier (1–3), publicado_em, recuperado_em, upstream (fonte) | tenant+url único |
| claims | entidade, texto, valor (json), ano_ancora, fonte obrigatória, status (vigente/revisar/refutada), revisado_em | versions |
| pesquisas | entidade, corpo_md, qualidade opcional (0–100), validade_dias (>0), revisado_em opcional | versions; metadados para o pipeline editorial |
| clusters | nome, slug, entidade_pilar opcional, plano (json), status (planejado/ativo/concluido) | tenant+slug único, versions |
| eventos | colecao, doc, acao (create/update), ator (users), campos (nomes alterados) | append-only; hook interno; nenhum valor/segredo no diff |

Excluir registros do grafo não é exposto nesta fase, para preservar referências.
As seis coleções de dados aceitam `origem` opcional: chave de import estável como
`legacy:claim:123`, única por tenant e imutável depois de preenchida. Isso permite
upsert idempotente mesmo quando a prosa ou o título mudam; eventos não são importados.
Eventos usam a credencial autenticada (`req.user`), nunca ator enviado pelo cliente.
Uma API key por agente segue o contrato existente de `users`. Operações internas
sem usuário não inventam identidade: evento registra ator vazio.

## Posts e configuração por tenant

Posts acrescentam `tipo`, `intencao`, `resumo`, `entidades[]`, `cluster`, `claims[]`,
`corpo_md` e `pontuacao`. `posts.gates` permanece no schema apenas por
compatibilidade com bancos já migrados e não recebe avaliações novas. Lexical é
canônico: `corpo` explícito vence sobre
`corpo_md`; Markdown é convertido antes de validar. PATCH sem corpo preserva ambos.
Título, lista, tabela simples, link, citação, separador e upload referenciado são
testados em round-trip. Upload usa `![midia:ID]()` e verifica o tenant no servidor.
Imagem por URL externa e bloco de código cercado são recusados com 400 em
`corpo_md`, porque o editor atual não garante a conversão dessas entradas; não são
aceitos como texto degradado. Blocos de código e migração/rehost de imagem externa
precisam ser resolvidos antes do import completo. Links/relações embutidos no
Lexical também devem apontar para conteúdo do mesmo tenant.
Novo post de agente/ingestão deve entrar em `draft`, inclusive na Local API;
publicação é operação posterior e explícita. O agente publicador envia o post
final após pesquisa, redação, validação e revisão feitas inteiramente fora do CMS.
O CMS não cria papéis editoriais para agentes que não o acessam e não refaz
checagem de fonte, ano, palavras, estilo, SEO ou capa na publicação.

`tenants.grafo` traz tipos de entidade/relação opcionais (lista vazia permite
vocabulário livre). `tenants.gates` também permanece no schema, oculto e inerte,
para evitar uma migration destrutiva; não altera a publicação.

## Divisão de responsabilidades

O Hermes cuida de análise, pesquisa, criação, validação, revisão e decisão de
publicar. Só o agente da etapa final chama a API do Payload. O CMS persiste o
rascunho e sua publicação explícita, fornece campos estruturados e contexto de
pesquisa, mantém versões/auditoria, autentica a credencial e impede referências
entre tenants. Erros 400 do CMS dizem respeito ao contrato dos dados, não à
qualidade editorial. A eventual política G1–G4 pertence ao pipeline Hermes.

Proteções estruturais continuam: tenant imutável, vínculos existentes no mesmo
tenant, formato conhecido, chave de import estável e conversão fiel Markdown ↔
Lexical. O CMS não atesta que um texto foi revisado ou que uma fonte é confiável.

## Endpoints de leitura

`GET /api/grafo/contexto?entidade={slug}&tenant={id}` devolve entidade,
relações entrada/saída, claims com fonte, status e ano, pesquisa mais recente e resumos
de posts. Só sessão/API key autenticada. Tenant único da credencial é inferido;
credencial com múltiplos tenants escolhe um deles; super-admin deve escolher.
Tentativa de escolher tenant alheio falha. Consultas sempre filtram tenant.
Allowlist limita dados e comprimento; paginação truncada é declarada na resposta.
O endpoint retorna `Cache-Control: private, no-store`. O filtro de tenant
também é exercitado nas rotas REST das coleções e na leitura de versões.
Não inclui corpo de post, ofertas ou URL de afiliado. Esta fase suporta profundidade
1 apenas; outro valor retorna erro 400, sem fingir travessia de duas camadas.

O CMS não filtra claims por idade ou status: o Hermes recebe esses metadados e
decide quais usar. `POST /api/posts/{id}/gates` foi desativado (404); um
diagnóstico editorial, se necessário, deve acontecer no pipeline Hermes.

## Plano de arquivos e validação

Implementação em `packages/cms-core/src/grafo/{index,colecoes,contratos,acesso,
validacao,markdown,frescor,endpoints,eventos}.ts`, export adicional no package.json,
testes em `packages/cms-core/tests/grafo*.spec.ts` e `tests/int/grafo.int.spec.ts`.
Fixtures cobrem contrato estrutural, PATCH com null, fronteira de tenant, draft-first e
serialização. Integração usa banco de teste separado no Postgres 16 e REST real do
Payload, além da Local API. `pnpm check` é gate antes de commit/push.

Validação da mudança de responsabilidade: integração REST com Postgres isolado
prova publicação com `tenants.gates.ativo=true` sem pesquisa/citação, consulta de
claims antigas e em revisão e ausência do endpoint de gates. Ainda não houve
migration de site, publicação do pacote nem deploy de instância nesta mudança.

## Pendências explícitas de expansão

PRD20 histórico: G5, pgvector/pg_trgm, embedding/job/semelhantes, lacunas completas, contexto
profundidade 2, doc polimórfico, campos de afiliado e proteção de links, frescor em
cascata, migration versionada de cada instância, prova de round-trip de todos os
oito tipos ricos, Rich Results e paridade/latência com acervo real.

PRD23: coleção pautas, máquina de estados, locks/CAS concorrentes, descobridores,
reposição, saúde e verificação ao vivo. Não ativar scheduler com base só no registro
de formatos. PRD22: import real em dump local, prova de paridade, jobs de oferta,
cutover e desligamento. Nenhuma operação de produção é parte desta entrega.
