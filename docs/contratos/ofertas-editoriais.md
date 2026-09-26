# Ofertas editoriais opt-in — contrato antes do código

Status: recorte aprovado e implementado em 2026-09-26; versionado em
`afiliado@0.2.0-next.7`, com `cms-core@0.2.0-next.4`. Consumo após publicação confirmada.
Base: `main` c1f2c50, com registro de categorias da PR #17 já integrado. Esta onda
não muda o catálogo físico nem exige marca/modelo onde esses fatos não existem.

## Evidência e limite

A instância de origem confirmou 741 ofertas (593 Shopee, 92 Amazon, 54 Mercado
Livre, duas Hotmart), 100 espelhos (30 exatos, 52 equivalentes, 18 buscas), 63
preços ausentes e 15.968 verificações históricas. Todos os espelhos são de um
nível, todos os nomes existem. Os 62 conteúdos (56 publicados na origem e seis
despublicados) entram como draft; sete receitas estruturadas pertencem ao plugin
local. As 36 pautas não pertencem a esta entrega.

Fontes de contrato: `catalogo-editorial-proxima-onda.md`, schema SQL e migrations
de oferta da origem; `docs/plataforma/contrato-dto.md`, `products.ts`,
`public-page-dto.ts` e `/ofertas/[slug]/index.ts` da instância. O DTO privado
PageData não é resposta pública. O pacote `schema` existente continua a fonte de
JSON-LD; nenhum pacote novo ou schema de nicho será criado.

## Instalação sem drift padrão

Novo plugin `ofertasEditoriais({ programas })`, exportado por `afiliado/cms` e
instalado explicitamente depois de `grafoEditorial(...)`. Requer as coleções
`entidades`, `posts` e `tenants`; configuração incompleta falha com mensagem clara.
Não exige `afiliado()` nem catálogo físico; pode coexistir com ambos. Sem o plugin,
a config, o schema e as rotas de Runzos/referência permanecem iguais.

`programas` registra `{slug, rotulo, hostsPermitidos: string[]}` por instância.
Sem wildcard, sem programa desconhecido e sem resolvedor que aceite qualquer
domínio. Não há registro automático dos programas de uma marca. O site fornece os
resolvedores e credenciais em memória/ambiente, nunca em documentos do CMS.

O CMS acrescenta duas coleções e campos opt-in em posts/tenants. Cada consumidor
gera e revisa sua migration; esta PR não altera a migration da referência padrão.

## Coleção `ofertas_editoriais`

Tenant obrigatório/imutável; versões e `_status: draft|published`. Toda criação
automatizada nasce draft, independentemente de `estado: ativa`. Publicar exige
operação explícita posterior. Não há delete que deixe referências pendentes.

| Campos | Contrato |
| --- | --- |
| `origem`, `slug` | obrigatórios, únicos por tenant e imutáveis; import usa IDs estáveis, não títulos; slug ASCII alfanumérico separado por hífens preserva caixa e comparação exata |
| `programa`, `external_id` | programa registrado, ID externo nullable; índice único tenant/programa/external_id quando presente, como na origem |
| `nome`, `nome_exibicao` | nome obrigatório; nome editorial opcional, sem fabricar marca/modelo |
| `url_produto`, `url_afiliado` | produto nullable; afiliado privado, HTTP(S) sem credenciais; destino ativo/publicado exige host permitido pelo programa |
| `preco`, `comissao_taxa`, `comissao_estimada` | strings decimais canônicas ou null; preço/estimativa até 2 casas, taxa até 4, sem float/zero inventado; comissão privada |
| `contexto_de_uso`, `disclosure` | texto opcional; boolean explícito preservado |
| `estado` | `ativa|quebrada|pausada|encerrada`, separado do draft editorial |
| `especificacoes[]` | `{rotulo,valor}` textual, ordem preservada, consumido pelo DTO |
| `pros_contras[]` | `{tipo:pro|con,texto}`, ordem preservada |
| `analise_md` | análise editorial opcional, não duplicada em pontuação |
| `imagem_comercial` | grupo `{url,alt}`, separado de capa editorial própria; nenhum download automático |
| `evidencia_comercial` | grupo nullable descrito abaixo; sem payload cru opaco no renderer |
| `entidades[]` | `{entidade,prioridade}`; entidade única, mesmo tenant; prioridade inteiro assinado, sem teto inventado |
| `espelho_de`, `correspondencia` | relação nullable no mesmo tenant; `exato|equivalente|busca` para espelhos; canônica mantém ambos null |
| `atualizado_na_origem` | timestamp original opcional; não recebe `now()` no import |

`evidencia_comercial` contém `vendas`, `numero_avaliacoes`, `avaliacao`,
`desconto_percentual`, `fonte` e `observado_em`, todos nullable. A origem Shopee
fornece sales/ratingStar/priceDiscountRate; a Amazon fornece rating.value e
rating.votes_count. Número de avaliações NÃO vira vendas. Não há data garantida
no raw: usa-se a observação histórica aplicável ou null, nunca um frescor fictício.
O adapter mapeia a fórmula de score atual explicitamente; o core não cria ranking.

`raw` original fica no arquivo privado de migração da instância. O campo de imagem
tipado consolida imageUrl/image_url; não é necessário reconstruir JSON cru para
renderizar. Comissão e URL de afiliado só são lidas por sistema/super-admin;
agentes de conteúdo não as recebem. Importador usa sua própria credencial interna
escopada ao tenant. As escritas continuam validadas, inclusive Local API.
Draft pode conservar uma URL HTTP(S) legada cujo host ainda não foi aprovado;
isso não habilita CTA ou redirect. Publicar oferta ativa exige destino permitido,
e o resolvedor revalida a política atual em todo clique.

Espelhos são editoriais, não identidade física: busca continua fallback de busca,
não vira SKU/ASIN confirmado. Este recorte conserva um nível: espelho aponta só
para canônica; uma canônica com filhos não pode virar espelho. Autorreferência,
cadeia/ciclo e cross-tenant retornam 400 com path. Lock por tenant serializa mudanças
de espelho e impede que duas escritas concorrentes formem ciclo. Não reescrever
automaticamente um alvo já importado para encaixar no contrato.

## Coleção `verificacoes_ofertas_editoriais`

Histórico append-only: `tenant`, `origem` única/imutável por tenant, `oferta`,
`verificado_em`, `link_ativo: boolean|null`, `preco_visto: decimal|null`,
`disponivel: boolean|null`, `nota` e ator derivado da requisição, não do body.
Oferta deve pertencer ao tenant. Import de datas antigas é permitido e não atualiza
o timestamp editorial do conteúdo nem o estado da oferta implicitamente.

Leitura por usuários autenticados no tenant; criação por credencial interna e
update/delete negados inclusive Local API. Repetir origem é conflito com path;
o planner deve ler e comparar antes, sem fabricar observações novas no retry.
Esta PR não cria scheduler, conector pago ou verificação de rede.

## Escolhas editoriais

`posts.escolhas[] = {oferta: ofertas_editoriais, papel, posicao}`. Papel único por
post; posição inteiro assinado e ordem estável, sem inventar limite ausente no
schema legado. Papel deve constar em `tenants.ofertas_editoriais.papeis_escolha[]`
`{slug,rotulo}`, configurado por super-admin. Não há papel com marca no núcleo.

Referências são validadas no mesmo tenant em cada PATCH, inclusive remoção/null e
Local API. Salvar draft pode referenciar ofertas draft para importar dependências.
Um post publicado não pode ganhar escolha de oferta draft. Oferta quebrada mantém
a escolha auditável; resolvedor não inventa alternativa nem reescreve prosa.

Resolvedor de escolhas retorna os itens tipados e a contagem canônica distinta;
espelhos não aumentam número de produtos. Elegibilidade de compra exige oferta
publicada, ativa e destino permitido. Quantidade mínima por formato, experiência,
nota e receita continuam decisões do formato/plugin local, não um novo gate global.

## DTO e redirect explícito do consumidor

Helper web exportado em `afiliado/web/lib/ofertas-editoriais`, sem dependência Node
no runtime. Projeção pública por allowlist: dados editoriais, imagem, métricas,
preço nullable e href próprio; nunca comissão, credencial, raw ou URL afiliada.
Ordenação e identidade Payload são estáveis; o adapter resolve IDs legados por
origem e conserva o PageData da instância. Dataset incompleto reprova a ativação.

O pacote NÃO injeta `/ofertas/{slug}/`: no Runzos essa rota já é página de conteúdo.
O site conecta o helper explicitamente ao alias legado. Contrato do helper:

- lookup usa tenant explícito, slug e estado publicado; espelho é resolvido no
  mesmo tenant. Programa/loja clicada continua a do espelho, ID canônico a do pai;
- clique normal em oferta elegível: 302, `Cache-Control: no-store` e
  `X-Robots-Tag: noindex`; inativa/ausente/draft: fallback 302 `/`, sem sinal;
- prefetch: 204 sem lookup, destino ou sinal. Isto é hardening deliberado da ponte
  nova, NÃO paridade literal do handler legado, que ainda emite 302;
- `from` explícito sanitizado tem prioridade, depois Referer da mesma origem,
  depois `direct`; o resolvedor recebe `src` resultante. Não aceitar Location,
  domínio ou programa vindo da query;
- programa injeta resolvedor puro de URL (Amazon exato/busca, Hotmart src, links
  curtos preservados conforme programa). O resultado é revalidado contra allowlist;
  sem resolver/host permitido não há redirect externo, nem fallback para URL crua;
- não seguir redirects, fazer prefetch comercial ou consultar loja durante a
  resolução. Credenciais ficam na configuração privada do site;
- sinal por callback privado injetado: oferta clicada/canônica, programa, from/src,
  tenant e classificação de clique. Higiene humana é explícita do consumidor;
  ausência de callback não autoriza inventar sinal. Falha de tracking não bloqueia
  302; `waitUntil` pode segurar a tarefa nos Workers. Não mudar a coleção `cliques`
  do afiliado padrão nem fingir que esta PR implementa todo motor de sinais.

## Provas antes do código e aceite

Primeiro testes vermelhos de contrato, depois implementação incremental:

1. Decimal exato/null; array ordenado; lookup/validação de programas e URLs;
   serializer não expõe valores privados; métricas sem conversão review→vendas.
2. Plugin sem opt-in não muda nenhuma coleção/campo/rota/schema; dois sites no
   mesmo processo não compartilham config. Consumidor com GeneratedTypes continua
   compilando; não presumir que o teste sem tipos gerados cobre isso.
3. PG16/REST: origem/slug/ID externo únicos, tenant imutável, refs/versions isoladas,
   keys independentes, campos privados, drafts, PATCH null, histórico append-only.
4. Espelho exato/equivalente/busca; cross-tenant, self, cadeia e corrida de ciclo
   falham; duplicatas de origem concorrentes não deixam duas linhas.
5. Picks de papéis diferentes e rank zero/negativo; papel duplicado/vocabulário inválido
   retornam path; publicada com escolha draft falha; canônico conta uma vez.
6. Redirect: destinos sintéticos por programa, 302/headers/fallback, prefetch204
   sem I/O, from/src, canonicalId/loja clicada, host indevido, destino com
   credenciais e falha de tracking. Nenhuma chamada a loja real nos testes.
7. `pnpm check`, referência padrão `confere:schema` sem diff e CI antes de PR
   entregue como pronta. Não basta workflow accepted ou job com erro tolerado.

Paridade dos 62 conteúdos/741 ofertas e import das 15.968 verificações duas vezes
são aceites da integração Alma posterior, com relatório de exceções; não declarar
isso por unit tests. A instância já comprovou seus 62 posts draft e segunda
passagem sem writes: os dois supostos HTML inline eram autolinks Markdown, não
quarentena real. Receita, formatos extras e datas originais dos posts são do plugin local autorizado.
Pautas, jobs de freshness, conectores, publicação e cutover não estão autorizados
por este contrato. Nenhuma tag/release ou escrita em produção nesta fase.

## Auditoria de hosts do snapshot — sem URLs/query/tokens

Agente da instância conferiu somente scheme/hostname/contagem nos dados reais.
Todos os campos presentes são HTTPS, válidos e sem credenciais embutidas. Não há
exceção de host nem external_id vazio/duplicado por programa. Null permanece null.
O inventário encontrou 76/741 slugs com maiúsculas e 741/741 compatíveis com
`^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$`: import, lookup e alias
preservam caixa; não regenerar slug ou aplicar lowercase. Programas/papéis
continuam identificadores kebab-case independentes das URLs legadas.

| Programa | Destino afiliado permitido | Produto (informativo, não fallback de redirect) | Imagem comercial |
| --- | --- | --- | --- |
| shopee | s.shopee.com.br (588), shopee.com.br (5) | shopee.com.br (588), null (5) | cf.shopee.com.br (588), null (5) |
| amazon | www.amazon.com.br (92) | null (92) | m.media-amazon.com (51), null (41) |
| mercadolivre | meli.la (54) | www.mercadolivre.com.br (5), null (49) | null (54) |
| hotmart | go.hotmart.com (2) | go.hotmart.com (2) | null (2) |

Esta é configuração da instância/fixture de compatibilidade, não default global
do pacote. Host de produto ou imagem não entra automaticamente na allowlist de
destino afiliado; ML continua usando meli.la, sem fallback silencioso a link cru.

## Estado da implementação e limites de verificação

Implementado neste recorte: as duas coleções, validações em REST/Local API,
registro de programas, escolhas e helpers de DTO/redirect. Revisão cruzada
read-only não encontrou P0/P1; a sugestão de teste para PATCH de campos comerciais
por agente puro, inclusive null/overrideAccess, foi incorporada e passou.
Slugs legados com maiúsculas tiveram teste REST vermelho antes da correção.
`confere:schema` da referência padrão passou sem diff em PG16 isolado.
`pnpm check` completo passou: 700 testes Vitest e 47 testes das travas/scripts;
sete sentinelas condicionais ficaram skipped, não as suítes de integração reais.
O recorte adicionou 49 casos (18 puros, 18 redirect, dois configuração e 11 PG/REST).

O typecheck da referência com GeneratedTypes não equivale à prova de todo
consumidor opt-in: a instância observou anteriormente estreitamento de tipos no
grafo já publicado e usa `typescript.declare=false`. Esse problema de tipagem
do grafo permanece separado; esta PR não o declara corrigido. Nenhuma migration,
oferta ou verificação histórica foi aplicada em produção, nem a paridade completa
do acervo foi declarada.
