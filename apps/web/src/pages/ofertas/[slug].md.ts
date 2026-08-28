/**
 * Gêmeo em markdown de /ofertas/{slug} — o `.md` paralelo do checklist agent-readable.
 * Mesmo dado da página HTML, sem layout: é o que um agente/crawler de IA prefere ler.
 */
import type { APIRoute } from 'astro'

import { getOfertaBySlug, type CupomDTO, type LojaDTO } from '../../lib/cms'
import { lexicalParaTexto } from '../../lib/lexical'

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const slug = context.params.slug ?? ''
  const oferta = await getOfertaBySlug(tenant.id, slug)
  if (!oferta) return new Response('Oferta não encontrada.', { status: 404 })

  const loja: LojaDTO | null = oferta.loja && typeof oferta.loja === 'object' ? oferta.loja : null
  const cupom: CupomDTO | null = oferta.cupom && typeof oferta.cupom === 'object' ? oferta.cupom : null

  if (context.cache.enabled) {
    context.cache.set({
      maxAge: 300,
      swr: 60,
      tags: [`tenant:${tenant.slug}`, `ofertas:${oferta.id}`, ...(loja ? [`loja:${loja.slug}`] : [])],
    })
  }

  const linhas: string[] = [`# ${oferta.titulo}`, '']
  if (loja) linhas.push(`**Loja:** ${loja.nome}`)
  if (oferta.tipo) linhas.push(`**Tipo:** ${oferta.tipo}`)
  if (typeof oferta.preco?.valor === 'number' && oferta.preco.valor > 0) {
    const ciclo = oferta.preco.ciclo === 'mensal' ? '/mês' : ''
    const visto = oferta.preco.preco_em ? ` (preço visto em ${String(oferta.preco.preco_em).slice(0, 10)})` : ''
    linhas.push(`**Preço:** ${oferta.preco.valor} ${oferta.preco.moeda ?? 'BRL'}${ciclo}${visto}`)
  }
  if (cupom) {
    linhas.push(`**Cupom:** ${cupom.codigo}`)
    if (cupom.verificado_em) linhas.push(`**Verificado em:** ${String(cupom.verificado_em).slice(0, 10)}`)
  }
  linhas.push('', `**Link:** https://${tenant.canonical_host}/r/o${oferta.id}?ref=md`, '')
  const corpo = lexicalParaTexto(oferta.corpo)
  if (corpo) linhas.push(corpo)

  return new Response(linhas.join('\n'), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
}
