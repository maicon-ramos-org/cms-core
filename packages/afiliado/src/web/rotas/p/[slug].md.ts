/**
 * Gêmeo em markdown de /p/{slug} — o `.md` paralelo do checklist agent-readable.
 *
 * Mesma precedência da página HTML: primeiro o piloto físico, depois o produto legado.
 * O piloto não tem preço confiável e só anuncia links diretos Amazon válidos.
 */
import type { APIRoute } from 'astro'

import { fichaDoCatalogo, getCatalogoProduto } from '../../lib/catalogo'
import { getProdutoBySlug, PRODUTO_MONETIZAVEL, type CupomDTO, type LojaDTO } from '../../lib/cms'
import { produtoFisicoPublicoJson } from '../../lib/publico-json'
import { fichaMarkdown } from '../../../conteudo'

const validSlug = (slug: string) => slug.length <= 200 && /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(slug)
export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const slug = context.params.slug ?? ''
  if (!validSlug(slug)) return new Response('Produto não encontrado.', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const catalogo = await getCatalogoProduto(tenant.id, slug)
  if (catalogo) {
    const ficha = fichaDoCatalogo(catalogo, tenant.id)
    const body = produtoFisicoPublicoJson(tenant, catalogo.produto, catalogo.ofertas, ficha)
    if (!ficha || !body) return new Response('Produto não encontrado.', { status: 404, headers: { 'Cache-Control': 'no-store' } })
    if (context.cache?.enabled) context.cache.set({ maxAge: 60, swr: 0,
      tags: [`tenant:${tenant.slug}`, `produtos_fisicos:${catalogo.produto.id}`] })
    const linhas = [fichaMarkdown(ficha).trimEnd(), '',
      '**Preço:** não publicado — consulte a loja pelo link abaixo.']
    for (const oferta of body.offers) linhas.push('', `**Link:** ${oferta.href}`)
    return new Response(`${linhas.join('\n')}\n`, { headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'X-Robots-Tag': 'noindex', Link: `<${body.url}>; rel="canonical"`,
    } })
  }
  const produto = await getProdutoBySlug(tenant.id, slug)
  if (!produto) return new Response('Produto não encontrado.', { status: 404, headers: { 'Cache-Control': 'no-store' } })

  const loja: LojaDTO | null = produto.loja && typeof produto.loja === 'object' ? produto.loja : null
  const cupom: CupomDTO | null = produto.cupom && typeof produto.cupom === 'object' ? produto.cupom : null

  if (context.cache?.enabled) {
    context.cache.set({
      maxAge: 300,
      swr: 60,
      tags: [`tenant:${tenant.slug}`, `produtos:${produto.id}`, ...(loja ? [`loja:${loja.slug}`] : []),
        ...(cupom ? [`cupons:${cupom.id}`] : [])],
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

  if (cupom && ['publicado', 'expirando'].includes(cupom.estado)) {
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
    headers: { 'content-type': 'text/markdown; charset=utf-8', 'X-Robots-Tag': 'noindex',
      Link: `<https://${tenant.canonical_host}/p/${encodeURIComponent(produto.slug)}/>; rel="canonical"` },
  })
}
