# Catálogo editorial — proposta para revisão, não implementada

Esta proposta usa o schema atual do plugin `afiliado`, o schema SQL da instância
de origem e os campos consumidos pelos seus templates. Nenhuma mudança de catálogo,
redirect ou migration foi feita nesta onda. A implementação exige revisão deste
contrato; não pressupõe publicação nem alteração automática de sites existentes.

## Recorte recomendado primeiro: registro de categorias

Adicionar opção `afiliado({ catalogo: { categoriasAdicionais } })`. Cada categoria
declara `slug`, `rotulo`, `atributosDeIdentidade` e um validador puro de variante.
O site registra seu vocabulário. Não entram categorias de fitness no núcleo.

As quatro categorias atuais continuam como registro padrão de compatibilidade.
A condição literal `categoria === 'filamento'` sai das funções genéricas de
matching/validação e vira política desse registro. O comportamento antigo deve
permanecer idêntico: mesmos campos obrigatórios, mesma chave de variante, mesmos
resultados de matching, mesma configuração final quando não há novas opções.

O registro define campos que o renderer realmente consome e valida. Não aceita
callbacks de I/O nem cópia opaca do payload do marketplace em `especificacoes`.
Chaves de identidade incluem uma versão para categorias novas; as antigas
preservam o hash já persistido byte a byte. Trocar a política de uma categoria que
tem dados exige migration/revisão explícita, sem recalcular identidade no read.

A configuração padrão deve gerar **zero diff de schema**. Registrar uma categoria
nova gera migration apenas na instância que a registra, com `ADD VALUE` protegido
na enum. Remover/renomear categoria com registros não é operação desta entrega.

Aceite: fixtures antigas de identidade/matching iguais, categoria injetada passa,
categoria não registrada retorna 400 com path, dois tenants não se misturam e o
schema da referência padrão não muda. Este é o próximo PR factível e independente.

## O mapeamento de ofertas precisa de identidade antes de importar

A coleção atual `ofertas` descreve cupom/crédito/lifetime/desconto API e exige loja,
tipo e corpo editorial. Não é equivalente a todo `offer` legado. O catálogo físico
separa produto, variante e listing, e hoje exige marca/modelo confirmados. Um nome
de oferta ou um link de busca não fornece esses fatos.

| Dado de origem | Destino proposto | Condição/limite |
| --- | --- | --- |
| produto físico com identidade suficiente | produtos_fisicos + variantes_produto | categoria registrada, marca/modelo e atributos documentados; não inferir pelo título |
| listing exato com loja e variante conhecidas | ofertas_produto | origem estável, external_listing_id, URL de produto e vínculo corretos |
| oferta que já é cupom/crédito/lifetime | ofertas atual | mapeamento sem mudar os tipos existentes |
| mirror exato | relação entre listings | mesma identidade física verificada; não criar produto duplicado |
| mirror equivalente | relação editorial entre listings distintos | não unir produtos diferentes só porque substituem um ao outro |
| mirror de busca ou identidade insuficiente | bloqueio explícito no planner | não fingir que busca é variante ou listing confirmado |

Há dois caminhos para os casos bloqueados: obter a identidade real antes do import
ou especificar uma coleção de ofertas editoriais desacoplada de catálogo físico.
Esta proposta recomenda o primeiro recorte acima e **não cria essa nova coleção
implicitamente**. Decidir o segundo caminho muda o contrato de render/redirect e
precisa de revisão própria. A quantidade de cada caso deve vir do dump, não de
palpite, antes de prometer a paridade do acervo.

## Extensão posterior: campos tipados usados por render e gates

Depois de resolver a identidade, adicionar campos opt-in ao plugin:

- `produtos_fisicos.nome_exibicao`, `especificacoes_editoriais[] {rotulo,valor}`,
  `pros_contras[] {tipo:pro|con,texto}`, `analise_md`, `imagem_externa {url,alt}`.
  Foto comercial externa mantém sua proveniência e contrato; não substitui capa
  editorial própria. A imagem atual em `midia` permanece utilizável.
- `ofertas_produto.origem` imutável e unique por tenant;
  `espelho_de` + `tipo_correspondencia` (`exato|equivalente`); relação sem ciclos,
  no mesmo tenant e sem fundir identidade física. `network` vira programa da loja.
- `ofertas_produto.entidades[] {entidade,prioridade}`; o servidor valida tenant e
  deduplica entidade. Prioridade comercial não é score de popularidade.
- `ultima_verificacao {verificado_em,link_ativo,preco_visto,disponivel,nota}` com
  resultado sanitizado e proveniência de job. Preço com timestamp, null preservado.
- Preço desconhecido e oferta pausada/quebrada precisam de representação própria:
  hoje `preco` é obrigatório e `estado` só draft/ativa/encerrada. Não converter
  preço ausente em zero nem colapsar as duas causas em encerrada sem registrar.

Comissão estimada/taxa, payload cru e URL de afiliado são internos, com acesso de
campo restrito a `sistema`/`super-admin`. DTOs públicos usam allowlist e redirect.
O read da Local API de um processo confiável não pode ser confundido com resposta
pública: endpoints de agente devem usar acesso explícito e serialização própria.

Nenhum desses campos é suficiente sozinho: cada um entra com seu consumidor DTO,
fixture de render e gate. Armazenar specs/pros/cons sem o template ler não é paridade.

## Picks e formatos

O plugin acrescenta `posts.escolhas[] {oferta,papel,posicao}`. A proposta é
`oferta` polimórfica para `ofertas|ofertas_produto`, preservando a distinção de
coleções; o serializer produz o mesmo DTO de decisão sem expor destino cru.
`papel` é vocabulário do tenant, sem marca no plugin; `posicao` é inteiro positivo.
Papel único por post e referências no mesmo tenant são validados em toda escrita.
A lista renderizada, os gates e o JSON público recebem o mesmo resultado do
resolvedor de escolhas: uma oferta espelhada não aumenta a contagem de produtos
canônicos. O gate comparativo exige ao menos três escolhas elegíveis distintas.

`comparativo` e `review` registram seus validadores pelo contrato `FormatoEditorial`
do grafo. Falha de listing leva a revisão; não apaga a escolha nem reescreve a
prosa automaticamente. O job de verificação e a regra de data de atualização
material permanecem etapas explícitas, separadas do updatedAt técnico.

`receita` pertence ao plugin da instância, sem novo pacote de nicho no core. Seu
campo é validado e tipado, com ingredientes/instruções, tempos em minutos, porções,
calorias, proteína e keywords. O mesmo objeto fornece HTML visível e Recipe no
pacote `schema` existente. Não duplicar a receita em pontuacao nem extraí-la da
prosa. Datas preservam `published_at → publicado_em` e
`content_modified_at → atualizado_em`; o timestamp técnico do import não vira
frescor editorial.

## Redirects e sinais são parte da paridade

O plugin já tem `/r/f{id}` para listing físico, mas o resolvedor atual aceita
somente o programa suportado pelo catálogo inicial. Não basta mapear o banco:
precisa registro de resolvedores por programa e fixtures que provem o destino
sem redirecionar para URL arbitrária. `/r/{c|p|o}{id}` atual permanece válido.

A rota legada `/ofertas/{slug}/` vira alias do resolvedor seguro, com status 302,
`no-store`, sem prefetch e sem seguir redirecionamentos em warm/cache. `from/src`
exigem mapeamento explícito para os sinais, preservando a oferta canônica e a loja
que recebeu o clique. O ramo físico atual não registra o mesmo clique que os
ramos c/p/o; a nova onda precisa dessa prova antes de declarar paridade.

## Ordem de execução depois da revisão

1. Registro de categorias, sem mudança na configuração padrão e com testes antigos.
2. Censo do dump por identidade suficiente/exato/equivalente/busca/sem preço.
3. Decisão de destino para casos sem identidade; contrato de campos e migrations.
4. DTO único de ofertas/escolhas + resolvedores/redirects + snapshots de render.
5. Receita na instância e comparação HTML/JSON/Schema das URLs reais.
6. Só então import completo em banco local, duas execuções idempotentes e relatório.

O motor de pauta do PRD23 segue fora desse recorte; gates e registro de formatos
não equivalem a jobs, locks concorrentes ou publicação verificada.
