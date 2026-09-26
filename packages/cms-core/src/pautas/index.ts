/** Domínio puro. Tenant, autorização, artefatos, locks e persistência pertencem ao servidor. */
export const ETAPAS_PAUTA = Object.freeze(['candidate', 'research', 'catalog', 'write', 'capa', 'review', 'publish'] as const)
export const ESTADOS_PAUTA = Object.freeze([...ETAPAS_PAUTA, 'live_verified', 'recovery', 'retired'] as const)
export const PAPEIS_PAUTA = Object.freeze(['planner', 'researcher', 'cataloger', 'writer', 'designer', 'reviewer', 'publisher', 'operator', 'verifier'] as const)
export const FALHAS_PAUTA = Object.freeze(['template_error', 'missing_required_data', 'invalid_offer', 'gate_rejected', 'render_verification_failed', 'external_credential_missing', 'policy_precedent_required', 'retired_no_viable_path'] as const)
export type EtapaPauta = typeof ETAPAS_PAUTA[number]
export type EstadoPauta = typeof ESTADOS_PAUTA[number]
export type PapelPauta = typeof PAPEIS_PAUTA[number]
export type FalhaPauta = typeof FALHAS_PAUTA[number]
export interface FormatoPauta {
  slug: string
  intencao: 'aprender' | 'comparar' | 'resolver' | 'comprar'
  etapas: readonly EtapaPauta[]
}
const papelEtapa: Readonly<Record<EtapaPauta, PapelPauta>> = Object.freeze({ candidate: 'planner', research: 'researcher', catalog: 'cataloger', write: 'writer', capa: 'designer', review: 'reviewer', publish: 'publisher' })
export class ErroPauta extends Error {
  constructor(readonly codigo: 'contrato_invalido' | 'estado_desatualizado' | 'papel_invalido' | 'transicao_invalida' | 'aguardando_elegibilidade' | 'precondicao_pendente', mensagem: string) {
    super(mensagem); this.name = 'ErroPauta'
  }
}
const invalido = (mensagem: string): never => { throw new ErroPauta('contrato_invalido', mensagem) }

export function registrarFormatoPauta(formato: FormatoPauta): Readonly<FormatoPauta> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(formato.slug) || !['aprender', 'comparar', 'resolver', 'comprar'].includes(formato.intencao)
    || !Array.isArray(formato.etapas) || !['candidate', 'research', 'write', 'capa', 'review', 'publish'].every(e => formato.etapas.includes(e as EtapaPauta))) {
    return invalido('Formato exige slug, intenção e etapas editoriais essenciais.')
  }
  let anterior = -1
  for (const etapa of formato.etapas) {
    const indice = ETAPAS_PAUTA.indexOf(etapa)
    if (indice <= anterior) return invalido('Etapas devem seguir a ordem editorial, sem repetição ou estado terminal.')
    anterior = indice
  }
  return Object.freeze({ slug: formato.slug, intencao: formato.intencao, etapas: Object.freeze([...formato.etapas]) })
}
export const FORMATO_ARTIGO_PAUTA = registrarFormatoPauta({ slug: 'artigo', intencao: 'aprender', etapas: ['candidate', 'research', 'write', 'capa', 'review', 'publish'] })

export interface DetalheFalhaPauta { mensagem: string; destino?: EtapaPauta; oferta?: string | number }
export interface EstadoOperacionalPauta {
  estado: EstadoPauta
  papel: PapelPauta
  tentativas: number
  proxima_em: string | null
  estado_de_retorno: EtapaPauta | null
  falha: { codigo: FalhaPauta; detalhe: DetalheFalhaPauta } | null
}
export interface ComandoPauta { estado_esperado: EstadoPauta; papel: PapelPauta; agora: Date }
export interface MudancaPauta extends EstadoOperacionalPauta { ultima_transicao_em: string }
const escalacao = (codigo: FalhaPauta) => codigo === 'external_credential_missing' || codigo === 'policy_precedent_required'

export function classificarFalhaPauta(codigo: FalhaPauta, atual: EtapaPauta, detalhe: DetalheFalhaPauta, formato: FormatoPauta) {
  registrarFormatoPauta(formato)
  if (!FALHAS_PAUTA.includes(codigo) || !formato.etapas.includes(atual) || typeof detalhe.mensagem !== 'string' || !detalhe.mensagem.trim()) {
    return invalido('Falha exige código conhecido, etapa do formato e diagnóstico explícito.')
  }
  const permitidos: Partial<Record<FalhaPauta, readonly EtapaPauta[]>> = {
    missing_required_data: ['research', 'catalog'], gate_rejected: ['research', 'catalog', 'write', 'capa'], render_verification_failed: ['publish', 'review'],
  }
  let destino = atual
  const destinos = permitidos[codigo]
  if (destinos) {
    if (!detalhe.destino || !destinos.includes(detalhe.destino)) return invalido('Diagnóstico deve indicar uma etapa de retorno permitida.')
    destino = detalhe.destino
  } else if (detalhe.destino !== undefined) return invalido('Esta falha tem destino fixo, não aceita retorno arbitrário.')
  if (codigo === 'invalid_offer') {
    const id = detalhe.oferta
    if (!(typeof id === 'number' ? Number.isSafeInteger(id) && id > 0 : typeof id === 'string' && Boolean(id.trim()))) return invalido('Oferta inválida exige ID exato da oferta afetada.')
    destino = 'catalog'
  } else if (detalhe.oferta !== undefined) return invalido('ID de oferta pertence apenas à falha invalid_offer.')
  if (!formato.etapas.includes(destino)) return invalido('Destino de recuperação não existe neste formato.')
  return { destino, escalacao: escalacao(codigo), aposentar: codigo === 'retired_no_viable_path' }
}

function validaComando(pauta: EstadoOperacionalPauta, formato: FormatoPauta, comando: ComandoPauta): number {
  registrarFormatoPauta(formato)
  const agora = comando.agora.getTime()
  if (!Number.isFinite(agora) || !Number.isSafeInteger(pauta.tentativas) || pauta.tentativas < 0) return invalido('Relógio e tentativas devem ser válidos.')
  if (pauta.estado !== comando.estado_esperado) throw new ErroPauta('estado_desatualizado', 'Estado mudou; releia a pauta antes de reenviar o comando.')
  if (pauta.estado === 'live_verified' || pauta.estado === 'retired') throw new ErroPauta('transicao_invalida', 'Pauta terminal exige reabertura explícita, indisponível nesta onda.')
  let papel: PapelPauta
  if (pauta.estado === 'recovery') {
    if (!pauta.falha || !FALHAS_PAUTA.includes(pauta.falha.codigo) || pauta.falha.codigo === 'retired_no_viable_path' || !pauta.estado_de_retorno || !formato.etapas.includes(pauta.estado_de_retorno)) return invalido('Recovery exige falha classificada e etapa de retorno do formato.')
    const classificada = classificarFalhaPauta(pauta.falha.codigo, pauta.estado_de_retorno, pauta.falha.detalhe, formato)
    if (classificada.destino !== pauta.estado_de_retorno) return invalido('Etapa de retorno diverge do diagnóstico classificado.')
    papel = escalacao(pauta.falha.codigo) ? 'operator' : papelEtapa[pauta.estado_de_retorno]
  } else {
    if (!formato.etapas.includes(pauta.estado) || pauta.falha || pauta.estado_de_retorno) return invalido('Estado de trabalho não pode carregar recuperação pendente.')
    papel = papelEtapa[pauta.estado]
  }
  if (pauta.papel !== papel || comando.papel !== papel) throw new ErroPauta('papel_invalido', 'Papel deve corresponder ao estado operacional persistido.')
  return agora
}

/** Retorna somente campos operacionais: não reescreve identidade, prioridade ou conteúdo. */
export function avancarPauta(pauta: EstadoOperacionalPauta, formato: FormatoPauta, comando: ComandoPauta & {
  para: EtapaPauta; precondicoes: { satisfeitas: boolean; problemas?: readonly string[] }
}): MudancaPauta {
  const agora = validaComando(pauta, formato, comando)
  const elegivel = Date.parse(pauta.proxima_em ?? '')
  if (!Number.isFinite(elegivel) || elegivel > agora || (pauta.estado === 'recovery' && escalacao(pauta.falha!.codigo))) throw new ErroPauta('aguardando_elegibilidade', 'Cooldown/intervenção externa pendente.')
  const esperada = pauta.estado === 'recovery' ? pauta.estado_de_retorno : formato.etapas[formato.etapas.indexOf(pauta.estado as EtapaPauta) + 1]
  if (!esperada || comando.para !== esperada) throw new ErroPauta('transicao_invalida', 'Avance uma etapa por vez; publish não atesta live_verified.')
  if (comando.precondicoes?.satisfeitas !== true || comando.precondicoes.problemas?.length) throw new ErroPauta('precondicao_pendente', 'Artefatos devem ser reavaliados pelo servidor antes do avanço.')
  return { estado: esperada, papel: papelEtapa[esperada], tentativas: pauta.tentativas, falha: null, estado_de_retorno: null,
    proxima_em: comando.agora.toISOString(), ultima_transicao_em: comando.agora.toISOString() }
}

export function falharPauta(pauta: EstadoOperacionalPauta, formato: FormatoPauta, comando: ComandoPauta & {
  codigo: FalhaPauta; detalhe: DetalheFalhaPauta; retry_segundos?: number
}): MudancaPauta {
  const agora = validaComando(pauta, formato, comando)
  if (!ETAPAS_PAUTA.includes(pauta.estado as EtapaPauta)) throw new ErroPauta('transicao_invalida', 'Somente etapa em execução pode registrar falha.')
  const resultado = classificarFalhaPauta(comando.codigo, pauta.estado as EtapaPauta, comando.detalhe, formato)
  const retry = comando.retry_segundos ?? 300
  if (!Number.isInteger(retry) || retry < 0 || retry > 86400 || pauta.tentativas >= Number.MAX_SAFE_INTEGER) return invalido('Retry deve ser 0–86400 segundos e contador não pode perder precisão.')
  return { estado: resultado.aposentar ? 'retired' : 'recovery', papel: resultado.escalacao || resultado.aposentar ? 'operator' : papelEtapa[resultado.destino],
    tentativas: pauta.tentativas + 1, estado_de_retorno: resultado.aposentar ? null : resultado.destino,
    falha: { codigo: comando.codigo, detalhe: structuredClone(comando.detalhe) }, ultima_transicao_em: comando.agora.toISOString(),
    proxima_em: resultado.escalacao || resultado.aposentar ? null : new Date(agora + retry * 1000).toISOString() }
}
