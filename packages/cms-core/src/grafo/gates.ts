/** Funções puras: o relógio e as evidências são fornecidos pelo servidor. */
export type RegistroGrafo = Record<string, unknown>
export interface ProblemaGate {
  gate: string
  severidade: 'P0' | 'P1'
  path: string
  mensagem: string
}
export interface ConfigGates {
  ativo?: boolean
  g1?: boolean
  g2?: boolean
  g3?: boolean
  g4?: boolean
  qualidade_minima?: number
  palavras_minimas?: number
}
export interface ClaimGate {
  id: string | number
  texto: string
  ano_ancora?: number | null
  status: string
  fonte: { url: string }
}
export interface EntradaGates {
  agora: Date
  config: ConfigGates
  post: RegistroGrafo
  pesquisa?: { qualidade?: number; validade_dias?: number; updatedAt?: string }
  claims: ClaimGate[]
}

const normaliza = (texto: string) => texto.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
const prosa = (md: string) => md.replace(/```[\s\S]*?```/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`>#]/g, '')
const links = (md: string) => [
  ...Array.from(md.matchAll(/(?<!!)\[[^\]]*\]\((https?:\/\/[^\s)]+)(?:\s+[^)]*)?\)/g), m => m[1]!),
  ...Array.from(md.matchAll(/<(https?:\/\/[^>\s]+)>/g), m => m[1]!),
]
const SLOP = ['mergulhe', 'neste artigo vamos', 'vamos explorar', 'desvende', 'desbloqueie',
  'potencialize', 'é importante ressaltar', 'vale ressaltar', 'em suma', 'nos dias de hoje',
  'no mundo de hoje', 'game changer', 'divisor de águas', 'não é segredo', 'sem mais delongas']

export function avaliarGates({ agora, config, post, pesquisa, claims }: EntradaGates): ProblemaGate[] {
  if (!config.ativo) return []
  const problemas: ProblemaGate[] = []
  const erro = (gate: string, path: string, mensagem: string) => problemas.push({ gate, severidade: 'P0', path, mensagem })
  const corpo = typeof post.corpo_md === 'string' ? post.corpo_md : ''
  const paragrafos = corpo.replace(/```[\s\S]*?```/g, '').split(/\n\s*\n/).filter(Boolean)

  if (config.g1 !== false) {
    const atualizado = Date.parse(pesquisa?.updatedAt ?? '')
    const validade = pesquisa?.validade_dias ?? 0
    const idade = agora.getTime() - atualizado
    if (!pesquisa || !Number.isFinite(pesquisa.qualidade) || pesquisa.qualidade! < (config.qualidade_minima ?? 70)
      || !Number.isFinite(idade) || idade < 0 || validade <= 0 || idade > validade * 86_400_000) {
      erro('G1', 'entidades', 'Entidade principal exige pesquisa vigente com qualidade suficiente.')
    }
  }
  if (config.g2 !== false) {
    if (!claims.length) erro('G2', 'claims', 'Vincule uma claim com fonte antes de publicar.')
    for (const claim of claims) {
      const citada = paragrafos.some(p => {
        const texto = normaliza(prosa(p))
        return Boolean(claim.texto.trim()) && texto.includes(normaliza(claim.texto))
          && claim.ano_ancora != null && new RegExp(`\\b${claim.ano_ancora}\\b`).test(texto)
          && links(p).includes(claim.fonte.url)
      })
      if (claim.status !== 'vigente' || !citada) erro('G2', 'claims', `Claim ${claim.id} exige status vigente, texto, ano e link inline da fonte no mesmo parágrafo.`)
    }
    for (const p of paragrafos) {
      if (/\b\d+(?:[.,]\d+)?\s*%/.test(prosa(p)) && !claims.some(c => links(p).includes(c.fonte.url))) {
        erro('G2', 'corpo', 'Estatística percentual sem citação de fonte de uma claim ligada no parágrafo.')
      }
    }
  }
  if (config.g3 !== false) {
    const texto = normaliza(prosa(corpo))
    for (const expressao of SLOP) if (texto.includes(expressao)) erro('G3', 'corpo', `Expressão editorial bloqueada: ${expressao}.`)
    const h2 = Array.from(corpo.matchAll(/^##\s+(.+)$/gm), m => m[1]!.trim())
    if (h2.length >= 3 && h2.filter(h => h.endsWith('?')).length / h2.length > 0.7) erro('G3', 'corpo', 'Mais de 70% dos H2 são perguntas.')
  }
  if (config.g4 !== false) {
    const meta = post.meta as { title?: string; description?: string } | undefined
    const titulo = typeof meta?.title === 'string' && meta.title ? meta.title : String(post.titulo ?? '')
    const descricao = typeof meta?.description === 'string' ? meta.description : ''
    if (titulo.length < 30 || titulo.length > 65) erro('G4', 'meta.title', 'Título deve ter entre 30 e 65 caracteres.')
    if (descricao.length < 70 || descricao.length > 200) erro('G4', 'meta.description', 'Descrição deve ter entre 70 e 200 caracteres.')
    if (prosa(corpo).split(/\s+/).filter(Boolean).length < (config.palavras_minimas ?? 250)) erro('G4', 'corpo', 'Corpo abaixo do mínimo de palavras configurado.')
    if (/^#\s/m.test(corpo)) erro('G4', 'corpo', 'H1 pertence ao template, não ao corpo.')
    if (!post.capa) erro('G4', 'capa', 'Capa própria obrigatória.')
  }
  return problemas
}
