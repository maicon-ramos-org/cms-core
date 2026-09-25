/**
 * As regras de URL do middleware do tema, sem o middleware em volta — para dar para testar
 * sem subir o Astro. O que é de um site (qual tenant é o padrão, que pastas têm ficha com
 * gêmeo `.md`, que caminho não leva barra) chega pela `ConfigDoEditorial`.
 */
import type { ConfigDoEditorial } from './config'
import { variavel } from './lib/ambiente'

/**
 * As variáveis que as regras leem. Sem o objeto, vêm do ambiente pelo `variavel` (Node ou
 * Workers — PRD 24 RF3); com ele, só dele (é como o teste isola o ambiente).
 */
type Ambiente = Readonly<Record<string, string | undefined>>
const le = (nome: string, env?: Ambiente): string | undefined => (env ? env[nome] : variavel(nome))

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
export const sufixosDeSlug = (config: ConfigDoEditorial, env?: Ambiente): string[] =>
  (le('HOST_SUFIXOS_TENANT', env) ?? (config.sufixosDeHost ?? []).join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

/** O tenant de localhost e do sufixo nu. A variável `DEFAULT_TENANT` ganha da config. */
export const tenantPadrao = (config: ConfigDoEditorial, env?: Ambiente): string =>
  le('DEFAULT_TENANT', env) ?? config.tenantPadrao

export const isLocalhost = (host: string): boolean =>
  host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')

/** `3d.dev.exemplo.com` → `3d`; `dev.exemplo.com` → o padrão; fora dos sufixos → null. */
export const slugPeloSufixo = (
  host: string,
  config: ConfigDoEditorial,
  env?: Ambiente,
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
  /**
   * `pathname` cai num prefixo de `config.semTenant`? Generaliza o bypass que
   * `/api/revalidate` e `/healthz` já tinham (hardcoded no middleware): pula a resolução de
   * tenant E a regra de barra final. Sem `semTenant` na config, nunca é `true`.
   *
   * Casamento por SEGMENTO, não por texto cru: `/velho` casa `/velho` e `/velho/x`, nunca
   * `/velhote` — um `pathname.startsWith(p)` ingênuo pularia o tenant de qualquer rota que
   * por acaso começasse com as mesmas letras.
   */
  precisaPularTenant: (pathname: string) => boolean
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

  const prefixosSemTenant = config.semTenant ?? []
  for (const p of prefixosSemTenant) {
    if (p === '' || p === '/') {
      throw new Error(`semTenant: prefixo "${p}" pularia o tenant do site inteiro — configure um prefixo real, não "" nem "/"`)
    }
  }
  const precisaPularTenant = (pathname: string): boolean =>
    prefixosSemTenant.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  return {
    precisaDeBarra: (pathname) =>
      pathname !== '/' &&
      !pathname.endsWith('/') &&
      !semBarra.test(pathname) &&
      !ehArquivo.test(pathname) &&
      pathname !== '/healthz' &&
      !precisaPularTenant(pathname),
    /** Rotas que têm gêmeo `.md`. Fora daqui, o header é ignorado e serve HTML. */
    temGemeoMd: (p) => Boolean(fichaDePasta?.test(p)) || (/^\/[^/]+\/$/.test(p) && !semMd.has(p)),
    precisaPularTenant,
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

/**
 * Junta nomes ao `Vary` que a resposta já trouxe, sem repetir (a comparação é por nome
 * inteiro e sem caixa: `Accept-Encoding` não é `Accept`). `Vary: *` já varia por tudo e
 * fica como está.
 */
export const juntaVary = (anterior: string | null, nomes: string[]): string => {
  const tokens = (anterior ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  if (tokens.includes('*')) return anterior!
  const presentes = new Set(tokens.map((t) => t.toLowerCase()))
  const novos = nomes.filter((n) => !presentes.has(n.toLowerCase()))
  return [...tokens, ...novos].join(', ')
}

const diretivasDe = (cc: string | null | undefined): string[] =>
  (cc ?? '')
    .toLowerCase()
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean)

/** O nome de uma diretiva, sem o valor (`max-age=600` → `max-age`; `private` → `private`). */
const nomeDaDiretiva = (d: string): string => d.split('=')[0]!.trim()

/**
 * A resposta PODE ir para um cache compartilhado? GET/HEAD sem `no-store` nem `private`
 * (sem lista de campos) — a menos que `Cloudflare-CDN-Cache-Control`/`CDN-Cache-Control`
 * digam o contrário, que é o que a Cloudflare de fato obedece na borda.
 *
 * É de propósito mais largo que "a rota chamou `cache.set`": o cache na frente do Worker
 * segue a RFC 9111, que guarda 301 e 404 sem instrução nenhuma, e rota que manda
 * `Cache-Control: public` sozinha (manifest, robots) também entra. Errar para o lado de
 * pôr `Vary: Host` onde não precisava não custa nada; errar para o outro lado serve a
 * página de um tenant no domínio do outro (PRD 24 RF3).
 *
 * Dois ajustes (PRD 24, revisão da RF3):
 * - `cdnCacheControl` é o header específico da CDN — `Cloudflare-CDN-Cache-Control` vence
 *   `CDN-Cache-Control` quando os dois existem (quem chama já resolve essa precedência
 *   antes de passar um valor só); com `public` ou `max-age`, ele decide sozinho a favor do
 *   cache, mesmo que o `Cache-Control` genérico (pro navegador) diga `private` — é
 *   exatamente pra isso que a Cloudflare o documenta.
 * - `private` só desqualifica quando vem SEM lista de campos (RFC 9111 §5.2.2.7):
 *   `private=set-cookie` só torna aquele campo privado; o resto da resposta pode ser
 *   guardado. Antes, qualquer `private=...` contava como `private` puro (o valor era
 *   descartado antes da comparação) e a resposta nunca entrava no cache.
 */
export const respostaCacheavel = (metodo: string, cacheControl: string | null, cdnCacheControl?: string | null): boolean => {
  const m = metodo.toUpperCase()
  if (m !== 'GET' && m !== 'HEAD') return false

  const doCdn = diretivasDe(cdnCacheControl)
  if (doCdn.some((d) => nomeDaDiretiva(d) === 'public' || nomeDaDiretiva(d) === 'max-age')) return true

  const diretivas = diretivasDe(cacheControl)
  if (diretivas.some((d) => nomeDaDiretiva(d) === 'no-store')) return false
  if (diretivas.some((d) => d === 'private')) return false
  return true
}
