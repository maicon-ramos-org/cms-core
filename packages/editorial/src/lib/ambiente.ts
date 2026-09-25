/**
 * O que muda entre Node (a VPS) e Workers (a Cloudflare) para o lado web do núcleo, num
 * lugar só (PRD 24 RF3): de onde vem uma variável, de onde vem o IP de quem pede, e como
 * se purga o cache da borda. O resto do tema e do afiliado não sabe em qual dos dois está.
 *
 * Todo acesso ao ambiente do processo no lado web passa por aqui — a trava é o grep do
 * aceite do PRD. Em Node, cada função devolve exatamente o que o código de antes lia.
 *
 * CUIDADO ao editar: não escreva neste arquivo o nome de nenhuma variável de ambiente, nem
 * em comentário, nem sublinhado solto. Como ele acessa `import.meta.env` por nome
 * dinâmico, o plugin de ambiente do Astro embute no bundle, em tempo de build, o valor de
 * toda variável privada cujo nome aparece no texto do arquivo. O nome de um segredo
 * escrito aqui viraria o valor dele dentro do código publicado.
 */
import type { APIContext } from 'astro'

type Fonte = Readonly<Record<string, unknown>> | undefined

/**
 * A regra de `variavel`, com as fontes explícitas (é o que o teste exercita): o ambiente
 * do processo vence; sem a variável nele, vale o `import.meta.env`. Só string é variável —
 * os booleanos do Vite (modo de desenvolvimento, produção, servidor) não são. String
 * vazia é valor, não ausência: não cai na segunda fonte.
 */
export function leDasFontes(nome: string, processo: Fonte, vite: Fonte): string | undefined {
  const doProcesso = processo?.[nome]
  if (typeof doProcesso === 'string') return doProcesso
  const doVite = vite?.[nome]
  return typeof doVite === 'string' ? doVite : undefined
}

/**
 * Uma variável de ambiente, pelo nome — inclusive nome que só se sabe na hora, como o do
 * ID de afiliado que o tenant aponta.
 *
 * Em Node é o ambiente do processo, como sempre. Nos Workers com a compatibilidade de Node
 * ligada (ela vem sozinha com a data de compatibilidade que o PRD fixa), o mesmo objeto
 * chega preenchido com as vars e os secrets do Worker. O `import.meta.env` fica de segunda fonte: no `astro dev` ele traz
 * o arquivo de ambiente do site, que o processo não lê; num build de produção só traz o
 * público (ver o CUIDADO acima).
 */
export function variavel(nome: string): string | undefined {
  const processo = typeof process === 'undefined' ? undefined : process.env
  return leDasFontes(nome, processo, import.meta.env as Fonte)
}

/** IPv4 ou IPv6: só dígitos hexadecimais, dois-pontos e ponto, no tamanho de um IP. */
const pareceIp = /^[0-9a-f:.]{2,45}$/i

/**
 * O IP de quem fez o pedido, para o hash do clique e o teto do formulário de contato.
 *
 * `context.clientAddress` primeiro: em Node é o de sempre, e o adaptador da Cloudflare o
 * preenche com o `cf-connecting-ip` validado. Quando o adaptador não o oferece, o Astro
 * LANÇA ao ler a propriedade (não devolve vazio) — e uma rota que só queria o hash viraria
 * 500. Aí vale o próprio `cf-connecting-ip`, se tiver cara de IP: o valor só entra num
 * sha256 com sal, mas lixo no cabeçalho não pode virar o hash de ninguém.
 */
export function ipDoCliente(context: Pick<APIContext, 'clientAddress' | 'request'>): string | undefined {
  try {
    const ip = context.clientAddress
    if (ip) return ip
  } catch {
    // adaptador sem clientAddress: cai no cabeçalho da Cloudflare
  }
  const doCabecalho = context.request.headers.get('cf-connecting-ip')?.trim()
  return doCabecalho && pareceIp.test(doCabecalho) ? doCabecalho : undefined
}

/** O retorno do purge da Cloudflare: não lança quando recusa, devolve `success: false`. */
export interface RespostaDaPurga {
  success: boolean
  errors?: unknown[]
}

export type PurgaPorTags = (opcoes: { tags: string[] }) => Promise<RespostaDaPurga>

/**
 * O purge por tag do cache da Cloudflare (`cache.purge` de `cloudflare:workers`), ou
 * `null` fora de um Worker.
 *
 * Existe porque o provedor de cache do `@astrojs/cloudflare` (14.3) chama esse mesmo
 * purge e DESCARTA o retorno: o `context.cache.invalidate` resolve igual quando a
 * Cloudflare recusa pelo limite (5 por minuto), e a rota responderia 200 a uma purga que
 * não aconteceu. Chamando daqui, com as mesmas tags, o `/api/revalidate` vê a recusa.
 *
 * Em Node não há tentativa nenhuma: o `userAgent` do runtime diz se é um Worker, e só
 * então o módulo é importado. O nome do módulo é montado na hora, para que o build de Node
 * não tente resolvê-lo (ele não existe fora do workerd); nos Workers, o import dinâmico
 * de um módulo embutido é resolvido pelo próprio runtime. Qualquer falha devolve `null`.
 */
export async function purgaDaCloudflare(): Promise<PurgaPorTags | null> {
  const agente = (globalThis as { navigator?: { userAgent?: unknown } }).navigator?.userAgent
  if (agente !== 'Cloudflare-Workers') return null
  try {
    const modulo = (await import(/* @vite-ignore */ ['cloudflare', 'workers'].join(':'))) as {
      cache?: { purge?: PurgaPorTags }
    }
    const cache = modulo.cache
    if (!cache || typeof cache.purge !== 'function') return null
    return (opcoes) => cache.purge!(opcoes)
  } catch {
    return null
  }
}
