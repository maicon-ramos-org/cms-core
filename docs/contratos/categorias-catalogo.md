# Registro extensível de categorias do catálogo

Status: implementado e versionado em `afiliado@0.2.0-next.7` (consumo após publicação
confirmada); contrato escrito antes do código. Recorte da proposta
`catalogo-editorial-proxima-onda.md`, separado do grafo
já publicado.

## API

`afiliado({ catalogo: { categoriasAdicionais: CategoriaCatalogo[] } })` acrescenta
categorias somente nessa instância. O default `afiliado()` conserva as quatro
opções atuais, campos, obrigatoriedades, enums, hashes e resultados de matching.
Categoria de nicho é registrada pelo site, nunca inventada no pacote.

`CategoriaCatalogo` contém `slug`, `rotulo`, `atributosDeIdentidade?: string[]`,
`versaoIdentidade?: number` (default 1) e `validarVariante?: (variante, produto) =>
{path,message}[]`. O callback é síncrono/puro, recebe dados efetivos em toda escrita
e não substitui as regras universais de tenant, identidade ou draft-first.

Atributos apontam para `sku_fabricante`, `gtin`, `material`, `cor`, `peso_g`,
`diametro_mm`, `acabamento` ou para caminhos
`especificacoes.campo` (incluindo subcampos). Caminhos ambíguos/prototype e slug
duplicado são erro de configuração. Valores de identidade novos são escalares
(string, número finito, boolean), sem arrays/objetos. A categoria nova exige os
atributos declarados ao confirmar a variante; incerta aceita dados incompletos.
Tipos escalares são preservados no matching novo: boolean `false` e string
`"false"` não são a mesma identidade. String vazia não é atributo comparável.
Uma incerta incompleta não pode ser enriquecida mudando sua identidade: crie uma
nova variante/revisão, como já exigia a política imutável anterior.

Não há mudança na exigência existente de marca/modelo do produto. Cadastro que
não conhece esses fatos continua pendente; o plugin não os adivinha.

## Identidade e matching

`registrarCategorias(adicionais)` e `REGISTRO_CATEGORIAS_PADRAO` são exportados pela
entrada `afiliado/cms`. Funções puras existentes aceitam registro opcional:
`chaveVariante(dados, categoria?, registro?)`,
`avaliaMatch(entrada, variante, produto, registro?)`,
`selecionaMatch(entrada, candidatos, registro?)`.

O chamador das funções puras passa o mesmo registro usado na configuração do site;
sem ele, a função não conhece categorias adicionais e falha fechado. O callback
recebe cópias dos dados efetivos: efeitos colaterais não alteram a gravação.

Chamadas antigas mantêm o comportamento. Para todas as categorias legadas, o hash
continua exatamente a função atual, incluindo especificacoes; fixtures usam hash
literal anterior. Regras específicas saem das funções genéricas e ficam nas
políticas padrão do registro, sem mudar o resultado da categoria original.

Categoria nova inclui slug/versão, SKU, GTIN e os atributos declarados no hash.
Demais metadados em especificacoes podem ser editados sem mudar identidade. Alterar
política/versão com acervo exige migração revisada; o hook não troca hashes antigos
automaticamente. Dado contraditório reprova matching mesmo com GTIN exato.
Categoria desconhecida nunca gera match automático. Sem identificador ou conjunto
completo de atributos, o resultado continua revisão humana.
Para categoria nova, `entrada.categoria`, quando informada, deve ser exatamente o
slug registrado (sem correção de caixa/espaços), inclusive com GTIN/SKU exato.
As políticas legadas conservam seu matching anterior, que não lê esse campo.

## Persistência e compatibilidade

O registro não acrescenta coleção/campo de banco. Categorias adicionais apenas
estendem o select `produtos_fisicos.categoria` e suas políticas de validação.
Cada instância gera/revisa migration da sua enum antes de ativar uma categoria.
O schema da referência padrão deve continuar sem diff. Um registro adicional não
muda configs montadas anteriormente no mesmo processo.

Restam fora: enriquecer marca/modelo, escolher categorias para o acervo, importar
ofertas, representar busca como produto, espelhos/picks/receitas e novos redirects.
Esses dados permanecem bloqueados no planner quando falta contrato ou identidade.

## Arquivos e prova

Alterações previstas: novo `packages/afiliado/src/cms/catalogo/categorias.ts`,
adaptação de `catalogo/regras.ts`, `catalogo/hooks.ts`,
`collections/CatalogoFisico.ts`, `cms/plugin.ts`, `cms/index.ts`, testes de
fixtures/integração e CHANGELOG ainda não lançado. Sem bump/tag nesta PR.

Aceite: hashes e matching legados preservados; nova categoria validada; callback
não contorna invariantes; desconhecida retorna 400; tenant continua isolado;
duas montagens não vazam categorias; migration padrão sem diferença; `pnpm check`
verde antes de push. Integração em Postgres 16 e S3 de teste isolados.

## Evidência local — 2026-09-26

- `pnpm check`: verde; 651 testes Vitest e 47 testes dos scripts passaram. Os seis
  skips são sentinelas de ambiente ausente; as integrações reais foram executadas.
- 42 casos novos: 32 de registro/identidade/matching, dois de configuração isolada
  e oito de REST/Local API no banco exclusivo `cms_core_teste_categorias`.
- `referencia-cms migrate` aplicou as duas migrations existentes em banco isolado;
  `referencia-cms confere:schema` confirmou schema em dia, sem migration adicional.
- Pacote `schema`, versões de pacotes e lockfile não foram alterados. Nenhuma
  escrita em produção ou tag/publicação nesta entrega.

Pendências: escolher categorias apenas com evidência do acervo; validar
marca/modelo ausentes; gerar migration no consumidor que habilitar novas opções;
contratar ofertas/picks/receitas e datas editoriais separadamente. A integração de
grafo `cms-core@0.2.0-next.3` já publicada não depende desta mudança.
