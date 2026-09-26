import { defineConfig } from 'astro/config'
import node from '@astrojs/node'
import { fileURLToPath } from 'node:url'
import { temaAstro } from '../../../src/tema.ts'

export default defineConfig({
  output: 'server', adapter: node({ mode: 'standalone' }),
  vite: { ssr: { noExternal: true } },
  integrations: [temaAstro({ nome: 'editorial', rotas: [], componentes: {},
    middleware: fileURLToPath(new URL('../../../src/middleware.ts', import.meta.url)),
  }, { config: { tenantPadrao: 'exemplo', sufixosDeHost: ['.exemplo.local'],
    memoLeituras: { caminhosPublicos: ['/', '/ficha/', '/ficha.md', '/indice.json'] },
  } })],
})
