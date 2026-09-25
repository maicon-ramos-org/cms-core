// O site de referência do núcleo (PRD 17 RF9, ADR-0011 §4): nenhuma página própria — a home,
// o blog, o post, a loja, a oferta e os mapas vêm do tema editorial e do plugin de afiliado.
//
// PRD 24 RF4 — o mesmo `ALVO=workers` que um site real da plataforma usa (PRD 24 RF6,
// ADR-0014), aqui só para provar no CI do núcleo que o tema e o plugin montam um Worker
// sem depender de nada que só o site real tem. `CLOUDFLARE_ENV` escolhe o ambiente do
// `wrangler.jsonc` NO BUILD (o `wrangler deploy --env` não escolhe mais desde o Astro 6);
// o job `workers` do `ci.yml` usa `env.ci`.
import node from '@astrojs/node'
import { afiliado } from '@maicon-ramos-org/afiliado/web'
import { editorial } from '@maicon-ramos-org/editorial'
import { defineConfig, memoryCache } from 'astro/config'

const nosWorkers = process.env.ALVO === 'workers'

const formato = nosWorkers
  ? await (async () => {
      const { default: cloudflare } = await import('@astrojs/cloudflare')
      const { cacheCloudflare } = await import('@astrojs/cloudflare/cache')
      return {
        adapter: cloudflare({ imageService: 'passthrough' }),
        cache: { provider: cacheCloudflare() },
        session: false,
      }
    })()
  : {
      adapter: node({ mode: 'standalone' }),
      cache: { provider: memoryCache() },
    }

export default defineConfig({
  output: 'server',
  integrations: [
    editorial({
      config: {
        tenantPadrao: 'exemplo',
        sufixosDeHost: ['.referencia.local'],
        semBarra: ['r'],
        robotsBloqueia: [{ caminho: '/r/', motivo: 'redirect de afiliado não é conteúdo' }],
        sitemap: { ordem: ['posts', 'ofertas', 'lojas', 'paginas', 'catalogo'] },
        busca: { ordem: ['posts', 'ofertas', 'pages', 'lojas'] },
      },
      extensoes: ['@maicon-ramos-org/afiliado/web/extensao'],
    }),
    afiliado(),
  ],
  ...formato,
  vite: { server: { allowedHosts: ['.referencia.local', 'localhost', '127.0.0.1'] } },
})
