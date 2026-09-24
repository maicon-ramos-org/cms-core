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
