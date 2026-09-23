/**
 * Nome de arquivo da mídia sem colisão de derivados (PRD 18 RF5).
 *
 * O Payload nomeia cada derivado pelo nome da original SEM a extensão
 * (`{nome}-{largura}x{altura}.{ext}`), e o `generateImageName` também só recebe esse nome.
 * Então `x.png` e `x.webp` — dois registros, duas imagens — geram o MESMO `x-640x336.avif`,
 * e o último a ser processado sobrescreve o do outro no bucket. No acervo migrado do WP há
 * 157 pares assim; num deles o cartão da oferta de cupom da HostGator mostrava a imagem do
 * Evolution CRM. A `capa` e o `og` têm medida fixa, então com eles QUALQUER par colide, não
 * só os de mesma proporção.
 *
 * A regra é uma só: dois registros não dividem o nome-base. O hook da coleção a aplica no
 * upload; o `regenera:tamanhos`, no acervo que já existe.
 */

/** O nome sem a última extensão: é dele que o Payload tira o nome de cada derivado. */
export function nomeBase(arquivo: string): string {
  const i = arquivo.lastIndexOf('.')
  return i > 0 ? arquivo.slice(0, i) : arquivo
}

function extensao(arquivo: string): string {
  const i = arquivo.lastIndexOf('.')
  return i > 0 ? arquivo.slice(i) : ''
}

/**
 * O próprio nome, se nenhum outro registro usa o nome-base; senão `{base}-1`, `{base}-2`…
 * O número vai no FIM do nome inteiro: o Payload soma 1 a um número que já esteja lá, o que
 * transformaria `relatorio-2026` em `relatorio-2027`.
 *
 * Maiúscula e minúscula são nomes diferentes: a chave no bucket distingue.
 */
export function nomeLivre(arquivo: string, basesOcupadas: ReadonlySet<string>): string {
  const base = nomeBase(arquivo)
  if (!basesOcupadas.has(base)) return arquivo
  let n = 1
  while (basesOcupadas.has(`${base}-${n}`)) n += 1
  return `${base}-${n}${extensao(arquivo)}`
}

export interface MidiaComNome {
  id: number | string
  filename?: string | null
  sizes?: Record<string, { filename?: string | null } | null | undefined> | null
}

/** Tem derivado de medida fixa (`capa`, `og`) gravado — colide com QUALQUER outro do mesmo nome-base. */
const temDerivadoFixo = (m: MidiaComNome) => Boolean(m.sizes?.capa?.filename || m.sizes?.og?.filename)

/**
 * Quais registros da rodada de regeneração precisam de nome novo, e qual.
 *
 * Um registro da rodada muda de nome quando, depois da rodada, outro registro estaria
 * gerando derivados com o mesmo nome-base: outro da rodada que já ficou com esse nome (o
 * de menor id fica — a ordem é por id), ou um de FORA da rodada que já tem `capa` ou `og`.
 *
 * Um de fora que só tem `cartao` não força troca: o da rodada reescreve o cartão
 * compartilhado com a imagem dele, que é a que aparece no site (quem está fora da rodada
 * não é capa, nem oferta, nem hero). É o caso de 64 dos 157 pares do acervo.
 */
export function planoDeRenomeacao(opts: {
  acervo: readonly MidiaComNome[]
  rodada: ReadonlyArray<number | string>
}): Map<number | string, string> {
  const naRodada = new Set(opts.rodada.map(String))
  const ocupadas = new Set<string>()
  /** nome-base → quem vai gerar derivados com ele depois da rodada */
  const dono = new Map<string, number | string>()
  for (const m of opts.acervo) {
    if (!m.filename) continue
    ocupadas.add(nomeBase(m.filename))
    if (!naRodada.has(String(m.id)) && temDerivadoFixo(m)) dono.set(nomeBase(m.filename), m.id)
  }

  const plano = new Map<number | string, string>()
  const daRodada = opts.acervo
    .filter((m) => m.filename && naRodada.has(String(m.id)))
    .sort((a, b) => Number(a.id) - Number(b.id))
  for (const m of daRodada) {
    const base = nomeBase(m.filename!)
    if (!dono.has(base)) {
      dono.set(base, m.id)
      continue
    }
    const novo = nomeLivre(m.filename!, ocupadas)
    ocupadas.add(nomeBase(novo))
    dono.set(nomeBase(novo), m.id)
    plano.set(m.id, novo)
  }
  return plano
}
