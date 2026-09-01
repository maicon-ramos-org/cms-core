/**
 * GET /api/cupom/{id} → `{ codigo }`. É o que revela o código depois do clique.
 *
 * POR QUE O CÓDIGO NÃO SAI NO HTML (mudança de decisão, 2026-09-01 — ver ADR-0007):
 * o site rankeia e é citado por AI Overview justamente nas buscas de cupom. Com o código
 * no HTML, a resposta da IA entrega o código e a pessoa vai à loja por fora do nosso link
 * — usa o desconto, e a comissão não acontece. Servir o código só depois do clique põe o
 * redirect de afiliado no caminho, que é onde o site se paga.
 *
 * O QUE CONTINUA NO HTML: desconto, condições, selo de verificação, loja, preço, validade.
 * A página segue respondendo "a Hostinger tem cupom? tem, 10%, conferido em 28/08" sem JS
 * nenhum — o que sai é o literal do código, não o conteúdo. Não é cloaking: rastreador e
 * pessoa recebem exatamente a mesma página.
 *
 * O endpoint é obscuro, não secreto: quem souber a URL busca o código. O alvo é o
 * rastreador que lê HTML e não executa JS, não um adversário.
 *
 * `noindex` + `no-store`: é dado de interface e muda de estado (cupom expira).
 */
import type { APIRoute } from 'astro'

import { cmsFindOneNoTenant, type CupomDTO } from '../../../lib/cms'

/** Mesma régua do card: só revela cupom em estado visível. */
const VISIVEL = new Set(['publicado', 'expirando'])

const semCache = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex',
}

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const bruto = context.params.id ?? ''
  // só dígito: o id vem do nosso próprio HTML, e qualquer outra coisa é sondagem
  if (!/^\d{1,12}$/.test(bruto)) {
    return new Response(JSON.stringify({ erro: 'id inválido' }), { status: 400, headers: semCache })
  }

  const cupom = await cmsFindOneNoTenant<CupomDTO>('cupons', bruto, tenant.id)
  if (!cupom || !VISIVEL.has(cupom.estado)) {
    return new Response(JSON.stringify({ erro: 'não encontrado' }), { status: 404, headers: semCache })
  }

  return new Response(JSON.stringify({ codigo: cupom.codigo }), { status: 200, headers: semCache })
}
