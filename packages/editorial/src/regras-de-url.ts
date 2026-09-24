/**
 * As regras de URL do middleware do tema, sem o middleware em volta — para dar para testar
 * sem subir o Astro. O que é de um site (qual tenant é o padrão, que pastas têm ficha com
 * gêmeo `.md`, que caminho não leva barra) chega pela `ConfigDoEditorial`.
 */
import type { ConfigDoEditorial } from './config'

/**
 * Sufixos em que o tenant vem do SUBDOMÍNIO, e não do `canonical_host`.
 *
 * Existe porque fora de produção o host NUNCA é o canônico: o mesmo tenant é
 * `3d.exemplo.com` em produção, `3d.dev.exemplo.com` em staging e `3d.exemplo.local` na
 * máquina — e canonizar staging pra si mesmo é justamente o que o ADR-0004 proíbe. Sem
 * esta regra, staging responde 404 em todo tenant que não seja o default.
 *
 * O sufixo NU (`dev.exemplo.com`, sem subdomínio) cai no tenant padrão — mesmo contrato
 * do localhost. A variável `HOST_SUFIXOS_TENANT` (separada por vírgula) ganha da config.
 */
export const sufixosDeSlug = (config: ConfigDoEditorial, env: NodeJS.ProcessEnv = process.env): string[] =>
  (env.HOST_SUFIXOS_TENANT ?? (config.sufixosDeHost ?? []).join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

/** O tenant de localhost e do sufixo nu. A variável `DEFAULT_TENANT` ganha da config. */
export const tenantPadrao = (config: ConfigDoEditorial, env: NodeJS.ProcessEnv = process.env): string =>
  env.DEFAULT_TENANT ?? config.tenantPadrao

export const isLocalhost = (host: string): boolean =>
  host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')

/** `3d.dev.exemplo.com` → `3d`; `dev.exemplo.com` → o padrão; fora dos sufixos → null. */
export const slugPeloSufixo = (
  host: string,
  config: ConfigDoEditorial,
  env: NodeJS.ProcessEnv = process.env,
): string | null => {
  for (const sufixo of sufixosDeSlug(config, env)) {
    if (host === sufixo.replace(/^\./, '')) return tenantPadrao(config, env)
    if (host.endsWith(sufixo)) return host.slice(0, -sufixo.length)
  }
  return null
}

const escapa = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export interface RegrasDeUrl {
  precisaDeBarra: (pathname: string) => boolean
  temGemeoMd: (pathname: string) => boolean
}

/** As regras montadas uma vez por processo, a partir da config do site. */
export function regrasDeUrl(config: ConfigDoEditorial): RegrasDeUrl {
  /*
   * Paridade de URL: o WordPress serve TUDO com barra final e 301 quem chega sem ela.
   * Sem reproduzir isso, cada URL do acervo vira duas (mesmo conteúdo em /x e /x/), o
   * canonical diverge do que já está indexado, e o diff da Fase D acusa 100% das páginas.
   *
   * Fora da regra: arquivos com extensão (.md, .xml, .txt, /fontes/*), a API, o healthz e
   * o que o site declara em `semBarra` (um redirect de afiliado, por exemplo) — nenhum
   * deles é URL de conteúdo indexável.
   */
  const semBarra = new RegExp(`^/(${['api', ...(config.semBarra ?? [])].map(escapa).join('|')})/`)
  const ehArquivo = /\.[a-z0-9]+$/i

  /*
   * Pastas cujas fichas (`/pasta/slug/`) têm gêmeo `.md`. Os HUBS dessas pastas não têm —
   * só as fichas: sem o hub na lista, o segundo ramo da regra o trataria como página de
   * raiz e reescreveria pra `/pasta.md`, que não existe, e o agente pedindo markdown no hub
   * receberia 404.
   */
  const pastas = config.pastasComMd ?? []
  const fichaDePasta = pastas.length > 0 ? new RegExp(`^/(${pastas.map(escapa).join('|')})/[^/]+/$`) : null
  const semMd = new Set(['/', '/blog/', '/busca/', ...pastas.map((p) => `/${p}/`), ...(config.semMd ?? [])])

  return {
    precisaDeBarra: (pathname) =>
      pathname !== '/' &&
      !pathname.endsWith('/') &&
      !semBarra.test(pathname) &&
      !ehArquivo.test(pathname) &&
      pathname !== '/healthz',
    /** Rotas que têm gêmeo `.md`. Fora daqui, o header é ignorado e serve HTML. */
    temGemeoMd: (p) => Boolean(fichaDePasta?.test(p)) || (/^\/[^/]+\/$/.test(p) && !semMd.has(p)),
  }
}

/**
 * `text/markdown` só vence se vier antes de `text/html` na ordem do header. Navegador
 * sempre manda html primeiro; quem pede markdown explicitamente coloca ele na frente.
 */
export const querMarkdown = (accept: string): boolean => {
  const tipos = accept
    .split(',')
    .map((t) => t.split(';')[0]!.trim().toLowerCase())
    .filter(Boolean)
  const md = tipos.indexOf('text/markdown')
  if (md === -1) return false
  const html = tipos.indexOf('text/html')
  return html === -1 || md < html
}

export const caminhoDoMd = (p: string): string => `${p.replace(/\/$/, '')}.md`
