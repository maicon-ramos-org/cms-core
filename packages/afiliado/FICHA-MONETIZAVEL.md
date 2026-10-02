# Ficha monetizável compartilhada

Contrato de **leitura**, exportado por `@maicon-ramos-org/afiliado/conteudo`.
A primeira etapa criou o DTO; a segunda conecta a oferta pública existente a ele;
a terceira conecta a leitura pública do produto físico canônico.
Não instala collection, altera banco ou URLs nem modifica a escrita REST dos
publicadores. Os templates atuais da oferta e do produto físico são preservados.

## Contrato TypeScript

`FichaMonetizavelDTO` (`monetizable_content/v1`) reaproveita o conteúdo de
`ProdutoEditorialDTO` (`product_content/v1`), que continua exportado e compatível.

```ts
interface FichaMonetizavelDTO {
  schema: 'monetizable_content/v1'
  identity: {
    tenantId: string
    id: string
    source: 'product' | 'offer'
  }
  slug: string
  kind: 'product' | 'software' | 'service' | 'other'
  editorial: EditorialFichaDTO
  monetization: {
    listings: ListingFichaDTO[]
    variants?: Array<{ id: string; name: string }>
  }
}
```

As definições completas ficam em [src/conteudo/ficha.ts](src/conteudo/ficha.ts).
`editorial` contém nome, marca/modelo opcionais, categoria, imagem pública,
GTIN/MPN opcionais, especificações editoriais, status informativo e `indexable`.
O bloco `editorial.content` contém meta title/description, resumo, Markdown,
destaques e FAQ. `editorial.prosCons` mantém prós e contras explicitamente separados.

Cada listing contém id, seller, preço decimal exato/moeda, disponibilidade,
cupom, URL de ação afiliada e instante da observação. A ponte da oferta legada
também fornece ciclo de cobrança, preço anterior, desconto da loja, condições/
verificação do cupom, máscara e metadados promocionais. Nada disso é copiado para o
texto editorial. `null` significa ausente/desconhecido, não preço zero nem
disponibilidade confirmada. `variants` e `listing.variantId` são opcionais e
permitem manter agrupamentos comerciais sem misturá-los à análise ou impor layout.
Uma URL de ação pode ser HTTP(S) ou caminho local,
permitindo preservar a política do consumidor entre link final e CTA intermediário.

## Adaptadores e responsabilidades

- `fichaDeProduto(documento, opcoes)` lê a estrutura atual do catálogo canônico
  (`ProdutoFichaFonte`): nome, descrição estruturada ou legada, imagem, identificadores
  e `especificacoes_editoriais`. Não publica o JSON bruto `especificacoes`.
- `fichaDeOferta(documento, opcoes)` lê a oferta editorial (`OfertaFichaFonte`):
  `nome_exibicao`/`nome`, `analise_md`, `imagem_comercial`, `especificacoes` e
  `pros_contras`. Campos estruturados explícitos têm precedência sobre equivalentes
  legados. SEO, FAQ, marca/modelo ou indexação ausentes **não são inventados**.
- Os dois retornam `null` para documento de outro tenant ou não publicado. Isso é
  isolamento/publicação, não avaliação editorial. Produto publicado não precisa
  ser indexável para ser lido. Oferta pausada pode conservar análise publicada.
- `opcoes.tenantId` é obrigatório. Relações podem vir como id ou `{ id }`.
  O namespace `identity.source` distingue ids iguais de origens diferentes;
  não prova que dois registros representam a mesma entidade.
- `opcoes.image` fornece mídia já resolvida quando a origem guarda apenas um id.
  URLs relativas da biblioteca devem ser resolvidas pelo leitor antes de passá-las.
- `opcoes.listings` recebe dados comerciais **já resolvidos, tenant-scoped,
  vinculados à entidade e autorizados para exibição**. O adaptador faz allowlist,
  rejeita listings de outro tenant e destinos estruturalmente inseguros, mas não
  consulta relações nem substitui regras de destino, freshness ou cupom do consumidor.
  Não expõe automaticamente `url_afiliado`, comissões ou evidência comercial bruta.
- `opcoes.variants` recebe agrupamentos já vinculados à entidade. O adaptador
  normaliza id/nome e descarta outro tenant; o leitor continua responsável pelas
  relações entre produto, variante e listing.
- `editorial.status` não aprova nem bloqueia publicação ou indexação.
  `indexavel: true` precisa existir explicitamente no documento publicado.
  FAQ/hash/revisão não são portões. Pesquisa, qualidade e aprovação continuam fora
  do CMS. O adaptador não remove preços que o publicador tenha escrito na análise;
  apenas não injeta preços dos listings nela.

## Layouts independentes

`kind` descreve o assunto, não o design. Não existe campo obrigatório `layout`
ou `template` no contrato. O site pode escolher um layout por tipo, campanha,
preferência editorial ou configuração local — inclusive dois layouts para a
mesma ficha. A escolha visual não altera o formato de leitura do CMS.

```ts
import { fichaDeOferta, fichaDeProduto } from '@maicon-ramos-org/afiliado/conteudo'

const software = fichaDeOferta(oferta, {
  tenantId, kind: 'software', listings: listingsPublicos,
})
const equipamento = fichaDeProduto(produto, {
  tenantId, kind: 'product', image: imagemResolvida, listings: listingsPublicos,
})

// O consumidor escolhe o template; o contrato não conhece estes componentes.
const template = campanhaCompacta ? LayoutCompacto : layouts[ficha.kind]
// Renderizar: <Template ficha={ficha} />
```

O exemplo é pseudocódigo do consumidor, não alteração de rotas dos sites.

## Renderizadores reaproveitados

- `fichaMarkdown(ficha)` reutiliza `produtoMarkdown`, incluindo prós/contras e
  omitindo rótulos vazios de marca/modelo. Não injeta listings ou preços.
- `fichaMarkdownHtml(ficha)` reutiliza o parser HTML seguro existente, que escapa
  HTML cru e protocolos perigosos. É uma representação editorial opcional, não
  um template visual obrigatório.
- `fichaProdutoJsonLd(ficha, { canonical, ofertas? })` reutiliza
  `produtoJsonLd` para `kind: 'product'`, com imagem e identificadores reais.
  Ofertas de Schema.org só entram se o consumidor as fornecer explicitamente,
  após aplicar sua política comercial. Não inventa preços nem avaliações.
- Para software, serviço ou tipo desconhecido, `fichaProdutoJsonLd` retorna `null`;
  o consumidor conserva seu serializador apropriado. Não marca tudo como `Product`
  apenas para reutilizar uma função. `canonical` é fornecida pelo site.

## Diferenças que ainda impedem unificação completa

1. As origens mantêm campos e regras de publicação distintos; estes adaptadores
   não mudam a escrita nem transferem automaticamente registros entre collections.
2. Ofertas antigas podem não possuir SEO, FAQ, marca/modelo, identificadores ou
   flag de indexação. Esses campos ficam ausentes; complementação é editorial externa.
3. A coleção legada `ofertas` agora tem uma ponte específica de `titulo`, rich
   text em `corpo` e metadados `dados`/`meta`. Não foi convertida por cast nem
   fundida com `ofertas_editoriais`; outros consumidores próprios ainda precisam
   adotar a ponte ou fornecer seu mapeamento explícito.
4. Relacionamentos de loja/cupom/mídia e variantes/listings ainda são resolvidos
   pelos leitores existentes. A oferta e o produto físico do plugin convergem
   no DTO depois dessa resolução, sem decidir a persistência agora.
5. Rotas, aliases e URL canônica continuam separados do namespace de identidade.
   A oferta e o produto físico do plugin já consomem o contrato; o produto legado
   `produtos` conserva sua leitura anterior. Templates próprios dos sites não
   passam a usá-lo automaticamente. Não foi publicado pacote nesta etapa.
6. Serializadores próprios de software/serviço e templates visuais permanecem
   independentes. Reuso dos dados não exige uniformidade de design.

## Testes desta etapa

`tests/ficha-monetizavel.spec.ts` comprova paridade editorial entre produto e
oferta, independência comercial, isolamento de tenant, publicação sem gate de
revisão, ausência de dados inventados, allowlist, preservação de links/query
strings, prós/contras, reutilização de Markdown/HTML/JSON-LD e ausência de acoplamento
a layout. `tests/conteudo-dto.spec.ts` protege o contrato e os serializadores antigos.

```sh
pnpm --filter @maicon-ramos-org/afiliado typecheck
pnpm --filter @maicon-ramos-org/afiliado exec vitest run --exclude 'tests/int/**'
```

Não requer banco, migration, publicação de pacote, merge ou deploy. Adotar o DTO
nos consumidores e decidir rotas/persistência são etapas posteriores explícitas.

### Resultado local em 2026-10-02

- Typecheck do pacote: passou.
- Suíte unitária do pacote: **223 testes em 22 arquivos, todos passaram**;
  destes, 28 cobrem a nova ficha. Testes de integração com banco foram excluídos
  deliberadamente nesta etapa de contrato puro.
- Verificações `confere-core-sem-marca` e `confere-core-sem-node`: passaram.
- Validação de whitespace do diff rastreado: passou.
- Nenhum workflow remoto, banco ou ambiente de produção foi acionado.

Arquivos da alteração, todos neste pacote: `src/conteudo/ficha.ts`,
`src/conteudo/index.ts`, `src/conteudo/dto.ts`,
`tests/ficha-monetizavel.spec.ts`, `FICHA-MONETIZAVEL.md` e `CHANGELOG.md`.

## Segunda etapa: oferta pública conectada à ficha

### Fluxo de leitura

`fichaDaOfertaPublica(oferta, tenant, leitura)` em
[src/web/lib/oferta-ficha.ts](src/web/lib/oferta-ficha.ts) adapta a estrutura real
de `ofertas` para `FichaMonetizavelDTO` e recusa documento de outro tenant/draft.
Loja e cupom explicitamente de outro tenant são descartados. Relações legadas
sem tenant continuam compatíveis com a leitura expandida, filtrada pelo CMS.

- Título, SEO, resumo, destaques, FAQ, veredito, features e prós/contras vêm de
  `editorial`; imagens/derivados também são normalizados ali.
- HTML do rich text continua produzido por `lexicalParaHtml`, com a política de
  links anterior. `editorial.content.renderedHtml` é representação segura do texto
  aprovado, não HTML cru nem prosa produzida por um modelo.
- Preço/ciclo, loja, descontos, preço anterior, selos, condições, datas e ações
  vivem em `monetization.listings`. Valores não são interpolados no corpo, FAQ ou
  metadados SEO. Texto aprovado que cite preço histórico não é censurado; análise
  editorial continua no pipeline externo, não no CMS.
- BRL ausente mantém o default já definido na coleção legada. Moeda com formato
  inválido e valor não finito/negativo não viram preço público.
- Cupom usa `code: null` e `maskedCode`; o literal completo e destinos comerciais
  brutos não são carregados no DTO da página. `CupomCard` aceita a projeção
  mascarada e mantém a revelação por clique e os endpoints atuais.

### Comportamento preservado

As rotas HTML/Markdown/JSON conservam caminhos e canonicals de `caminhoDaOferta`,
incluindo pastas específicas por origem. CTAs `/r/o…` e `/r/c…`, parâmetros `ref`,
revelação, rich text, grade e CSS do template atual permanecem. Oferta comum e
lifetime continuam com apresentações diferentes; lifetime com cupom mantém o
card de revelação, enquanto sem cupom conserva preço anterior, pagamento e selos.
Prós/contras explícitos ganham um componente compartilhado, que não emite seção
quando vazio. Não há campo novo obrigatório ou gate de revisão/FAQ.

Sem conteúdo, mantém o fallback atual de metadescrição, sem gerar corpo editorial.
O JSON público continua no formato plano anterior, sem documento Payload bruto;
preços/descontos sem data permanecem ausentes dessa projeção. Markdown continua
separando linhas comerciais do corpo editorial. Cache tags usam as relações
normalizadas da ficha e não são configuradas para documentos recusados.

`schemaDaOferta` preserva o grafo `Product` legado (não reclassifica todos os
assuntos nesta etapa). `Offer` exige preço positivo/finito, moeda com formato
válido e URL HTTP(S) válida. Loja não é inferida como marca, estoque não é presumido
e data de observação não vira `availabilityStarts`. `priceValidUntil` não é inventado.

### O que continua separado

Collections, escrita REST, migrations e formatos de origem continuam distintos.
Na segunda etapa, o produto físico ainda usava seu leitor/template anterior;
oferta guarda corpo Lexical e dados
lifetime. A etapa não unifica as URLs, persistência, nem os templates próprios das
instâncias; estes não foram alterados. Layouts diferentes continuam possíveis.
FAQ ou especificações ausentes não são preenchidas automaticamente.

### Arquivos desta etapa

- `src/conteudo/ficha.ts`: extensões opcionais de apresentação e dados comerciais.
- `src/web/lib/oferta-ficha.ts`: adaptador legado e projeções para cupom/imagem/schema.
- `src/web/lib/cms.ts`: tipos da leitura, tenant/publicação e origem de URL.
- `src/web/lib/publico-json.ts`: JSON público derivado da ficha, com a allowlist anterior.
- `src/web/rotas/ofertas/[slug].astro`, `[slug].md.ts`, `[slug].json.ts`.
- `src/web/componentes/CupomCard.astro` e `ProsContras.astro`.
- `tests/oferta-ficha.spec.ts`, `tests/oferta-html.spec.ts`,
  `tests/publico-json.spec.ts` e `tests/fixtures/oferta/` (seis fixtures isoladas).
- `FICHA-MONETIZAVEL.md` e `CHANGELOG.md`.

### Resultado local da segunda etapa em 2026-10-02

- Typecheck do pacote: passou.
- Suíte local: **246 testes em 24 arquivos, todos passaram**. Inclui os 28 testes
  da primeira etapa, 14 testes do adaptador legado e 8 de renderização Astro real.
- Os testes HTML usam CMS, layout externo e WebMCP isolados por fixtures; a rota
  de oferta, CTAs, cupom e renderização editorial são reais. Não substituem uma
  revisão visual dos sites completos nem um teste do Worker em produção.
- Verificações `confere-core-sem-marca` e `confere-core-sem-node`: passaram.
- Integrações com PostgreSQL foram excluídas; nenhuma conexão/banco foi alterado.
- Sem publicação de pacote, workflow remoto, merge ou deploy.

## Terceira etapa: produto físico público conectado à ficha

### Fluxo de leitura

`getCatalogoProduto` continua resolvendo produto, imagem, variantes confirmadas e
listings ativos no tenant. `fichaDoCatalogo(catalogo, tenantId)` em
[src/web/lib/catalogo.ts](src/web/lib/catalogo.ts) projeta essa leitura pelo
adaptador existente `fichaDeProduto` para `FichaMonetizavelDTO`.

- Nome, resumo, Markdown, SEO, imagem, destaques, FAQ, especificações, GTIN/MPN,
  prós/contras e indexação vêm de `editorial` nos três formatos públicos.
- Grupos e vínculos de variantes, links finais e observação ficam em
  `monetization`. A ponte não inventa seller, preço, cupom ou estoque e não
  transforma a observação do link em dado editorial.
- As rotas sempre fornecem o catálogo completo: variante deve pertencer ao
  produto e ao tenant, estar confirmada, e listing deve estar ativo e vinculado
  a essa variante. Destinos continuam passando pela política comercial existente.
- A projeção `produtoFisicoPublicoJson` mantém compatibilidade com a chamada
  anterior de três argumentos, que recebe listings já vinculados pelo leitor.
  Quando não há variantes nessa chamada, o chamador continua responsável pelo
  vínculo à entidade; o helper ainda verifica tenant, publicação e destino.
- Documento de outro tenant, produto não publicado ou `_status: draft` não vira
  página pública. Produto publicado sem FAQ, texto ou `indexavel` continua
  acessível: não existe gate editorial novo nem prosa gerada pelo CMS.

`FichaProduto.astro` recebe a ficha validada; o parser Markdown seguro existente
continua renderizando o corpo para preservar o template. A rota Markdown usa
`fichaMarkdown`, e a projeção JSON deriva da mesma ficha, conservando seu formato
plano anterior. `schemaProduto` usa `fichaProdutoJsonLd`, sem fabricar `Offer`,
preço, avaliações ou disponibilidade: este leitor não fornece preço validado.

### Comportamento preservado

Continuam `/p/{slug}/`, `.md` e `.json`, canonicals, alternates, SEO, noindex,
imagem, ordem das seções, CSS, divulgação comercial, rótulos e atributos dos CTAs.
Links finais validados conservam tag e seletor de variante; não ganham redirect
intermediário. Prós/contras explícitos usam o componente compartilhado e não
emitem seção quando vazios. Preços e ações comerciais permanecem fora do corpo
editorial e são apresentados separadamente, sem censurar texto aprovado externo.

O cache mantém TTL/tags anteriores. Produto físico tem prioridade na resolução
de slug; apenas sua ausência permite o fallback para `produtos`. Esse produto
legado conserva layout, JSON, Markdown, Schema.org e CTAs anteriores. Se o leitor
retornar um produto físico mas a ficha recusar sua versão `_status: draft`, a
rota responde 404, sem substituí-lo silenciosamente pela entidade legada.

### Diferenças restantes

A oferta e o produto físico canônico compartilham contrato e leitura pública
**dentro do plugin**, não a persistência nem o design. Oferta guarda rich text/
lifetime e pode ter preço/cupom/loja; o físico usa Markdown e variantes/listings,
com preço ausente neste leitor. `produtos` legado ainda não consome a ficha.
Templates próprios das instâncias e suas versões instaladas não foram alterados;
adoção por um consumidor exige uma etapa explícita e testes nesse site.

### Arquivos desta etapa

- `src/conteudo/ficha.ts`: agrupamentos comerciais opcionais e vínculo do listing.
- `src/web/lib/catalogo.ts`: ponte da leitura e reutilização do JSON-LD.
- `src/web/lib/publico-json.ts`: projeção física pelo DTO.
- `src/web/componentes/FichaProduto.astro`.
- `src/web/rotas/p/[slug].astro`, `[slug].md.ts`, `[slug].json.ts`.
- `tests/produto-ficha.spec.ts`, `tests/produto-html.spec.ts`,
  `tests/fixtures/produto/`, `tests/fixtures/servidor-publico.ts`.
- `tests/oferta-html.spec.ts` e `tests/fixtures/oferta/Base.astro`: reaproveitamento
  do servidor de teste isolado e suporte ao noindex, sem mudança da rota de oferta.
- `tests/publico-json.spec.ts`: fixture com variante vinculada ao listing.
- `FICHA-MONETIZAVEL.md` e `CHANGELOG.md`.

### Resultado local da terceira etapa em 2026-10-02

- Typecheck do pacote: passou.
- Suíte local: **270 testes em 26 arquivos, todos passaram**. A etapa acrescenta
  14 testes do produto adaptado e 10 de renderização Astro real em três formatos.
- Cobertura inclui isolamento/publicação, vínculo de variantes/listings,
  preservação de query strings comerciais, produto sem preço/texto, noindex,
  prioridade do físico, fallback legado e paridade editorial HTML/Markdown/JSON.
- CMS, layout externo e WebMCP são isolados por fixtures; rotas e componente do
  produto são reais. Não substitui revisão visual dos sites ou teste de produção.
- Verificações de marca, dependências Node, cores, nicho e tenant: passaram.
- Integrações PostgreSQL foram excluídas; nenhum banco ou workflow remoto acionado.
- Sem alterações nas instâncias, publicação de pacote, migration, merge ou deploy.

## Quarta etapa: integração real com Payload/PostgreSQL

[tests/int/ficha-monetizavel.int.spec.ts](tests/int/ficha-monetizavel.int.spec.ts)
usa o padrão existente de `cmsCore`, `getPayload` e `handleEndpoints`, sem
substituir os readers ou `cmsFetch`. Um servidor HTTP local expõe a REST
autenticada do Payload somente para GET; as seis rotas reais de oferta/produto
(HTML/Markdown/JSON) também são exercitadas por um servidor Astro local.
Somente seleção do tenant, configuração virtual e layout externo são isolados
por fixtures: o template comercial, queries, autenticação, collections e banco
são reais. Isso não substitui revisão visual ou teste do Worker/R2 em produção.

### Banco seguro e fixtures

O teste recusa PostgreSQL fora de loopback antes de inicializar o adapter ou
habilitar limpeza. Usa um nome exclusivo por execução,
`cms_core_teste_ficha_<identificador>`, e verifica esse namespace antes de limpar
o schema de teste e destruir o Payload. O schema nasce por push no banco novo;
nenhuma migration é criada ou alterada. R2 é configurado com valores fictícios,
sem upload. Sem `DATABASE_URL`, pula localmente; no CI, a ausência reprova.

`tests/fixtures/ficha-integracao/dados.ts` cria, nas collections existentes:

- Dois tenants A/B, com os mesmos slugs de oferta/produto, mas IDs e conteúdo
  próprios: evita que isolamento passe apenas por slugs diferentes.
- Por tenant: loja, cupom, oferta comum, oferta lifetime, produto físico publicado,
  uma variante confirmada e dois listings ativos dessa mesma variante. Um listing
  usa link final revisado; o outro preserva um artefato SiteStripe válido.
- Histórico comercial e versões gerados pelos hooks reais, não por SQL manual.
- Uma oferta exclusiva de B, para provar ausência no tenant A.
- Três identidades de leitura `sistema`: A, B e A+B. A leitura SSR usa A+B para
  provar o filtro explícito do reader, além das recusas reais da REST com A/B.

`tests/fixtures/ficha-integracao/middleware.ts` apenas escolhe o tenant da
requisição de teste. `tests/fixtures/servidor-publico.ts` ganha a opção `cmsReal`
para não substituir os readers da integração; os testes unitários conservam seu
isolamento anterior. Nenhuma identidade ou credencial de produção é usada.

### Readers e garantias exercitadas

- `getOfertaBySlug`: REST `ofertas`, tenant/status/slug e depth 2; passa o documento
  real a `fichaDaOfertaPublica` e `ofertaPublicaJson`.
- `getCatalogoProduto`: REST `produtos_fisicos` com depth 1, seguida de
  `variantes_produto` e `ofertas_produto`, com filtros de tenant, entidade e estado;
  passa o catálogo real a `fichaDoCatalogo` e `produtoFisicoPublicoJson`.
- As seis rotas usam essas mesmas leituras/adaptações, com seus canonicals,
  template lifetime, CTAs e serializações reais.
- Nome, resumo, corpo, metadados SEO, destaques e FAQ equivalentes produzem o
  mesmo núcleo editorial nos dois DTOs. Não significa fabricar equivalência em
  campos inexistentes: `ofertas` legada não tem marca/modelo, enquanto o produto
  físico mantém esses campos reais. Layout e `kind` continuam independentes.
- Preço, cupom, seller, timestamps e links não são interpolados no editorial.
  O produto mantém uma identidade/ficha e dois listings; o leitor físico continua
  não expondo preços que não fazem parte de sua projeção anterior.
- Lifetime mantém features, FAQ, veredito, ciclo único, preço anterior, selos,
  pagamento e apresentação própria. O código literal do cupom existe no Payload,
  mas não aparece no DTO ou nas respostas públicas HTML/Markdown/JSON.
- A/B são isolados por queries, adapters e identidades REST; inexistentes dão
  `null` nos readers e 404 nas rotas. A oferta exclusiva de B não aparece em A.
- Leituras e renderizações repetidas não alteram nenhuma tabela do schema público:
  comparação SQL antes/depois inclui documentos, timestamps, versões e histórico.

### Comandos e resultado local em 2026-10-02

Com `DATABASE_URL` apontando para PostgreSQL **local descartável**, execute:

```sh
pnpm --filter @maicon-ramos-org/afiliado exec vitest run tests/int/ficha-monetizavel.int.spec.ts
pnpm --filter @maicon-ramos-org/afiliado exec vitest run --exclude 'tests/int/**'
pnpm --filter @maicon-ramos-org/afiliado typecheck
```

- Payload 3.88.0 e PostgreSQL 17.9 temporário local: **8 testes funcionais de
  integração passaram**. O único caso condicional pulado é a guarda que reprova
  CI sem banco; nenhum cenário funcional foi pulado.
- Suíte do pacote sem outras integrações: **270 testes em 26 arquivos passaram**.
- Typecheck do pacote: passou.
- Nenhum defeito nos adapters foi encontrado. Ajustes durante a preparação foram
  apenas nas fixtures: origem única por oferta, artefato comercial compatível com
  sua fonte e seletor de título compatível com atributos do Astro.
- O servidor PostgreSQL temporário foi encerrado depois dos testes. Nenhum banco
  de desenvolvimento/produção, workflow remoto, migration ou deploy foi acionado.

O contrato está pronto para **adoção controlada por um consumidor por vez**,
seguida de testes nesse site. Os resultados não unificam collections, não
publicam o pacote e não comprovam automaticamente compatibilidade de templates
próprios, cache R2 ou configuração de uma instância ainda não adaptada.

## Quinta etapa: gerador llms de fichas monetizáveis

`llms(tenant, base)` da extensão agora retorna uma única seção comercial de
descoberta, `Fichas monetizáveis`, com dados de
`fichasParaLlms(tenant)` em
[src/web/lib/llms-fichas.ts](src/web/lib/llms-fichas.ts).

```md
## Fichas monetizáveis

- [Título da oferta](https://site.example/ofertas/ficha/) — [Markdown](https://site.example/ofertas/ficha.md)
- [Título do produto](https://site.example/p/ficha/) — [Markdown](https://site.example/p/ficha.md)
```

O mesmo título/slug não representa identidade compartilhada: as duas entradas
acima permanecem, pois suas URLs são diferentes. Só canonical HTML realmente
idêntico é deduplicado; quando coincide em `/p`, a precedência física da rota é
preservada. A ordenação usa URL, origem e identidade, sem depender de locale ou
ordem de conclusão das consultas. Títulos têm escape estrutural de Markdown e
quebras de linha, sem censura semântica ou regras editoriais novas.

### Elegibilidade e leitura

- Oferta da collection atual `ofertas`: `_status: published`, tenant correto e
  sem opt-out explícito `indexavel: false`. Essa collection legada não possui
  flag obrigatória de indexação; suas páginas publicadas são indexáveis pela rota
  atual. Não exigir `dto.editorial.indexable: true` aqui: a ausência do campo no
  contrato não pode ocultar todas as ofertas. A decisão de elegibilidade externa
  não modifica nem inventa esse valor no DTO.
- Produto físico: `estado: published`, `indexavel: true`, tenant correto e nenhuma
  versão `_status: draft`. O adapter confirma a flag de indexação do DTO.
- Slugs precisam ter as representações HTML/Markdown admitidas pelas rotas
  existentes. O host é o `canonical_host` do tenant, nunca staging ou outro `base`
  passado pelo chamador. Ofertas respeitam `caminhoDaOferta`/`wordpress_id` e as
  pastas configuradas pelo consumidor; produtos preservam `/p/{slug}/`.
- O reader paginado usa o `cmsFetch` existente, `depth: 0`, páginas de 100 e
  `sort: id`. Cada consulta leva o tenant e a regra de publicação; o físico leva
  também o filtro de indexação. Nenhuma consulta busca variantes/listings ou loja.
- `select` limita a leitura aos metadados de identidade/publicação/título/slug.
  Esses documentos são normalizados pelos mesmos `fichaDaOfertaPublica` e
  `fichaDoCatalogo` usados nas rotas; nesta superfície não se monta a análise
  completa nem se carrega rich text, cupom, seller, preço ou destinos comerciais.
- Apenas título editorial e URLs públicas entram na saída. Campos comerciais,
  contagens e a antiga seção de lojas não são copiados. Se o título aprovado
  contiver uma referência comercial, isso continua sendo conteúdo editorial do
  publicador, não uma razão para o CMS filtrar palavras ou reescrever o título.
- Paginação inconsistente e falha do CMS reprovam a geração, em vez de devolver
  silenciosamente um índice vazio/parcial. Nada é escrito no banco.

### Limite importante: o llms.txt público continua estático

O gancho `llms` é legado e **não é executado** por
`packages/editorial/src/rotas/llms.txt.ts`. Essa separação foi mantida: a rota e a
resolução estável do host não foram alteradas. Reativar consultas paginadas no
acesso público voltaria a introduzir dependência do CMS no primeiro acesso.

Esta etapa prepara o **gerador reutilizável**, não publica a seção nos sites.
Adoção deve conectar seu resultado a um artefato/snapshot atualizado fora da
requisição pública, com validação de invalidação e performance no consumidor.
A configuração atual de índices estáveis não insere essa seção automaticamente.
Isso precisa acompanhar a adoção explícita; não se pode declarar a superfície
GEO dos sites concluída ou publicada apenas porque este gerador passou nos testes.

### Arquivos desta etapa

- `src/web/lib/llms-fichas.ts`: leitura enxuta paginada, adapters, canonical,
  deduplicação e escape/ordenação da saída.
- `src/web/extensao.ts`: contribuição `Fichas monetizáveis` pelo novo gerador.
- `tests/llms-fichas.spec.ts`: 17 testes focados, incluindo 137 ofertas e 113
  produtos em páginas distintas, rotas próprias, noindex/draft, tenant e comércio.
- `tests/int/ficha-monetizavel.int.spec.ts`: mais dois cenários reais de índice,
  sem mocks de CMS/readers; a prova de somente leitura também inclui o gerador.
- `FICHA-MONETIZAVEL.md` e `CHANGELOG.md`.

### Resultado local em 2026-10-02

- Suíte do pacote sem outras integrações: **287 testes em 27 arquivos passaram**.
- Integração focada Payload/PostgreSQL descartável: **10 testes funcionais
  passaram**, incluindo catálogo real de mais de 100 produtos e exclusão de
  draft/noindex/outro tenant. Só a guarda condicional de CI sem banco foi pulada.
- Typecheck do pacote: passou.
- A repetição da geração/rotas/readers não alterou documentos, versões ou histórico.
- PostgreSQL temporário encerrado; nenhum banco de desenvolvimento/produção foi usado.
- Sem mudanças de collection, migration, rota, instância, pacote publicado,
  workflow remoto, merge ou deploy.

## Auditoria de release — 0.2.0-next.22

Versão inédita confirmada no registro antes de preparar o PR. A dist-tag `next`
publicada naquele momento era `0.2.0-next.21`; `latest` permanece `0.1.0`.
Nenhuma publicação, tag, merge ou deploy faz parte desta auditoria.

### Entradas públicas e empacotamento

- `@maicon-ramos-org/afiliado/conteudo`: DTO, tipos, adapters e renderizadores
  (`FichaMonetizavelDTO`, `fichaDeOferta`, `fichaDeProduto`, `fichaMarkdown`,
  `fichaMarkdownHtml`, `fichaProdutoJsonLd`). O índice CMS também os reexporta.
- `@maicon-ramos-org/afiliado/web/lib/oferta-ficha`: ponte da oferta existente,
  compatibilidade comercial/visual e JSON-LD.
- `@maicon-ramos-org/afiliado/web/lib/catalogo`: reader existente e
  `fichaDoCatalogo`.
- `@maicon-ramos-org/afiliado/web/lib/publico-json`: projeções públicas existentes.
- `@maicon-ramos-org/afiliado/web/lib/llms-fichas`: `fichasParaLlms` e
  `linhaFichaLlms`; a extensão continua acessível pela entrada `web/extensao`.
- `@maicon-ramos-org/afiliado/web/componentes/ProsContras.astro`: apresentação
  compartilhada, sem impor template aos consumidores.

`files` inclui `src`, `CHANGELOG.md` e este documento. Fixtures, testes, caches,
ambientes locais e credenciais não entram no tarball. As dependências
`workspace:*` foram substituídas pelo `pnpm pack` por versões publicadas e
confirmadas no registro. Os módulos novos e alvos de exports foram inspecionados
no pacote efetivamente gerado, não apenas na árvore de trabalho.

### Verificações executadas

Todos os serviços desta execução são locais, exclusivos e descartáveis;
nenhum teste usa banco ou bucket de desenvolvimento/produção.

| Comando | Resultado |
| --- | --- |
| `pnpm install --lockfile-only --ignore-scripts` | Passou; lockfile regenerado sem delta, pois não há mudança de dependências. |
| `pnpm install --frozen-lockfile --ignore-scripts` | Passou; lockfile consistente com os manifests. |
| `pnpm --filter @maicon-ramos-org/afiliado test --exclude 'tests/int/**'` | 287 testes aprovados em 27 arquivos. |
| `pnpm --filter @maicon-ramos-org/afiliado exec vitest run tests/int/ficha-monetizavel.int.spec.ts` | 10 cenários funcionais aprovados; guarda de CI sem banco não aplicável. |
| `pnpm --filter @maicon-ramos-org/afiliado typecheck` | Passou. |
| `pnpm check` | Passou: travas, typecheck dos 11 projetos, Astro do consumidor e todas as suítes previstas pelo check. Inclui PostgreSQL e S3 locais. |
| Suíte completa do afiliado, dentro de `pnpm check` | 340 testes aprovados em 34 arquivos; 7 guardas condicionais de infraestrutura não aplicáveis. |
| `pnpm --filter @maicon-ramos-org/referencia-cms migrate` | As 5 migrations já existentes foram aplicadas apenas ao banco descartável de auditoria. |
| `pnpm --filter @maicon-ramos-org/referencia-cms confere:schema` | Schema em dia; nenhuma migration pendente. |
| `pnpm --filter @maicon-ramos-org/afiliado pack --pack-destination <diretorio-temporario>` | Tarball gerado e conteúdo/exports inspecionados; não publicado. |
| `git diff --check` | Passou. |

A auditoria alinhou a constante de versão das capabilities e corrigiu uma
tipagem opcional do título no template físico. O retorno 404 já garante que a
ficha existe naquele ramo; layout, texto, URL e CTAs não mudam com essa correção.
Collections e definições de schema permanecem idênticas à base do PR.

### Arquivos consolidados do PR

Todos os caminhos abaixo são relativos a `packages/afiliado/`:

```text
CHANGELOG.md
FICHA-MONETIZAVEL.md
package.json
src/conteudo/capacidades.ts
src/conteudo/dto.ts
src/conteudo/ficha.ts
src/conteudo/index.ts
src/web/componentes/CupomCard.astro
src/web/componentes/FichaProduto.astro
src/web/componentes/ProsContras.astro
src/web/extensao.ts
src/web/lib/catalogo.ts
src/web/lib/cms.ts
src/web/lib/llms-fichas.ts
src/web/lib/oferta-ficha.ts
src/web/lib/publico-json.ts
src/web/rotas/ofertas/[slug].astro
src/web/rotas/ofertas/[slug].json.ts
src/web/rotas/ofertas/[slug].md.ts
src/web/rotas/p/[slug].astro
src/web/rotas/p/[slug].json.ts
src/web/rotas/p/[slug].md.ts
tests/ficha-monetizavel.spec.ts
tests/int/ficha-monetizavel.int.spec.ts
tests/llms-fichas.spec.ts
tests/oferta-ficha.spec.ts
tests/oferta-html.spec.ts
tests/produto-ficha.spec.ts
tests/produto-html.spec.ts
tests/publico-json.spec.ts
tests/fixtures/ficha-integracao/dados.ts
tests/fixtures/ficha-integracao/middleware.ts
tests/fixtures/oferta/Base.astro
tests/fixtures/oferta/Compartilhar.astro
tests/fixtures/oferta/Ferramentas.astro
tests/fixtures/oferta/cms.ts
tests/fixtures/oferta/dados.ts
tests/fixtures/oferta/middleware.ts
tests/fixtures/produto/cms.ts
tests/fixtures/produto/dados.ts
tests/fixtures/produto/middleware.ts
tests/fixtures/servidor-publico.ts
```

### Próximo portão

O pacote está pronto para um único PR; a aprovação local não substitui o CI
remoto. Depois de CI e merge humano, a publicação requer autorização própria.
A adoção ocorre em um consumidor por vez, com smoke real de HTML/Markdown/JSON,
schema, isolamento e invalidação dos snapshots. O `llms.txt` deve ser
materializado fora da requisição pública, conforme o limite documentado acima.
