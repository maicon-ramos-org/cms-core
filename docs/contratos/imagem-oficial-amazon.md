# Imagem oficial remota da Amazon

## Escopo

O plugin de afiliado admite uma imagem remota opt-in nos documentos legados `produtos` e
nos documentos `produtos_fisicos` e `variantes_produto`. Os campos são:

- `imagem_oficial_url`: URL canônica da imagem;
- `imagem_oficial_proveniencia`: `amazon-manual-revisado`, `amazon-creators-api` ou
  `amazon-pa-api`.

Os dois campos andam juntos. Documentos antigos sem ambos continuam válidos, e o upload
`imagem` continua sendo o fallback. No produto legado, uma imagem oficial válida também
satisfaz o requisito de imagem do gate `indexavel`.

## Allowlist e persistência

O CMS aceita exclusivamente URL com:

- esquema `https`;
- host exato `m.media-amazon.com`;
- caminho iniciado por `/images/I/`;
- extensão final comum de imagem: AVIF, GIF, JPEG/JPG, PNG ou WebP;
- nenhuma credencial ou porta.

Aliases, subdomínios parecidos, HTTP, caminhos diferentes e URL malformada são recusados.
Query string e fragmento são removidos antes da persistência. A camada web repete a
validação ao ler para que dado legado/importado inválido nunca vire `src`; nesse caso ela
usa o upload existente.

A renderização usa a URL remota diretamente no navegador, com `width`/`height`, `alt`
interpolado pelo Astro, `loading="lazy"` e `decoding="async"`. O núcleo **não raspa,
baixa, transforma, faz proxy ou re-hospeda** a imagem, nem gera derivados da URL remota.

## Proveniência, direitos e escala

Encontrar uma URL em página de concorrente é apenas um sinal de descoberta. Isso não
prova origem, autorização, licença ou direito de uso e não é uma proveniência aceita. O
operador precisa revisar a URL contra uma superfície oficial da Amazon e registrar o
método real.

A captura manual é adequada somente ao volume pequeno e revisado. Para escala durável,
migre a obtenção e a atualização para Amazon Creators API ou Product Advertising API,
seguindo os termos do programa, regras de exibição e requisitos de frescor aplicáveis.
Guardar a URL não elimina a obrigação de atualizar ou remover uma imagem quando a fonte
oficial ou seus termos mudarem.

## Migração e ativação

A mudança de schema é aditiva, mas cada instância deve gerar e revisar sua própria
migration antes de gravar os campos. Este contrato não executa backfill, não ativa nenhum
site e não altera tenant, redirect, preço ou vínculo comercial.
