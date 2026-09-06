/**
 * POST /api/uso-agente — registra que um agente do navegador chamou uma ferramenta
 * WebMCP (PRD 11 RF8).
 *
 * POR QUE ISTO EXISTE: WebMCP está em origin trial num navegador só. A camada se paga ou
 * não se paga, e sem telemetria a resposta seria opinião. Este endpoint é o que, daqui a
 * 90 dias, autoriza manter ou remover — o gatilho de saída está escrito no PRD.
 *
 * `origem: 'webmcp'` é separado de `'mcp'` de propósito: o remoto exige que a pessoa
 * adicione um conector, este não. Somar os dois apagaria a comparação que interessa.
 *
 * Não é gargalo do caminho de resposta: a ferramenta responde ao agente ANTES e dispara
 * isto depois, sem esperar. Falha aqui não pode virar ferramenta lenta.
 */
import type { APIRoute } from 'astro'

import { cmsFetch } from '../../lib/cms'

const semCache = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex',
}

const ok = (): Response => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })

export const POST: APIRoute = async (context) => {
  const tenant = context.locals.tenant

  let corpo: { tool?: unknown; args?: unknown; achou?: unknown }
  try {
    corpo = await context.request.json()
  } catch {
    return new Response(JSON.stringify({ erro: 'json inválido' }), { status: 400, headers: semCache })
  }

  const tool = String(corpo.tool ?? '').slice(0, 60)
  if (!/^[a-z_]{3,60}$/.test(tool)) {
    return new Response(JSON.stringify({ erro: 'tool inválida' }), { status: 400, headers: semCache })
  }

  /*
   * Os ARGUMENTOS entram resumidos: só as chaves e o tamanho do que veio. O texto que a
   * pessoa digitou não precisa virar linha de log pra responder "alguém usou isto?", e
   * guardar o que não se precisa é dívida de privacidade sem contrapartida.
   */
  const args = corpo.args && typeof corpo.args === 'object' ? (corpo.args as Record<string, unknown>) : {}
  const resumo = Object.fromEntries(
    Object.entries(args)
      .slice(0, 8)
      .map(([k, v]) => [k.slice(0, 24), typeof v === 'string' ? v.length : typeof v]),
  )

  try {
    await cmsFetch('/api/queries_log', {
      method: 'POST',
      body: JSON.stringify({
        tenant: tenant.id,
        origem: 'webmcp',
        texto: tool,
        tools: { tool, args: resumo },
        achou: corpo.achou === true,
      }),
    })
  } catch {
    // log é observação, não função: se o CMS estiver fora, a ferramenta já respondeu
  }

  return ok()
}
