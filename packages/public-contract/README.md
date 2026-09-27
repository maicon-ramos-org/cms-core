# Contrato público

Audita a superfície pública de um artigo publicado sem conhecer Payload, banco,
Cloudflare ou tema. A mesma URL canônica deve ter HTML completo, `.md` e `.json`.
O pacote nunca segue redirects comerciais, envia autenticação ou escreve dados.

```sh
auditar-publico https://site-um.example/artigo/ https://site-dois.example/artigo/
```

O comando retorna JSON com `ok` e códigos de falha e sai com código 1 se uma página
falhar. Não é substituto do Lighthouse: acessibilidade visual, CLS e WebMCP exigem
um navegador compatível e auditoria própria. Uma URL aprovada aqui não garante
indexação, citação por IA ou nota 6/6.
