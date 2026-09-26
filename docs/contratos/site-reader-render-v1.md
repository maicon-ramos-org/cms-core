# Render privado v1 para site-reader

O núcleo oferece um transporte opt-in para entregar uma página editorial completa
ao servidor do site, sem expor coleções REST ao leitor. Ativar com
`cmsCore({ siteReader: { renderV1: projetor } })` **não** provisiona credenciais,
publica conteúdo, migra schema ou altera os sites. Os guards HTTP originais,
admin e server actions descritos em `site-reader.md` continuam obrigatórios.

## Requisição e resposta

- `GET /api/editorial/render-v1?slug=<slug>` com API key exclusiva do papel
  `site-reader` e exatamente um tenant. O caminho `/api` acompanha
  `config.routes.api`. O cliente deve chamar apenas do servidor, nunca do browser.
- O slug é minúsculo, alfanumérico com hífens, até 200 caracteres. Nenhum outro
  parâmetro de consulta, duplicata, método ou method-override é aceito.
- Sucesso: `{ "versao": 1, "tenantId": "...", "slug": "...", "revisao": "...", "dados": { ... } }`.
  `revisao` é identificador estável de até 128 caracteres ASCII seguros, escolhido
  pela instância. `dados` é DTO próprio do site, não documento Payload bruto.
- Sem credencial 401, principal incompatível 403, consulta inválida 400, método
  inválido 405, página ausente/rascunho 404. Erro interno ou DTO inválido 503
  genérico, sem corpo de exceção. Respostas 200/404/503 têm
  `Cache-Control: private, no-store`, `Vary: Authorization` e `nosniff`.
- O núcleo aceita apenas JSON estrito, sem getter, `toJSON`, função, data nativa,
  campo oculto, símbolo, array esparso, ciclo ou profundidade maior que 32.
  A resposta serializada não pode exceder 2 MB. A chave nunca aparece na resposta.

## Obrigação do projetor da instância

O callback recebe `{ payload, tenantId, slug }` **após uma autenticação** no
Request original. Só há lookup do leitor quando uma credencial é apresentada.
Ele deve buscar por `tenantId`, slug e estado publicado; página inexistente ou
rascunho retorna `null`. Toda relação (post, oferta, produto, cupom, fonte,
verificação) deve ser checada no mesmo tenant e filtrada para publicação antes
da projeção. Use allowlist campo a campo para SEO, GEO, dados estruturados,
atribuição e monetização; não repasse `doc` inteiro, segredos, rascunhos ou
identidades de usuários. O projetor é código confiável da aplicação e pode usar
Local API; o núcleo não consegue inferir a semântica de publicação de cada site.

O consumidor deve validar `versao`, `tenantId` esperado e formato de `dados`,
e aplicar cache **somente à página pública já renderizada**, sem chave ou
resposta privada do CMS. Revalidar/purgar cache público após publicação é
responsabilidade do site. Nada aqui garante TTFB ou número de queries do
projetor: medir o caso real antes do cutover. A integração do Alma requer
projetor fechado e substituição do cliente legado `/users/me`; não está
automaticamente pronta por instalar esta rota.
