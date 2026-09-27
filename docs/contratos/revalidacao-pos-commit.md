# Revalidação de cache depois do commit

Estado: implementação em validação; não configurar o webhook de uma instância nova
até o teste de integração confirmar a ordem no seu adapter.

O Payload 3.88 executa `afterOperation` antes de `db.commitTransaction`. Portanto,
mandar o purge diretamente desse hook pode permitir que o site recarregue do banco
o documento anterior e guarde a cópia antiga por todo o TTL.

O núcleo continua a acumular as tags por operação em `afterChange`/`afterDelete` e
fecha o lote em `afterOperation`. Quando há transação, registra o lote pelo ID dela
e observa o `commitTransaction` do adapter: só depois de o commit resolver com
sucesso é que envia o webhook em segundo plano. Rollback descarta o lote. Sem
transação (ou num hook isolado sem adapter), mantém o envio direto. Essa observação
é por instância do adapter, não por variável global de request, e deve preservar
escritas concorrentes e aninhadas. O webhook só é ativado com `REVALIDATE_URL`;
falha de rede nunca desfaz a gravação.

Limite operacional: os lotes de até 100 tags seguem sem fila durável. Um volume
extraordinário de purges que exceda a cota da Cloudflare pode receber 429; o
núcleo registra warning e o cache converge pelo TTL normal. Não usar este
webhook como garantia de publicação instantânea em importação massiva: durante
import, deixar `REVALIDATE_URL` vazio e executar a purga controlada ao final.

Critérios: teste unitário força um commit pendente e prova ausência de POST antes
dele; rollback não envia; teste com Postgres real confirma que a conexão do site
já vê o valor novo ao receber a notificação. Não ativar `REVALIDATE_URL`/token
em Alma ou outro site novo antes dessas provas e do deploy do pacote.
