# Layout público da ficha de produto físico

## Objetivo e escopo

Completar a apresentação da rota existente `/p/{slug}` no plugin afiliado,
consumindo `FichaMonetizavelDTO`. É acabamento do render SSR do catálogo físico
(PRDs 08 e 16 do consumidor), não fusão de collections ou nova política comercial.

Referências visuais fornecidas pelo dono: páginas de produto do Compronomia,
JáCotei e Zoom. Aproveitar a hierarquia foto → identidade → opções de compra →
conteúdo, sem copiar marca, conteúdo, imagens ou funcionalidades desses sites.

## Contrato de apresentação

- Topo com imagem existente, nome, marca/modelo, categoria e resumo.
- Sem imagem cadastrada, exibir estado neutro explícito; nunca buscar ou inventar foto.
- Bloco `Onde comprar` antes da análise, com um cartão por listing autorizado,
  loja real, variante e CTA. O destino aprovado é preservado sem mudar tracking.
- Preço/moeda/data e disponibilidade só aparecem quando já autorizados no DTO.
  O piloto Amazon continua sem expor preço/estoque; a nova apresentação não muda isso.
- Conteúdo editorial abaixo: destaques, análise, especificações públicas, prós/contras
  e FAQ, apenas quando preenchidos. Não usar o JSON de identidade como ficha técnica.
- Um H1 e um landmark principal; headings da descrição são subordinados ao título
  visual sem modificar o conteúdo salvo nem os formatos Markdown/JSON.
- Layout mobile sem rolagem horizontal, alvos de toque de pelo menos 44px,
  foco visível, tema claro/escuro e cores/fontes do tenant.
- Renderizar tudo no HTML inicial. Não adicionar hidratação, imagens de marca
  hardcoded, consulta externa de preços ou consulta CMS por cartão.
- O componente de compra é reutilizável por outros layouts a partir do mesmo DTO.

## Fora de escopo

Cadastro de fotos/lojas/conteúdo pelo publicador; ativação de novos programas
comerciais; cashback, avaliações, favoritos, alertas, gráfico de preço e scraping.
Não alterar coleções, migrations, API de escrita, aprovação editorial ou URLs.

## Critérios de aceite

- [x] Foto existente, estado sem foto e resumo no topo.
- [x] Compra antes do texto longo; múltiplos listings/variantes sem duplicar ficha.
- [x] Nome/CTA de cada loja vêm da monetização, não são fixos no template.
- [x] URLs e parâmetros comerciais preservados; prefetch comercial desabilitado.
- [x] Sem preço/estoque/cupom literal inventado ou vazado no HTML.
- [x] Ficha técnica pública, prós/contras e FAQ preservados.
- [x] Sem foto, oferta ou editorial: página continua útil, sem seções vazias inventadas.
- [x] Tenant/drafts, Markdown/JSON/JSON-LD e fallback legado continuam compatíveis.
- [x] Testes focados, pacote/typecheck/check e inspeção visual desktop/mobile.

## Validação local — 2026-10-05

- HTML/lojas/catalogo: 31 testes aprovados; pacote completo no `pnpm check`:
  338 testes aprovados, 19 condicionais sem execução (fixtures dependentes de
  storage local ou guardas de ambiente). Sem conectar o storage de produção.
- Integração focada: 10 testes aprovados com Payload e PostgreSQL 17 local
  descartável; a guarda de ausência de banco no CI não se aplica ao ambiente local.
- `pnpm check`: aprovado, incluindo typechecks, guardas, testes do monorepo
  e `astro check` do consumidor de referência (zero erros/avisos).
- `pnpm pack`: componente novo e documentação presentes no tarball; nenhum
  teste, configuração local ou segredo incluído. Versão ainda não publicada:
  `0.2.0-next.23`, já reservada no main; esta mudança não reutiliza versão publicada.
- Inspeção de navegador: desktop 1440px, mobile 390px, claro/escuro, sem overflow;
  CTA com 44px de altura, um H1/main, links comerciais preservados.
- Preview local adicional com os readers e dados reais do CMS, somente GET:
  loja/variante/URL reconhecidas, foto ausente explicitada. Sem gravação no Payload,
  alterações de conteúdo, release ou deploy; layout externo isolado para inspeção.

## Adoção

Publicar uma versão nova do plugin após revisão. Cada consumidor faz bump explícito,
smoke e regeneração/invalidação dos snapshots HTML; merge no núcleo não muda
automaticamente o site publicado nem o HTML já materializado no R2.
