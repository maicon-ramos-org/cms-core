/**
 * Auto-linker (PRD 04) — linkagem interna sobre a árvore Lexical.
 *
 * Opera na ÁRVORE, não no HTML: é o que dá contexto de graça. Saber que um texto está
 * dentro de heading, tabela, citação ou de outro link é justamente o que separa
 * linkagem útil de link em lugar errado — e no HTML isso viraria adivinhação por regex.
 *
 * Função pura: não lê banco, não escreve nada. Quem chama traz as regras e decide o que
 * fazer com o que voltou.
 */

export interface Destino {
  colecao: 'posts' | 'ofertas' | 'lojas' | 'produtos' | 'pages'
  id: number | string
  slug: string
  url: string
  publicado: boolean
  tenant: number | string
}

export interface Regra {
  destino: Destino
  ancoras: string[]
  prioridade?: number
  /** quantos links o destino já recebe — menos é melhor (RF6: boost de órfã) */
  linksEntrantes?: number
}

export interface Origem {
  colecao: string
  id: number | string
  url: string
  tenant: number | string
}

export interface Opcoes {
  regras: Regra[]
  origem: Origem
  maxLinks?: number
  stoplist?: string[]
  whitelistCrossTenant?: Array<number | string>
}

export interface LinkAplicado {
  /** relação, nunca texto: se o slug do destino mudar, o registro continua válido */
  destino: { colecao: Destino['colecao']; id: number | string }
  ancora: string
  url: string
}

export interface Resultado<T> {
  arvore: T
  aplicados: LinkAplicado[]
}

export interface No {
  type?: string
  tag?: string | number
  text?: string
  format?: string | number
  children?: No[]
  fields?: { url?: string; newTab?: boolean }
  root?: No
  [k: string]: unknown
}

/** Onde link automático nunca entra (RF3). */
const CONTEXTO_PROIBIDO = new Set(['heading', 'quote', 'table', 'tablerow', 'tablecell', 'link', 'autolink', 'code'])

/** bit de `code` no format do Lexical — texto de código não vira link */
const FORMATO_CODIGO = 1 << 4

/** Hash estável de string: a rotação de âncora precisa ser determinística (RF4). */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

const escapaRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Casa a âncora como PALAVRA inteira, sem diferenciar caixa. `\b` não serve: âncora
 * pode terminar em dígito ("n8n") e a borda do JS trataria "n8nzao" como limite válido.
 */
function achaOcorrencia(texto: string, ancora: string): { inicio: number; fim: number } | null {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapaRegex(ancora)})(?![\\p{L}\\p{N}])`, 'iu')
  const m = re.exec(texto)
  if (!m) return null
  // grupos 1 e 2 sempre existem quando há match — o `?? ''` é só pro strict do TS
  const inicio = m.index + (m[1] ?? '').length
  return { inicio, fim: inicio + (m[2] ?? '').length }
}

export function aplicaLinks<T>(arvore: T, opcoes: Opcoes): Resultado<T> {
  const maxLinks = opcoes.maxLinks ?? 5
  const stoplist = new Set((opcoes.stoplist ?? []).map((s) => s.toLowerCase()))
  const whitelist = new Set((opcoes.whitelistCrossTenant ?? []).map(String))
  const aplicados: LinkAplicado[] = []

  // ---- 1. candidatas que sobrevivem às guardas de link podre --------------------
  const candidatas: Array<{ regra: Regra; ancora: string }> = []
  for (const regra of opcoes.regras) {
    const d = regra.destino
    if (!d.publicado) continue // RF8
    if (d.colecao === opcoes.origem.colecao && String(d.id) === String(opcoes.origem.id)) continue // self-link
    if (String(d.tenant) !== String(opcoes.origem.tenant) && !whitelist.has(String(d.tenant))) continue // RF5
    const usaveis = regra.ancoras.filter((a) => a.trim() && !stoplist.has(a.toLowerCase()))
    if (!usaveis.length) continue
    // RF4: a âncora deste destino nesta página — determinística pela URL de origem
    const escolhida = usaveis[hash(`${opcoes.origem.url}|${d.colecao}:${d.id}`) % usaveis.length]!
    candidatas.push({ regra, ancora: escolhida })
  }

  // ---- 2. onde cada candidata casaria (posição, não decisão ainda) ---------------
  const nos = textosLinkaveis(arvore as unknown as No)
  type Match = { cand: { regra: Regra; ancora: string }; no: No; ordem: number; inicio: number; fim: number }
  const matches: Match[] = []
  for (const cand of candidatas) {
    for (let i = 0; i < nos.length; i += 1) {
      const oc = achaOcorrencia(nos[i]!.text!, cand.ancora)
      if (oc) {
        matches.push({ cand, no: nos[i]!, ordem: i, inicio: oc.inicio, fim: oc.fim })
        break // RF3: só a primeira ocorrência
      }
    }
  }

  // ---- 3. sobreposição: a frase MAIS ESPECÍFICA vence -----------------------------
  // Especificidade só decide entre candidatas que disputam o MESMO trecho. Fora disso
  // quem ordena é o RF6 — foi confundir as duas coisas que quebrou a primeira versão.
  const ordenadasPorTrecho = [...matches].sort(
    (a, b) => a.ordem - b.ordem || a.inicio - b.inicio || b.fim - b.inicio - (a.fim - a.inicio),
  )
  const semSobreposicao: Match[] = []
  for (const m of ordenadasPorTrecho) {
    const conflita = semSobreposicao.some((x) => x.no === m.no && m.inicio < x.fim && x.inicio < m.fim)
    if (!conflita) semSobreposicao.push(m)
  }

  // ---- 4. quem fica com as vagas: órfã primeiro (RF6) ----------------------------
  const porVaga = [...semSobreposicao].sort(
    (a, b) =>
      (b.cand.regra.prioridade ?? 0) - (a.cand.regra.prioridade ?? 0) ||
      (a.cand.regra.linksEntrantes ?? 0) - (b.cand.regra.linksEntrantes ?? 0) ||
      a.ordem - b.ordem ||
      a.inicio - b.inicio,
  )
  const destinosUsados = new Set<string>()
  const escolhidos: Match[] = []
  for (const m of porVaga) {
    if (escolhidos.length >= maxLinks) break
    const chave = `${m.cand.regra.destino.colecao}:${m.cand.regra.destino.id}`
    if (destinosUsados.has(chave)) continue // 1 link por destino por página
    destinosUsados.add(chave)
    escolhidos.push(m)
  }

  // ---- 5. aplica TODOS os links de um nó de uma vez -----------------------------
  // Um splice por nó, não um por link: o primeiro splice troca o nó original por cópias,
  // e um segundo splice procuraria um nó que já não está mais na árvore.
  const porNo = new Map<No, Match[]>()
  for (const m of escolhidos) porNo.set(m.no, [...(porNo.get(m.no) ?? []), m])
  for (const [no, lista] of porNo) {
    const pai = paiDe(arvore as unknown as No, no)
    if (!pai?.children) continue
    const idx = pai.children.indexOf(no)
    if (idx < 0) continue
    const texto = no.text!
    const ordenados = [...lista].sort((a, b) => a.inicio - b.inicio)
    const substitutos: No[] = []
    let cursor = 0
    for (const m of ordenados) {
      if (m.inicio > cursor) substitutos.push({ ...no, text: texto.slice(cursor, m.inicio) })
      substitutos.push({
        type: 'link',
        version: 1,
        fields: { url: m.cand.regra.destino.url },
        children: [{ ...no, text: texto.slice(m.inicio, m.fim) }],
      })
      cursor = m.fim
    }
    if (cursor < texto.length) substitutos.push({ ...no, text: texto.slice(cursor) })
    pai.children.splice(idx, 1, ...substitutos)
  }

  // ordem de relato = ordem no documento, que é como um humano confere
  for (const m of [...escolhidos].sort((a, b) => a.ordem - b.ordem || a.inicio - b.inicio)) {
    aplicados.push({
      destino: { colecao: m.cand.regra.destino.colecao, id: m.cand.regra.destino.id },
      ancora: m.no.text!.slice(m.inicio, m.fim),
      url: m.cand.regra.destino.url,
    })
  }

  return { arvore, aplicados }
}

/** Nós de texto onde é permitido linkar, em ordem de documento. */
function textosLinkaveis(raizArvore: No): No[] {
  const saida: No[] = []
  const anda = (no: No, proibido: boolean): void => {
    if (!no || typeof no !== 'object') return
    const bloqueado = proibido || CONTEXTO_PROIBIDO.has(String(no.type))
    const filhos = no.root ? [no.root] : no.children
    if (!Array.isArray(filhos)) return
    for (const filho of filhos) {
      const ehCodigo = ((typeof filho.format === 'number' ? filho.format : 0) & FORMATO_CODIGO) !== 0
      if (!bloqueado && filho.type === 'text' && typeof filho.text === 'string' && !ehCodigo) saida.push(filho)
      anda(filho, bloqueado)
    }
  }
  anda(raizArvore, false)
  return saida
}

/** Pai de um nó (preciso dele pra trocar o texto por [antes, link, depois]). */
function paiDe(raizArvore: No, alvo: No): No | null {
  const filhos = raizArvore.root ? [raizArvore.root] : raizArvore.children
  if (!Array.isArray(filhos)) return null
  if (filhos.includes(alvo)) return raizArvore.root ? paiDe(raizArvore.root, alvo) ?? raizArvore.root : raizArvore
  for (const f of filhos) {
    const achado = paiDe(f, alvo)
    if (achado) return achado
  }
  return null
}
