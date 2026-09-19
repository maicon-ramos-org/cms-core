/**
 * Gêmeo em markdown de /p/{slug} — o `.md` paralelo do checklist agent-readable.
 *
 * Só responde pela coleção `produtos`. O piloto físico serve a mesma URL em HTML mas não
 * publica `.md`, e a página dele não anuncia `<link rel="alternate">` — então não existe
 * link apontando pra cá que caia em 404.
 */
import type { APIRoute } from 'astro'

import { getProdutoBySlug, PRODUTO_MONETIZAVEL, type CupomDTO, type LojaDTO } from '../../lib/cms'

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const slug = context.params.slug ?? ''
  const produto = await getProdutoBySlug(tenant.id, slug)
  if (!produto) return new Response('Produto não encontrado.', { status: 404 })

  const loja: LojaDTO | null = produto.loja && typeof produto.loja === 'object' ? produto.loja : null
  const cupom: CupomDTO | null = produto.cupom && typeof produto.cupom === 'object' ? produto.cupom : null

  if (context.cache.enabled) {
    context.cache.set({
      maxAge: 300,
      swr: 60,
      tags: [`tenant:${tenant.slug}`, `produtos:${produto.id}`, ...(loja ? [`loja:${loja.slug}`] : [])],
    })
  }

  const linhas: string[] = [`# ${produto.titulo}`, '']
  if (loja) linhas.push(`**Loja:** ${loja.nome}`)

  /*
   * A MESMA regra do HTML, porque é o mesmo dado: preço só sai acompanhado do instante em
   * que foi observado. Um agente de IA que leia este arquivo precisa saber a idade do
   * número tanto quanto uma pessoa — mais, até: ele vai repetir o valor como se fosse a
   * resposta atual.
   */
  const precoEmBruto = produto.preco_em ? new Date(produto.preco_em) : null
  const precoEm = precoEmBruto && !Number.isNaN(precoEmBruto.getTime()) ? precoEmBruto : null
  if (typeof produto.preco === 'number' && produto.preco > 0 && precoEm) {
    linhas.push(`**Preço:** ${produto.preco} BRL (observado em ${precoEm.toISOString().slice(0, 10)})`)
  } else {
    linhas.push('**Preço:** não publicado — consulte o valor atual na loja pelo link abaixo.')
  }

  if (cupom) {
    // o CÓDIGO não entra aqui (ADR-0007): este arquivo é lido por agente de IA, e é onde
    // entregar o literal custa mais caro — a resposta sai pronta e a compra acontece fora
    // do link que paga o site. O que o agente precisa saber continua.
    const desconto =
      cupom.desconto_tipo === 'percentual' && cupom.desconto_valor
        ? `${cupom.desconto_valor}%`
        : cupom.desconto_tipo === 'valor' && cupom.desconto_valor
          ? `R$ ${cupom.desconto_valor}`
          : cupom.desconto_tipo === 'frete'
            ? 'frete grátis'
            : 'desconto'
    linhas.push(`**Cupom:** ${desconto} — o código aparece ao abrir a página`)
    if (cupom.verificado_em) linhas.push(`**Verificado em:** ${String(cupom.verificado_em).slice(0, 10)}`)
  }

  if (produto.estado === 'encerrado') {
    linhas.push('**Estado:** oferta encerrada — o produto pode continuar à venda na loja.')
  }
  linhas.push(`**Indexável:** ${produto.indexavel === true ? 'sim' : 'não (página landing, noindex)'}`)

  if (PRODUTO_MONETIZAVEL.has(produto.estado ?? '')) {
    linhas.push('', `**Link:** https://${tenant.canonical_host}/r/p${produto.id}?ref=md`, '')
  }

  return new Response(linhas.join('\n'), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
}
