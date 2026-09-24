// O site de referência do núcleo (PRD 17 RF9, ADR-0011 §4): nenhuma página própria — a home,
// o blog, o post, a loja, a oferta e os mapas vêm do tema editorial e do plugin de afiliado.
import node from '@astrojs/node'
import { afiliado } from '@maicon-ramos-org/afiliado/web'
import { editorial } from '@maicon-ramos-org/editorial'
import { defineConfig, memoryCache } from 'astro/config'

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
  adapter: node({ mode: 'standalone' }),
  cache: { provider: memoryCache() },
  vite: { server: { allowedHosts: ['.referencia.local', 'localhost', '127.0.0.1'] } },
})
