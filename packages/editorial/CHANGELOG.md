# @maicon-ramos-org/editorial

## Não lançado

O tema roda em Node e em Workers (PRD 24 RF3). Em Node, o comportamento é o de antes.

- `lib/ambiente`: `variavel(nome)` (o ambiente do processo, que os Workers preenchem com as
  vars e os secrets; na falta, o `import.meta.env`), `ipDoCliente(context)`
  (`context.clientAddress`, ou o `cf-connecting-ip` quando o adaptador não o oferece) e
  `purgaDaCloudflare()`. Todo acesso ao ambiente do lado web passa por ali.
- Middleware: `Vary: Host` em toda resposta que pode ir para cache (GET/HEAD sem
  `no-store`/`private`), inclusive o 301 da barra e o 404 de host desconhecido. A
  negociação de markdown continua com `Vary: Accept`; `Accept-Encoding` deixa de contar
  como `Accept`. Em Node muda só o cabeçalho (o cache em memória já tinha o host na
  chave). Nos Workers, o `Vary: Host` separa as cópias em cache, mas **não** a limpeza
  por tag: as variantes de uma URL dividem a identidade de purge, e as de caminhos que os
  dois tenants têm (`/`, `/blog/`, feed, sitemap, robots) levam `tenant:{slug}`
  diferentes. Limpar `tenant:3d` pode não pegar a variante do `3d`. A saída (tags iguais
  entre variantes ou um Worker por domínio) está pendente no ADR-0014.
- `/api/revalidate`: 429 (com `Retry-After`) quando o purge da Cloudflare recusa pelo
  limite, 503 quando ele falha de outro jeito; nunca 500. Nos Workers a rota purga pelo
  `cache.purge` direto (o provedor do adaptador descarta a recusa); em Node, o cache de
  rota do Astro, como antes.
- `regras-de-url`: `sufixosDeSlug`, `tenantPadrao` e `slugPeloSufixo` recebem o ambiente
  opcional (sem ele, `variavel`); saem `juntaVary` e `respostaCacheavel`.

## 0.1.0 — 2026-09-24

Primeira versão publicada. O código veio do repositório do primeiro site da plataforma, com
o histórico preservado (PRD 17 RF9); muda só o escopo do pacote, sem mudança de
comportamento.
