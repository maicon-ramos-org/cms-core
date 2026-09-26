# Pautas — máquina pura primeiro, ativação operacional depois

Status: contrato escrito antes do código, P1 implementada em 2026-09-26,
ainda não lançada. Complementa PRD 23 e ADR-0013;
não declara o motor completo pronto. Pacotes continuam fixos: a entrada pura
`cms-core/pautas` pertence ao pacote existente, não cria `packages/pauta`.

## Inventário e decisão de migração

Os 36 registros reais são `content_job`, não posts ou planejamento separado:
14 `candidate/planner` e 22 `recovery/cataloger` por
`missing_required_data → catalog`. Atribuir todo recovery a operator perderia a
semântica da origem. Há 20 review/comprar, quatro comparativo/comparar e 12
receita/resolver; 32 entidades, 36 contratos tenant/entidade/formato e 36 slugs
únicos. Todos têm conteúdo, URL publicada e verificação ausentes; tentativas zero.

As prioridades, razões estruturadas, datas e 36 eventos ficam preservados no
snapshot privado. O PRD 23 exclui a migração de histórico operacional: este
recorte porta comportamento e usa o censo como evidência, sem importar essas
linhas como fila executável. Transferi-las exige decisão explícita que substitua
esse limite; nunca recalcular prioridade, zerar cooldown ou inventar verificação.
O detalhe de recovery do snapshot usa classification/reasons/deficit/offerCount,
enquanto comandos puros exigem mensagem e destino classificados. Snapshot não é
input operacional direto: uma futura transferência precisa adapter e contrato
próprios, sem fabricar diagnóstico ou perder a justificativa original.

## Onda P1: domínio puro sem I/O

Uma entrada exportada fornece estados, papéis, códigos de falha, contrato de
formato e cálculo de transição. Não há banco, relógio global, scheduler, publicação,
requisição externa ou efeito colateral; relógio é entrada explícita. A camada
Payload posterior é responsável por tenant, credencial, locks e persistência.

- Estados fechados da origem: candidate, research, catalog, write, capa, review,
  publish, live_verified, recovery, retired; nove papéis e oito falhas preservados.
- Cada formato configura suas etapas de trabalho em ordem; intenção e slug são
  parte do contrato. Candidate, research, write, capa, review e publish são
  essenciais nesta onda; catalog é opcional. Artigo editorial não precisa catalog. Núcleo não registra
  receita, marketplace ou requisito de quantidade de oferta por conta própria.
- Avançar percorre uma etapa por vez, com estado esperado, papel atual e horário
  elegível. Recovery volta somente à etapa registrada. Pré-condições satisfeitas
  devem ser fornecidas pela camada servidora; resultado puro não atesta artefatos.
- Falha classificada valida diagnóstico e destino: template_error retorna à mesma
  etapa; missing_required_data retorna research/catalog; gate_rejected aceita
  research/catalog/write/capa; render_verification_failed retorna publish/review;
  invalid_offer exige ID de oferta e retorna catalog. Destino deve existir no
  formato, sem inserir catalog em artigo simples. Credencial/política exigem
  operator, data elegível null e intervenção externa explícita. Retired é terminal.
- Papel de recovery não escalado deriva da etapa de retorno, inclusive cataloger;
  contador de tentativas só cresce ao classificar falha, prioridade não é score
  recalculado. Retry padrão cinco minutos, intervalo 0–86400 segundos.
- Não existe transição pública pura que aceite um JSON de cliente para marcar
  live_verified. Essa etapa fica indisponível até o adaptador de verificação
  confiável; publish não significa entregue/publicado corretamente.

P1 testa todas as falhas, passos proibidos, calendário, formatos sem catalog e
recovery/cataloger observado no acervo. Não altera coleção, migration, schema
padrão, import, release ou consumo por instância.

API pura: `registrarFormatoPauta`, `FORMATO_ARTIGO_PAUTA`, `avancarPauta`,
`classificarFalhaPauta` e `falharPauta`; enums e tipos acompanham a entrada.
`ErroPauta.codigo=estado_desatualizado` será mapeado para 409 pelo futuro comando
REST, não é lock implementado agora. Funções retornam somente mudança operacional,
sem copiar prioridade, identidade ou conteúdo. Formatos/enums são congelados;
configuração malformada é recusada mesmo se não passar antes pelo registrador.
O argumento `precondicoes` vem de código servidor confiável: não é endpoint que
aceita um boolean do agente como prova. Reabertura e verificação ficam fora de P1.

## Ondas seguintes, sem fingir implementação

P2 adiciona coleção opt-in com natural keys/imutabilidade, referências de tenant,
origem e auditoria; usuário não pode escrever estado/ator/verification diretamente.
Papel executor deve derivar da credencial, nunca de string autodeclarada. Contrato
de conteúdo ligado compara tenant, entidade, formato, intenção e slug.

P3 adiciona comandos REST com estado esperado, lock e resposta 409 concorrente;
pré-condições são reavaliadas no servidor, usando pesquisa com relógio editorial,
gates reais e políticas de catálogo registradas pelo plugin. Próxima pauta é
leitura, não lease. Duas passagens da reposição precisam ser idempotentes.

P4 acrescenta descoberta em simulação, jobs e verificação confiável da instância.
SSR Cloudflare + PG16 na VPS substitui a premissa antiga de `web:4321` no mesmo
Docker: o transporte autenticado/allowlist do verificador precisa contrato próprio.
Nenhum callback alimentado pelo body do agente pode atestar live_verified.
Saúde/alerta distingue relatório produzido de entrega confirmada ao destinatário.

P2–P4 exigem testes de integração e CI por onda. Não se declara PRD 23 concluído
sem concorrência em Postgres real, revalidação de catálogo, duas simulações sobre
o acervo e verificação ao vivo funcional. Acervo novo permanece draft-first;
ativação de jobs, publicação e cutover continuam decisões explícitas da instância.

## Evidência de P1

- Teste vermelho antes do módulo existir; regressões para enums mutáveis e
  formato malformado também falharam antes da correção.
- 33 testes focados verdes; revisão cruzada read-only comparou o modelo/serviço
  da origem e não encontrou bloqueador no recorte puro. Sugestão de isolamento
  do objeto de diagnóstico foi incorporada e passou.
- `pnpm check` completo: 684 testes Vitest + 47 scripts/travas verdes; seis
  sentinelas condicionais skipped, suites Postgres/MinIO locais executadas.
- `confere:schema` da referência padrão sem diff. Nenhuma coleção, rota,
  migration, pauta importada, job disparado ou estado de produção modificado.
