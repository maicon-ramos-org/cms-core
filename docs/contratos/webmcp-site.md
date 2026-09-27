# WebMCP reutilizável por site

O núcleo fornece duas peças separadas:

- `@maicon-ramos-org/editorial`: o tema padrão já anota os formulários reais de busca,
  refinamento e contato (`toolname`, `tooldescription`, `toolparamdescription`). Temas
  substituídos pelo site precisam manter as anotações nos seus próprios formulários.
- `@maicon-ramos-org/webmcp`: `withWebMcpOriginTrial(response, request, token,
  allowedOrigin)` aplica o header somente a `GET 200 text/html` da origem HTTPS
  indicada. O site lê `token` de um secret do servidor e passa a origem canônica
  da sua configuração; o núcleo não contém token nem domínio de cliente.

Cada site registra **seu próprio token first-party** para WebMCP, sem third-party
matching, e o rotaciona antes do vencimento. Token de outro site ou third-party
não ativa a API via `Origin-Trial` HTTP header. Não enviar o header em staging,
JSON, Markdown, redirects, erros ou domínios adicionais. Para validar, confira
`document.modelContext` e as ferramentas no Chrome com suporte, depois rode o
Lighthouse numa página que tenha formulários reais.

O placar de navegação agêntica é **por página e por auditoria aplicável**, não
uma propriedade do pacote. Uma página sem formulário não precisa ganhar um
formulário fictício. `llms.txt`, árvore acessível e CLS continuam contratos
independentes do origin trial. O manifesto ARD também é independente: só
publicar `/.well-known/ard.json` quando o site tiver um recurso genuíno a
anunciar. O antigo `ai-catalog.json` ainda pode aparecer no Lighthouse, mas
não se cria um catálogo falso para aumentar a fração de testes.

Referências: [WebMCP](https://developer.chrome.com/docs/ai/webmcp),
[pontuação do Lighthouse](https://developer.chrome.com/docs/lighthouse/agentic-browsing/scoring),
[ARD](https://agenticresourcediscovery.org/spec/).
