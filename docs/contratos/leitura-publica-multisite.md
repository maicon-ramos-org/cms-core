# Leitura pública multissite — contrato v1

Este contrato é do **resultado público**, não de um banco, tema Astro ou forma única
de consultar o Payload. A instância pode usar `render-v1` privado, REST interna ou
outro adaptador; o visitante e o agente devem receber os mesmos invariantes.

## Fronteira CMS → site

1. O leitor do site tem credencial própria, diferente da credencial do publicador.
   Quando `site-reader` estiver ativado, ela fica vinculada a um tenant e não tem
   acesso à REST genérica. Um adaptador legado que ainda usa REST deve filtrar por
   tenant e `_status=published` nas consultas, não confiar só no slug ou no host.
2. O CMS entrega ao renderer apenas material publicado do tenant solicitado. Um
   documento ausente, draft ou de outro tenant não vira 200. A projeção pública
   usa allowlist; nunca repassa a resposta REST bruta, chaves, histórico de revisão,
   comissão, destino afiliado cru ou código de cupom.
3. Erro/timeout do CMS não vira 404 cacheável. Respostas privadas usam `no-store`;
   o cache do site guarda somente representações públicas válidas. Quando houver
   revalidação, HTML, Markdown e JSON da mesma publicação devem ser invalidados
   juntos. O transporte interno pode ser Service Binding sem mudar este contrato.
4. A responsabilidade do CMS é estrutura, estado e autorização. Pesquisa, checagem
   de fontes, revisão e decisão de publicar ficam no pipeline editorial externo.

## Fronteira site → navegador/agente

- `/{slug}/` é HTML completo e canônico sem depender de JavaScript. `.md` contém
  o texto legível; `.json` é uma ficha pública tipada. As duas variantes anunciam
  `X-Robots-Tag: noindex` e `Link: <HTML>; rel="canonical"`.
- O HTML anuncia ambas com `rel=alternate`, tem H1, `<main>` e dados estruturados
  coerentes com o conteúdo visível. O JSON comum contém `url`, `slug`,
  `contentType` e `title`; campos de nicho são extensões opcionais.
- `llms.txt`, sitemap e índice de busca ajudam a descobrir páginas, mas não são
  garantia de indexação/citação. WebMCP é progressivo: ferramentas somente de
  leitura expõem dados já públicos, e o HTML funciona sem navegador compatível.
- Rotas de saída comercial exigem ação afirmativa. `prefetch`/`prerender` retorna
  204 antes de lookup ou sinal; GET comum conserva o redirect, `no-store` e a
  atribuição existente. Nunca seguir a rota de saída num teste de leitura.

## Paridade verificável

O pacote `@maicon-ramos-org/public-contract` executa o mesmo auditor sobre uma
URL publicada de cada instância. Ele faz somente GET em HTML, Markdown, JSON e
`llms.txt`; rejeita URLs comerciais, não envia credenciais e retorna apenas
códigos de falha. A amostra deve incluir ao menos um artigo de cada template
editorial de cada site; uma amostra aprovada não certifica o acervo inteiro nem
substitui um teste de acessibilidade/CLS no navegador.

Os testes de unidade do pacote cobrem sucesso, 404, divergência de canonical,
alternate ausente, noindex, MIME, projeção e limite de corpo. Cada site mantém
seus testes de integração de CMS, cache e clique. O mesmo contrato não obriga
os dois a terem a mesma URL comercial, base de dados ou tema.
