/**
 * GET /manifest.webmanifest — o manifesto da PWA, montado do TENANT.
 *
 * Nome, cores e ícones saem de `tenants` porque um manifesto em `public/` seria a marca
 * cravada em arquivo: o segundo tenant (3d) tem outro nome, outra cor e outro ícone, e
 * dividiria o mesmo arquivo.
 *
 * `display: browser` de propósito. Os outros valores (`standalone`, `minimal-ui`) fazem o
 * Android abrir o site numa janela SEM barra de endereço — some a URL, some o cadeado, e
 * some o botão de compartilhar. Num site que vive de link de oferta e de confiança no
 * endereço, esconder a barra tira mais do que dá. Manifesto aqui existe pelo ÍCONE e pelo
 * nome do atalho, não pra fingir aplicativo.
 */
import type { APIRoute } from 'astro'

import { urlMidia } from '../lib/cms'

const url = (m: unknown): string | undefined =>
  m && typeof m === 'object' && (m as { url?: string }).url ? urlMidia((m as { url?: string }).url) : undefined

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const ic = tenant.tema?.icones ?? {}

  const icons = [
    { src: url(ic.png192), sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: url(ic.png512), sizes: '512x512', type: 'image/png', purpose: 'any' },
    /*
     * O mesmo 512 também como `maskable`: o Android recorta o ícone em círculo, e sem um
     * maskable ele aplica o corte por conta própria — o que come a borda do anel da marca.
     * Como o nosso símbolo já tem folga em volta, o mesmo arquivo serve pros dois papéis.
     */
    { src: url(ic.png512), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ].filter((i) => i.src)

  const doc = {
    name: tenant.nome,
    short_name: tenant.nome,
    description: `Cupons e ofertas de software e hospedagem, com a data em que cada preço foi conferido.`,
    start_url: '/',
    scope: '/',
    display: 'browser',
    lang: 'pt-BR',
    background_color: tenant.tema?.cor_fundo ?? '#ffffff',
    theme_color: tenant.tema?.cor_superficie_marca ?? '#ffffff',
    icons,
  }

  return new Response(JSON.stringify(doc, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
