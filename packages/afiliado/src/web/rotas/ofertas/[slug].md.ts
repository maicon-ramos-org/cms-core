/**
 * Gêmeo em markdown de /ofertas/{slug} — o `.md` paralelo do checklist agent-readable.
 * Mesmo dado da página HTML, sem layout: é o que um agente/crawler de IA prefere ler.
 */
import type { APIRoute } from 'astro'

import { caminhoDaOferta, getOfertaBySlug, urlMidia } from '../../lib/cms'
import { fichaDaOfertaPublica } from '../../lib/oferta-ficha'
import { ofertaPublicaJson } from '../../lib/publico-json'
import { ehLinkDeAfiliado } from '../../lib/links-de-afiliado'

const validSlug = (slug: string) => slug.length <= 200 && /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(slug)

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const slug = context.params.slug ?? ''
  if (!validSlug(slug)) return new Response('Oferta não encontrada.', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const oferta = await getOfertaBySlug(tenant.id, slug)
  if (!oferta) return new Response('Oferta não encontrada.', { status: 404, headers: { 'Cache-Control': 'no-store' } })

  const ficha = fichaDaOfertaPublica(oferta, tenant, { resolveMidia: urlMidia, ehLinkDeAfiliado })
  const publico = ofertaPublicaJson(tenant, oferta, caminhoDaOferta(oferta), ficha)
  if (!ficha || !publico) return new Response('Oferta não encontrada.', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const loja = ficha.monetization.listings[0]?.seller
  const cupom = ficha.monetization.listings[0]?.coupon

  if (context.cache?.enabled) {
    context.cache.set({
      maxAge: 300,
      swr: 60,
      tags: [`tenant:${tenant.slug}`, `ofertas:${oferta.id}`, ...(loja ? [`loja:${loja.slug}`] : []),
        ...(cupom ? [`cupons:${cupom.id}`] : [])],
    })
  }

  const linhas: string[] = [`# ${ficha.editorial.name}`, '']
  if (publico.store?.name) linhas.push(`**Loja:** ${publico.store.name}`)
  if (publico.offerType) linhas.push(`**Tipo:** ${publico.offerType}`)
  if (publico.price) {
    const ciclo = publico.price.billingCycle === 'mensal' ? '/mês' : ''
    linhas.push(`**Preço:** ${publico.price.value} ${publico.price.currency}${ciclo} (observado em ${publico.price.observedAt.slice(0, 10)})`)
  }
  if (publico.coupon) {
    /*
     * O CÓDIGO NÃO ENTRA AQUI (ADR-0007). Este arquivo existe pra ser lido por agente de
     * IA — é o lugar onde entregar o literal do cupom custa mais caro, porque a resposta
     * sai pronta e a pessoa vai à loja sem passar pelo link que paga o site. O que o
     * agente precisa saber continua: existe cupom, qual o desconto, quando foi conferido,
     * e por onde resgatar.
     */
    const desconto =
      publico.coupon.discount?.type === 'percentual' && publico.coupon.discount.value
        ? `${publico.coupon.discount.value}%`
        : publico.coupon.discount?.type === 'valor' && publico.coupon.discount.value
          ? `R$ ${publico.coupon.discount.value}`
          : publico.coupon.discount?.type === 'frete'
            ? 'frete grátis'
            : 'desconto'
    linhas.push(`**Cupom:** ${desconto} — o código aparece ao abrir a oferta`)
    if (publico.coupon.conditions) linhas.push(`**Condições:** ${publico.coupon.conditions}`)
    if (publico.coupon.discount?.checkedAt) linhas.push(`**Verificado em:** ${publico.coupon.discount.checkedAt.slice(0, 10)}`)
  }
  if (publico.action) linhas.push('', `**Link:** https://${tenant.canonical_host}${publico.action.href.replace('ref=json', 'ref=md')}`, '')
  if (ficha.editorial.content.descriptionMarkdown) linhas.push(ficha.editorial.content.descriptionMarkdown)
  if (ficha.editorial.prosCons.length) linhas.push('', '## Prós e contras', '',
    ...ficha.editorial.prosCons.map(item => `- ${item.kind === 'pro' ? 'Pró' : 'Contra'}: ${item.text}`))

  return new Response(linhas.join('\n'), {
    headers: { 'content-type': 'text/markdown; charset=utf-8', 'X-Robots-Tag': 'noindex',
      Link: `<${publico.url}>; rel="canonical"` },
  })
}
