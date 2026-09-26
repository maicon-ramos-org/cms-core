# cms-core

O núcleo da plataforma de sites: a fábrica da config do Payload (`@maicon-ramos-org/cms-core`),
o tema editorial como integração Astro (`@maicon-ramos-org/editorial`), o plugin de afiliado
(`@maicon-ramos-org/afiliado`, entradas `cms` e `web`) e as bibliotecas que eles usam
(`schema`, `webmcp`, `auto-linker`, `afflinks`, `desconto`).

Cada site é um repositório próprio que consome estes pacotes por **versão fixa**
(ADR-0011 §4). Nada aqui conhece marca, domínio ou nicho de um site — a trava
`scripts/confere-core-sem-marca.mjs` confere a cada `pnpm check`.

O grafo editorial incremental é ativado pelo plugin `grafoEditorial()` da entrada
`@maicon-ramos-org/cms-core/grafo`. O [contrato](docs/contratos/grafo-editorial.md)
descreve coleções, formatos, gates, migração por instância e limites desta entrega.
O plugin saiu em `cms-core@0.2.0-next.3`; a ativação continua explícita por instância.
O pré-lançamento `.4` acrescenta [frescor editorial](docs/contratos/frescor-editorial.md)
e a [máquina pura de pautas](docs/contratos/pautas-incrementais.md), sem ativar fila.
O pré-lançamento `.5` prepara o plugin opt-in
[`poolPostgresPorRequisicao`](docs/contratos/pool-postgres-por-requisicao.md), para
isolar conexões PostgreSQL por invocação Worker. Node e schema padrão não mudam;
consumo depende de publicação confirmada, não apenas desta versão no repositório.

Ofertas sem identidade física têm o plugin separado `ofertasEditoriais({ programas })`
em `afiliado/cms`. O [contrato](docs/contratos/ofertas-editoriais.md) descreve drafts,
espelhos, histórico, escolhas e redirect opt-in, versionados em `afiliado@0.2.0-next.7`.
Consuma as versões exatas somente após o workflow de publicação e a disponibilidade
no registry serem confirmados; merge/CI, isoladamente, não publicam um pacote.

## Como provar uma mudança

- `pnpm check`: travas, tipos e testes de todos os pacotes (os de integração pedem Postgres
  e o MinIO do CI).
- `apps/referencia-cms` e `apps/referencia-web`: o site de referência — só o núcleo e o
  plugin, com dois tenants de exemplo, nunca publicado. O CI migra, semeia, sobe os dois e
  roda `scripts/fumaca-referencia.mjs`: cada rota do tema e do plugin nos dois tenants, e um
  tenant sem enxergar o conteúdo do outro.

## Como publicar

Suba a versão no `package.json` do pacote, escreva a seção no `CHANGELOG.md` dele e crie a
tag `<pacote>@<versão>` (ex.: `cms-core@0.2.0`): o workflow `pacotes.yml` confere, testa,
empacota, atesta a procedência e publica no GitHub Packages.

Pré-lançamento (versão com `-`, ex.: `cms-core@0.2.0-next.1`) sai na dist-tag `next`, e o
`latest` continua na última estável — quem consome fixa a versão exata de qualquer jeito.
Versão estável sai sem `--tag` e o npm aplica o `latest` (`scripts/dist-tag.mjs`).

Envie **uma tag por `git push`**: o GitHub não dispara workflow quando mais de três tags
chegam no mesmo envio — as tags sobem e nada é publicado, sem aviso.

## Como consumir

Os pacotes saem como código-fonte (TypeScript e `.astro`): o site compila. Instalar do
GitHub Packages pede token com `read:packages`:

```
@maicon-ramos-org:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```
