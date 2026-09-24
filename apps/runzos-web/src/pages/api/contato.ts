/**
 * POST /api/contato — recebe o formulário da página de contato.
 *
 * FORMULÁRIO NATIVO, não fetch: o `<form method="post">` posta aqui e a resposta é um
 * redirect 303 de volta pra página com `?enviado=1` ou `?erro=...`. Funciona sem JS, que é
 * a regra do projeto — e num formulário de contato isso não é purismo: quem escreve pra
 * um site de cupom muitas vezes está num navegador que bloqueia script.
 *
 * ANTI-SPAM SEM CAPTCHA, em três camadas baratas:
 *  1. honeypot — um campo escondido que só robô preenche;
 *  2. tempo mínimo — bot posta em menos de 3s do carregamento;
 *  3. teto por IP hasheado — 5 mensagens por hora, contadas no próprio banco.
 * Não é à prova de tudo. É o que se faz sem carregar script de terceiro e sem pedir que a
 * pessoa prove que é gente.
 */
import type { APIRoute } from 'astro'

import { cmsFetch } from '../../lib/cms'
import { ipHash } from '@runzos/editorial/lib/hash'

const TEMPO_MINIMO_MS = 3000
const TETO_POR_HORA = 5

const volta = (destino: string, params: Record<string, string>): Response => {
  const url = new URL(destino)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  // 303: o navegador troca POST por GET ao seguir, então recarregar não reenvia
  return new Response(null, { status: 303, headers: { location: `${url.pathname}${url.search}` } })
}

export const POST: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const form = await context.request.formData()

  const origem = String(form.get('origem') ?? '/contato/')
  const destino = new URL(origem, context.url.origin).toString()

  const nome = String(form.get('nome') ?? '').trim().slice(0, 120)
  const email = String(form.get('email') ?? '').trim().slice(0, 200)
  const mensagem = String(form.get('mensagem') ?? '').trim().slice(0, 4000)
  const armadilha = String(form.get('site') ?? '').trim()
  const carregadoEm = Number(form.get('t') ?? '0')

  /*
   * O robô recebe o mesmo 303 de sucesso. Dizer "spam detectado" ensina o robô a ajustar,
   * e a pessoa de verdade nunca vê esta linha porque nunca preenche o campo escondido.
   */
  if (armadilha) return volta(destino, { enviado: '1' })
  if (!carregadoEm || Date.now() - carregadoEm < TEMPO_MINIMO_MS) {
    return volta(destino, { enviado: '1' })
  }

  if (!nome || !email || !mensagem) return volta(destino, { erro: 'campos' })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return volta(destino, { erro: 'email' })

  const hash = ipHash(context.clientAddress)

  try {
    if (hash) {
      const desde = new Date(Date.now() - 3600_000).toISOString()
      const q = new URLSearchParams({
        'where[and][0][tenant][equals]': String(tenant.id),
        'where[and][1][ip_hash][equals]': hash,
        'where[and][2][createdAt][greater_than]': desde,
        limit: '0',
      })
      const { totalDocs } = await cmsFetch<{ totalDocs: number }>(`/api/mensagens?${q}`)
      if (totalDocs >= TETO_POR_HORA) return volta(destino, { erro: 'limite' })
    }

    await cmsFetch('/api/mensagens', {
      method: 'POST',
      body: JSON.stringify({
        tenant: tenant.id,
        nome,
        email,
        mensagem,
        origem_url: origem,
        user_agent: context.request.headers.get('user-agent')?.slice(0, 250) ?? undefined,
        ip_hash: hash,
      }),
    })
  } catch {
    // CMS fora do ar não pode virar página de erro branca: a pessoa perde o texto que
    // escreveu. Volta com aviso e o formulário reapresenta o que ela digitou.
    return volta(destino, { erro: 'envio' })
  }

  return volta(destino, { enviado: '1' })
}
