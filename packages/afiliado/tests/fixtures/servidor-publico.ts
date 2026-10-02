import { dev } from 'astro'
import { fileURLToPath } from 'node:url'

/** SSR real dos templates; integração pode usar o CMS real e isolar apenas o layout externo. */
export async function servidorPublico(fixture: URL, rotas: Array<{ pattern: string; entrypoint: string }>, opcoes: { cmsReal?: boolean } = {}) {
  const path = (name: string) => fileURLToPath(new URL(name, fixture))
  const layoutPath = (name: string) => fileURLToPath(new URL(`./oferta/${name}`, import.meta.url))
  // Astro omite o handler HTTP quando VITEST está definido. A exceção temporária
  // vale somente para este worker; os demais testes conservam seu ambiente.
  const vitestFlag = process.env.VITEST
  delete process.env.VITEST
  try {
    const server = await dev({
      root: path(''), configFile: false, output: 'server', logLevel: 'silent',
      cacheDir: fileURLToPath(new URL(`../../node_modules/.cache/${fixture.pathname.split('/').filter(Boolean).at(-1)}-html/`, import.meta.url)),
      devToolbar: { enabled: false }, server: { host: '127.0.0.1', port: 0 },
      integrations: [{ name: 'pagina-publica-fixture', hooks: { 'astro:config:setup': ({ injectRoute, addMiddleware }) => {
        addMiddleware({ entrypoint: path('middleware.ts'), order: 'pre' })
        for (const rota of rotas) injectRoute(rota)
      } } }],
      vite: { server: { hmr: false, watch: null }, plugins: [{ name: 'pagina-publica-mocks', enforce: 'pre',
        resolveId(source, importer) {
          if (source === 'virtual:afiliado/config') return '\0pagina-config'
          if (source === 'virtual:editorial/Ferramentas') return layoutPath('Ferramentas.astro')
          if (source === '@maicon-ramos-org/editorial/componentes/Base.astro') return layoutPath('Base.astro')
          if (source === '@maicon-ramos-org/editorial/componentes/Compartilhar.astro') return layoutPath('Compartilhar.astro')
          if (!opcoes.cmsReal && importer?.includes('/afiliado/src/web/') && /^(\.\.\/)*\.?\/?(?:lib\/)?cms$/.test(source)) return path('cms.ts')
        },
        load(id) { if (id === '\0pagina-config') return 'export default { redesDeRastreio: ["tracking.example.test"] }' },
      }] },
    })
    return { server, origin: `http://127.0.0.1:${server.address.port}` }
  } finally {
    if (vitestFlag != null) process.env.VITEST = vitestFlag
  }
}

export const jsonScript = (html: string, id: string) => JSON.parse(html.match(new RegExp(`<script[^>]*${id}[^>]*>(.*?)</script>`, 's'))![1]!)
export const graph = (html: string) => jsonScript(html, 'application/ld\\+json')['@graph'] as Array<Record<string, unknown>>
