# Formatos públicos de conteúdo

Estado: contrato para a rota JSON do tema editorial compartilhado. Cada site
mantém seu layout e pode enriquecer a projeção com dados públicos do seu nicho.
O contrato operacional multissite está em `leitura-publica-multisite.md`; o
auditor executável mora em `packages/public-contract/`.

Um artigo publicado deve ter três representações da **mesma URL canônica**:
`/{slug}/` (HTML completo sem JavaScript), `/{slug}.md` (texto legível por
agentes) e `/{slug}.json` (dados tipados). HTML é a página indexável; Markdown e
JSON são alternates, não páginas concorrentes no índice. Os formatos de máquina
respondem `X-Robots-Tag: noindex` e anunciam a canonical no corpo.

O JSON é uma projeção allowlist, nunca a resposta REST do Payload. Campos
comuns v1: `url`, `slug`, `contentType`, `title`, `metaDescription`,
`publishedAt` e `updatedAt`. `contentText`, categoria, tags, autor, FAQ,
relações, claims e ofertas são extensões opcionais por instância, publicadas
somente com campos internos removidos. O `.md` leva o texto integral. Campos de
destino comercial cru, comissão, pesquisas privadas,
segredos e rascunhos nunca saem. Ofertas públicas usam a rota de redirect do
site, não o destino de afiliado.

As três leituras exigem o mesmo tenant e o mesmo estado `published`. 404 não é
armazenado como página pública. Cache de HTML, Markdown e JSON usa as mesmas
tags de conteúdo para invalidar os três após uma alteração. A rota JSON não
exige JS no cliente e só consulta o CMS em cache miss; não cria KV nem copia
o banco na borda.

O contrato v1 cobre artigos e páginas editoriais. Fichas comerciais com URLs
próprias precisam de projeção específica e testes antes de ganhar `.json`;
não se devolve automaticamente todo objeto comercial do Payload.
