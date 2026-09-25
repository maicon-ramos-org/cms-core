import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
  },
  // PRD 24 RF4/RF7 (achado do spike RF0.13): sem isto o webpack embute a saída `default`
  // (vazia) do `pg-cloudflare` e o Worker falha com `cannot connect to Postgres: h3 is not
  // a constructor`; `jose` é o mesmo tratamento que o template do Payload para D1 usa.
  // `sharp` (achado desta RF4): o otimizador de imagem do PRÓPRIO Next.js — não o `sharp`
  // que a fábrica do núcleo carrega (RF1) — referencia o binário nativo por um chunk
  // hasheado (`sharp-<hash>`) sempre que o pacote está instalado, mesmo com `sharp: null`
  // na config do Payload; sem externalizar, o `opennextjs-cloudflare build` falha
  // ("Could not resolve sharp-<hash>") porque o esbuild tenta empacotar o binário para o
  // `workerd`, que não o roda.
  serverExternalPackages: ['jose', 'pg', 'pg-cloudflare', 'sharp'],
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  // monorepo pnpm: o root do Turbopack é a RAIZ do workspace (onde vive o lockfile),
  // senão o next não resolve os symlinks do pnpm — e o CMS sobe quebrado
  turbopack: {
    root: path.resolve(dirname, '../..'),
  },
  // nossos CLAUDE.md/AGENTS.md são o contrato do repo — o Next não gera os dele
  agentRules: false,
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
