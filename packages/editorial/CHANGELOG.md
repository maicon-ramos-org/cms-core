# @maicon-ramos-org/editorial

## 0.2.0-next.1 — 2026-09-25 (pré-lançamento, PRD 24 RF3)

Pré-lançamento na dist-tag `next` (RF4): o `latest` continua em `0.1.0`.

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
- **`editorial({ config: { semTenant: ['/prefixo', …] } })`** (nova, revisão da RF3): prefixos
  de caminho que pulam a resolução de tenant E a regra de barra final — o mesmo bypass que
  `/api/revalidate` e `/healthz` já tinham, generalizado. Resolve o caso do CMS fora do ar:
  sem ela, um endereço antigo de mídia (redirecionado pro bucket, sem tenant) responde 404
  "Tenant não encontrado", e um caminho sem extensão nem barra leva 301 antes de chegar na
  rota que faria o redirect de verdade. Casamento por prefixo (`pathname.startsWith`). Sem
  a opção na config, o comportamento é idêntico ao de hoje. `RegrasDeUrl` ganha
  `precisaPularTenant(pathname)`.
- `respostaCacheavel(metodo, cacheControl, cdnCacheControl?)` ganha um terceiro parâmetro
  opcional: `Cloudflare-CDN-Cache-Control`/`CDN-Cache-Control` (quem chama resolve a
  precedência entre os dois antes de passar um valor só) decidem sozinhos a favor do cache
  quando trazem `public` ou `max-age`, mesmo com `Cache-Control: private` da origem — é a
  instrução que a Cloudflare de fato obedece na borda. Além disso, `private` só desqualifica
  quando vem SEM lista de campos (RFC 9111 §5.2.2.7); `private=set-cookie` deixa o resto da
  resposta guardável (antes, qualquer `private=…` contava como `private` puro).

## 0.1.0 — 2026-09-24

Primeira versão publicada. O código veio do repositório do primeiro site da plataforma, com
o histórico preservado (PRD 17 RF9); muda só o escopo do pacote, sem mudança de
comportamento.
