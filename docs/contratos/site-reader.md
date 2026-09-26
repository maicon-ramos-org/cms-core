# Site reader: identidade mínima e transporte fechado (opt-in, não lançado)

Recorte aprovado: papel exclusivo `site-reader`, vinculado a exatamente um tenant,
para um consumidor SSR. A ativação é explícita: `cmsCore({ siteReader: true })`.
Sem a opção, comportamento e schema permanecem iguais. Esta PR não ativa sites,
não provisiona credenciais e não publica pacotes automaticamente.

## Duas barreiras obrigatórias

1. A fábrica restringe o principal antes das ACLs existentes, depois dos plugins
   e da sanitização do Payload. Coleções, globais, versões, endpoints, jobs e admin
   ficam indisponíveis para reader. A presença do papel é restritiva inclusive
   quando um documento inválido mistura reader e super-admin.
2. O consumidor instala a proteção no **Request original**, antes de chamar os
   handlers Next/Payload, e antes de RootLayout/handleServerFunctions. ACL sozinha
   não cobre method-override, GraphQL, custom views ou server actions.

O Payload 3.88 transforma POST com `X-HTTP-Method-Override: GET` ou
`X-Payload-HTTP-Method-Override: GET` antes de criar/autenticar o PayloadRequest.
O guard rejeita override na rota privada antes de ler o corpo. A defesa no endpoint
repete a rejeição dos headers que o Payload conserva.

Para não-readers, a função ACL original recebe os mesmos argumentos e sua
resposta/filtro é preservada. Na config sanitizada, CRUD/unlock, globais read/update
e jobs já têm defaults; o multi-tenant também fornece readVersions de coleções.
admin e readVersions de globais podem faltar: o fallback nativo do Payload 3.88 é
`Boolean(req.user)`, preservado pelo wrapper. Mídia pública continua anônima;
jobs sem ACL custom continuam exigindo usuário autenticado.

## Principal e identidade

- Papéis exatamente `['site-reader']`; um único vínculo de tenant, sem duplicata.
- API key própria do serviço/site; autenticação nativa `api-key`, nunca chave
  compartilhada com editor, agente ou sistema. Sem login/sessão/admin.
- Reader não escreve nenhum usuário, nem a si próprio. Provisionamento/rotação
  continuam administrativos. Create/PATCH inválidos têm path `roles`/`tenants`.
- O campo roles deve ser select hasMany required, visível, não localizado e não
  virtual. Config opt-in incompatível falha na montagem. Usuário autenticado da
  coleção users sem array de papéis não vazio/bem formado é negado antes de
  delegação, inclusive se um afterRead apagar o discriminador. Hooks que deliberadamente
  troquem papéis/tenant por outros privilégios continuam código confiável da aplicação
  e não podem alterar esses fatos de autorização; o núcleo não é sandbox de plugins.
- `GET /api/editorial/identity-v1` retorna somente
  `{ versao: 1, papel: 'site-reader', tenantId: '<id>' }`.
- Sem autenticação: 401. Principal incompatível: 403. Query não contratada: 400.
  Método não GET/header de override na identidade: 405. Headers de resposta:
  `Cache-Control: private, no-store`, `Vary: Authorization`; nenhum token/cookie.
- `/users/me` permanece 403. Não há exceção de Users.read. A estratégia API key
  autentica internamente com overrideAccess, sem conceder leitura ao portador.
- Nenhuma wildcard `/editorial/*`; futuros endpoints exigem contrato e entrada
  literal. Não há endpoint de conteúdo/render nesta primeira entrega.

## Integração explícita do consumidor

Entrada pública `@maicon-ramos-org/cms-core/site-reader`:
`protegerTransporteSiteReader({ config, handler, superficie })`, onde superficie é
`rest`, `graphql` ou `graphql-playground`. O handler conserva seus argumentos Next.
O helper `leitorNoPreflightSiteReader({ config, headers })` também protege o layout
admin antes de RootLayout, a página antes de RootPage, generatePageMetadata e a
serverFunction antes de handleServerFunctions. Nesses canais Next, reader recebe
404/erro fechado e a serverFunction da aplicação não executa; não se promete HTTP
403 uniforme em RSC. Há uma exceção nativa limitada descrita abaixo.

Todos os verbos REST, GraphQL/playground, layout, página, metadata e serverFunction devem ser integrados
**antes** da ativação. O caminho efetivo Next (`params.slug`) também é conferido,
sem confiar só em request.url quando houver rewrite. Os arquivos de integração são
mantidos pelo consumidor; sua regeneração deve ser detectada por teste de regressão.
Nesta PR somente `apps/referencia-cms` recebe integração, habilitada em fixture CI.
Alma e Runzos não são alterados.

O cliente preparatório atual de Alma usa `/api/users/me` e papel `sistema` para
provar identidade. Ele **não é compatível automaticamente** com este contrato:
deve migrar para `/api/editorial/identity-v1`, validar o DTO/tenant esperado e usar
credencial própria com papel exclusivamente `site-reader`, depois de instalar
todos os wrappers. Nenhuma rota de conteúdo/render-v1 está disponível nesta PR.

Preflight usa o export público `executeAuthStrategies`, sem getAccessResults, cache
global de principal ou chave. Requisições sem Authorization/cookie de autenticação
não acrescentam lookup nem inicialização Payload pelo guard. Credenciais presentes
acrescentam autenticação ao delegar para handlers não-reader. Medição PG16: 0 leituras
Users para anônimo, 1 para identidade reader direta, 2 para editor delegado ao REST.
Esse é custo no MISS, não melhoria de TTFB. Um futuro render-v1 precisará medir/reusar
autenticação de forma explícita. Não se injeta req.user para contornar auth original.

A ativação rejeita com erro de configuração auth strategies custom em **qualquer**
coleção e autoLogin ativo (prefillOnly é permitido). Sem conhecer os headers/cookies
que autenticam, não se pode preservar o caminho anônimo sem lookup. A opção desligada
mantém essas configurações intactas. Cookie nativo é reconhecido mesmo com espaços
antes do `=` e com cookiePrefix vazio/custom, como o parser nativo. Credencial
apresentada mas não autenticada recebe 401; não se delega
para uma segunda tentativa potencialmente divergente. No admin, esse caso também
falha fechado, como reader, antes de executar página/action.

### Exceção nativa de idioma no Next

Payload 3.88 gera `switchLanguageServerAction` dentro de RootLayout, separadamente
da serverFunction protegida da aplicação. Ela é entregue também no login anônimo
e não exige autenticação: somente chama `next/headers.cookies().set` do cookie de
idioma, sem Payload, CRUD ou dados. Next pode executar essa action antes de renderizar
o layout; portanto o guard de layout não a bloqueia. Não se promete bloquear toda
action nativa nem toda alteração de cookie. Esta exceção não concede privilégios
de reader e foi aceita somente com esse corpo estrito.

A prova do Worker verifica que os manifests de Next e OpenNext contêm exatamente
as duas actions conhecidas e que o corpo upstream/import de cookies permanece
idêntico. Uma action nova ou mudança nesse corpo falha e exige revisão explícita.
O manifesto completo, sua encryptionKey, o HTML/Flight e argumentos vinculados
não são impressos. A prova HTTP de `slugify` verifica o dispatch real da ação da
aplicação: administrador 200 com resultado, reader 404 sem executá-la.

## Schema, afiliado e limites

A referência usa `public.enum_users_roles`, coluna value da tabela users_roles.
Ativar reader adiciona o valor ao enum, por migration da instância, revisada antes
de uso. Sem ativação, a migration/schema gerados devem ser byte-idênticos. Esta PR
não cria migration em nenhuma instância real. Downgrade exige revogar readers antes;
não se remove enum/usuários automaticamente.

A proteção final cobre coleções acrescentadas por afiliado/grafo/plugins, inclusive
ACLs públicas e authenticated: drafts, versões, verificações e auditoria continuam
negados. URL afiliada/comissões/tracking exigem fluxo/credencial separada, não reader.
Blobs que já são públicos na CDN continuam públicos anonimamente.

Local API `overrideAccess: true` continua código privilegiado da aplicação; não é
sandbox. Futuro endpoint de render precisa tenant/publicação explícitos e DTO fechado,
sem espalhar queries recebidas para Local API. Esta entrega não publica conteúdo.

## Evidências verificadas antes da PR

1. Spike da política sobre config realmente sanitizada, com plugins e jobs: nenhum
   endpoint/ACL reader executa a permissão/handler original.
2. Request original em REST/GraphQL/Next: override e path efetivo, zero lookup anônimo,
   autenticação real PG16, revogação observável sem cache, nenhuma chave em saída.
3. Matriz completa: papéis mistos/tenant inválido, autoalteração, Users/me/queries,
   CRUD/count/versions/restore, jobs GET sem efeitos, GraphQL/admin/server actions,
   core + afiliado + grafo, Node/PG16 e OpenNext/workerd.
4. Schema default idêntico, enum opt-in único delta, typecheck e `pnpm check` verdes.

- `pnpm check`: 1.021 testes Vitest e 48 travas Node verdes; 11 sentinelas exclusivas
  de CI puladas localmente. Inclui typecheck de todo o monorepo.
- Node/PG16: 19 testes do reader com API key real sintética, core+grafo+afiliado,
  ACL final, versões, papéis mistos, tenant inválido, login/autoalteração recusados,
  jobs GET sem efeitos e revogação no request seguinte. Sessão JWT existente após
  reclassificação e afterRead que remove roles também são negados.
- Referência Next: 35 testes verdes, incluindo wrappers reais de todos os verbos,
  página/metadata/layout/serverFunction e smoke dos handlers REST nativos.
- Build OpenNext e Worker/workerd+PG16: 23 testes verdes (uma sentinela CI pulada),
  concorrência cold20/warm20, identidade,
  REST/GraphQL/admin, override, revogação e Server Action HTTP real. Somente fixtures
  em banco loopback descartável; nenhum acesso a instâncias reais.
- `pnpm confere:schema` verde. Quatro configurações geradas comprovam schema
  default byte-idêntico e adição somente do valor do enum no opt-in.
- Revisão independente de segurança corrigiu e revalidou cookiePrefix vazio e
  discriminação ausente de roles. Permanecem os limites explícitos de hooks
  confiáveis, Local API privilegiada e action nativa de idioma.

CI do head da PR é o gate seguinte; estes resultados locais não o substituem.
Não houve provisionamento de credencial real, migration de instância, mudança de
pins, ativação de consumidor, publicação de pacote ou deploy. O desempenho SSR
frio e o futuro contrato de render continuam fora desta entrega.
