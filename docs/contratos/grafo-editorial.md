# Grafo editorial — primeira entrega do PRD 20

Status: base publicada em `cms-core@0.2.0-next.3`; frescor editorial versionado em
`cms-core@0.2.0-next.4`. O contrato foi escrito antes do código.
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
`{ slug, rotulo, intencao, validarPublicacao? }`. O callback recebe os dados
efetivos do post e devolve problemas `{ gate, severidade, path, mensagem }`.
Campos específicos de receita/oferta continuam sendo responsabilidade do site ou
plugin. Este registro descreve formatos editoriais; ainda não agenda etapas.

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
| pesquisas | entidade, corpo_md, qualidade opcional (0–100), validade_dias (>0), revisado_em opcional | versions; G1 recusa qualidade ausente; relógio editorial desde .4 |
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
`corpo_md`, `pontuacao` e `gates`. Lexical é canônico: `corpo` explícito vence sobre
`corpo_md`; Markdown é convertido antes de validar. PATCH sem corpo preserva ambos.
Título, lista, tabela simples, link, citação, separador e upload referenciado são
testados em round-trip. Upload usa `![midia:ID]()` e verifica o tenant no servidor.
Imagem por URL externa e bloco de código cercado são recusados com 400 em
`corpo_md`, porque o editor atual não garante a conversão dessas entradas; não são
aceitos como texto degradado. Blocos de código e migração/rehost de imagem externa
precisam ser resolvidos antes do import completo. Links/relações embutidos no
Lexical também devem apontar para conteúdo do mesmo tenant.
Novo post de agente/ingestão deve entrar em `draft`, inclusive na Local API;
publicação é operação posterior e explícita. Publicações e edições de post já
publicado passam novamente pelos gates habilitados.

`tenants.grafo` traz tipos de entidade/relação opcionais (lista vazia permite
vocabulário livre). `tenants.gates` traz `ativo` (false no início), `g1`, `g2`,
`g3`, `g4` (true) e limiares `qualidade_minima` (70), `palavras_minimas` (250).
Somente super-admin configura gates/vocabulários. Um agente não pode desligar sua
própria validação. `posts.gates` é relatório gerado pelo servidor.

## Gates implementados nesta fase

- G1: pesquisa da entidade principal, qualidade mínima e validade, sem aceitar
  timestamp inválido ou futuro. Extensão ainda não lançada prioriza `revisado_em`
  e identifica fallback técnico legado; veja [contrato de frescor](frescor-editorial.md).
- G2: claim vigente, texto presente na prosa normalizada, ano e link inline da
  fonte no mesmo parágrafo; estatística com percentual sem fonte ligada reprova.
- G3: blocklist editorial genérica e excesso de H2 em pergunta.
- G4: título SEO 30–65, descrição 70–200, mínimo de palavras, sem H1 no corpo e capa.
- Regras específicas de formato são callbacks do registro; P0 bloqueia com path.

Funções determinísticas recebem relógio explícito para testes. Não se atribui G5
completo a esta entrega: resolução das rotas da instância, proteção dos campos de
afiliado e similaridade exigem integração própria. Nenhum sinal do cliente pode
forjar aprovação. Relatório é a lista de problemas; lista vazia significa apenas
aprovação dos gates habilitados, não revisão humana nem publicação verificada.

## Endpoints de leitura

`GET /api/grafo/contexto?entidade={slug}&tenant={id}` devolve entidade,
relações entrada/saída, claims vigentes com fonte, pesquisa mais recente e resumos
de posts. Só sessão/API key autenticada. Tenant único da credencial é inferido;
credencial com múltiplos tenants escolhe um deles; super-admin deve escolher.
Tentativa de escolher tenant alheio falha. Consultas sempre filtram tenant.
Allowlist limita dados e comprimento; paginação truncada é declarada na resposta.
Os dois endpoints retornam `Cache-Control: private, no-store`. O filtro de tenant
também é exercitado nas rotas REST das coleções e na leitura de versões.
Não inclui corpo de post, ofertas ou URL de afiliado. Esta fase suporta profundidade
1 apenas; outro valor retorna erro 400, sem fingir travessia de duas camadas.

`POST /api/posts/{id}/gates` avalia o rascunho atual sem escrever/gerar versão;
usa o mesmo carregador e avaliador da publicação. Não publica conteúdo.

## Plano de arquivos e validação

Implementação em `packages/cms-core/src/grafo/{index,colecoes,contratos,acesso,
validacao,markdown,gates,endpoints,eventos}.ts`, export adicional no package.json,
testes em `packages/cms-core/tests/grafo*.spec.ts` e `tests/int/grafo.int.spec.ts`.
Fixtures cobrem gates, PATCH com null, fronteira de tenant, draft-first e
serialização. Integração usa banco de teste separado no Postgres 16 e REST real do
Payload, além da Local API. `pnpm check` é gate antes de commit/push.

Validação local em 2026-09-25: `pnpm check` verde (47 testes de scripts + 609
testes Vitest), com Postgres 16 e S3 de teste isolados. Os 46 testes novos cobrem
19 fixtures de gates, 4 de registro de formatos, 10 de Markdown, 1 de auditoria
concorrente e 12 de integração real. As cinco sentinelas de ambiente são puladas quando seus serviços estão
presentes; as integrações de banco e bucket foram executadas. `git diff --check`
também passou. Nenhuma migration foi aplicada a banco de site, nenhum pacote foi
publicado e o build/deploy das instâncias permanece uma etapa posterior.

## Pendências explícitas de expansão

PRD20: G5, pgvector/pg_trgm, embedding/job/semelhantes, lacunas completas, contexto
profundidade 2, doc polimórfico, campos de afiliado e proteção de links, frescor em
cascata, migration versionada de cada instância, prova de round-trip de todos os
oito tipos ricos, Rich Results e paridade/latência com acervo real.

PRD23: coleção pautas, máquina de estados, locks/CAS concorrentes, descobridores,
reposição, saúde e verificação ao vivo. Não ativar scheduler com base só no registro
de formatos. PRD22: import real em dump local, prova de paridade, jobs de oferta,
cutover e desligamento. Nenhuma operação de produção é parte desta entrega.
