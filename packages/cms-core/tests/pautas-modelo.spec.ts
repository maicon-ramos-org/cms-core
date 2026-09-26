import { describe, expect, it } from 'vitest'
import { avancarPauta, classificarFalhaPauta, falharPauta, ESTADOS_PAUTA, ETAPAS_PAUTA, PAPEIS_PAUTA, FALHAS_PAUTA, FORMATO_ARTIGO_PAUTA, registrarFormatoPauta, type EstadoOperacionalPauta } from '../src/pautas'

const agora = new Date('2026-09-26T12:00:00Z')
const formato = registrarFormatoPauta({ slug: 'comparativo', intencao: 'comparar', etapas: ['candidate', 'research', 'catalog', 'write', 'capa', 'review', 'publish'] })
const pauta = (): EstadoOperacionalPauta => ({ estado: 'candidate', papel: 'planner', tentativas: 0, proxima_em: agora.toISOString(), estado_de_retorno: null, falha: null })
const comando = () => ({ agora, estado_esperado: 'candidate' as const, papel: 'planner' as const })
const diagnostico = { mensagem: 'Falta artefato documentado.' }

describe('contrato de formato puro e imutável', () => {
  it('artigo não inventa etapa catalog e formato é copiado/congelado', () => {
    expect(FORMATO_ARTIGO_PAUTA.etapas).not.toContain('catalog')
    const etapas = ['candidate', 'research', 'write', 'capa', 'review', 'publish'] as const
    const r = registrarFormatoPauta({ slug: 'guia', intencao: 'aprender', etapas })
    expect(r.etapas).not.toBe(etapas)
    expect(Object.isFrozen(r)).toBe(true)
    expect(Object.isFrozen(r.etapas)).toBe(true)
    for (const valores of [ESTADOS_PAUTA, ETAPAS_PAUTA, PAPEIS_PAUTA, FALHAS_PAUTA]) expect(Object.isFrozen(valores)).toBe(true)
  })
  it.each([
    ['candidate', 'write', 'research', 'review', 'publish'],
    ['candidate', 'research', 'write', 'write', 'review', 'publish'],
    ['research', 'write', 'review', 'publish'],
    ['candidate', 'research', 'write', 'publish'],
  ].map(etapas => ({ etapas })))('recusa etapas fora de ordem/duplicadas/incompletas: %j', ({ etapas }) => {
    expect(() => registrarFormatoPauta({ slug: 'guia', intencao: 'aprender', etapas: etapas as never })).toThrow()
  })
})

describe('avanço puro não publica nem atesta entrega', () => {
  it('avança uma aresta, preserva tentativas e não altera entrada', () => {
    const p = pauta(), antes = structuredClone(p)
    const r = avancarPauta(p, formato, { ...comando(), para: 'research', precondicoes: { satisfeitas: true } })
    expect(r).toMatchObject({ estado: 'research', papel: 'researcher', tentativas: 0, ultima_transicao_em: agora.toISOString() })
    expect(p).toEqual(antes)
    expect(r).not.toHaveProperty('prioridade')
    expect(r).not.toHaveProperty('verificacao')
  })
  it.each(['write', 'publish', 'live_verified', 'retired'])('não pula para %s', para => {
    expect(() => avancarPauta(pauta(), formato, { ...comando(), para: para as never, precondicoes: { satisfeitas: true } })).toThrow()
  })
  it('estado esperado divergente sinaliza conflito e papel autodeclarado divergente falha', () => {
    expect(() => avancarPauta(pauta(), formato, { ...comando(), estado_esperado: 'research', para: 'research', precondicoes: { satisfeitas: true } }))
      .toThrow(expect.objectContaining({ codigo: 'estado_desatualizado' }))
    expect(() => avancarPauta(pauta(), formato, { ...comando(), papel: 'writer', para: 'research', precondicoes: { satisfeitas: true } })).toThrow()
  })
  it.each([null, 'inválida', '2026-09-26T12:00:01Z'])('data elegível %s não permite execução', proxima_em => {
    expect(() => avancarPauta({ ...pauta(), proxima_em }, formato, { ...comando(), para: 'research', precondicoes: { satisfeitas: true } })).toThrow()
  })
  it('pré-condição pendente ou contraditória não avança; relógio inválido não inventa now', () => {
    for (const precondicoes of [{ satisfeitas: false }, { satisfeitas: true, problemas: ['Capa ausente.'] }]) {
      expect(() => avancarPauta(pauta(), formato, { ...comando(), para: 'research', precondicoes })).toThrow()
    }
    expect(() => avancarPauta(pauta(), formato, { ...comando(), agora: new Date('inválida'), para: 'research', precondicoes: { satisfeitas: true } })).toThrow()
  })
  it('config malformada não pula review mesmo sem passar pelo registrador', () => {
    expect(() => avancarPauta(pauta(), { slug: 'atalho', intencao: 'aprender', etapas: ['candidate', 'publish'] },
      { ...comando(), para: 'publish', precondicoes: { satisfeitas: true } })).toThrow()
  })
})

describe('oito falhas classificadas preservam semântica da origem', () => {
  it.each([
    ['template_error', diagnostico, 'write', false, false],
    ['missing_required_data', { ...diagnostico, destino: 'catalog' }, 'catalog', false, false],
    ['invalid_offer', { ...diagnostico, oferta: '9007199254740993' }, 'catalog', false, false],
    ['gate_rejected', { ...diagnostico, destino: 'research' }, 'research', false, false],
    ['render_verification_failed', { ...diagnostico, destino: 'review' }, 'review', false, false],
    ['external_credential_missing', diagnostico, 'write', true, false],
    ['policy_precedent_required', diagnostico, 'write', true, false],
    ['retired_no_viable_path', diagnostico, 'write', false, true],
  ] as const)('%s tem destino explícito e não arredonda ID legado', (codigo, detalhe, destino, escalacao, aposentar) => {
    expect(classificarFalhaPauta(codigo, 'write', detalhe, formato)).toEqual({ destino, escalacao, aposentar })
  })
  it('recovery de catálogo mantém cataloger, como os 22 registros do snapshot', () => {
    const r = falharPauta({ ...pauta(), estado: 'research', papel: 'researcher' }, formato,
      { ...comando(), estado_esperado: 'research', papel: 'researcher', codigo: 'missing_required_data', detalhe: { ...diagnostico, destino: 'catalog' } })
    expect(r).toMatchObject({ estado: 'recovery', papel: 'cataloger', estado_de_retorno: 'catalog', tentativas: 1, proxima_em: '2026-09-26T12:05:00.000Z' })
    const recuperada = avancarPauta(r, formato, { agora: new Date('2026-09-26T12:05:00Z'), estado_esperado: 'recovery', papel: 'cataloger', para: 'catalog', precondicoes: { satisfeitas: true } })
    expect(recuperada).toMatchObject({ estado: 'catalog', papel: 'cataloger', falha: null, estado_de_retorno: null, tentativas: 1 })
  })
  it.each(['external_credential_missing', 'policy_precedent_required', 'retired_no_viable_path'] as const)('%s não agenda retry automático', codigo => {
    const r = falharPauta(pauta(), formato, { ...comando(), codigo, detalhe: diagnostico })
    expect(r.papel).toBe('operator')
    expect(r.proxima_em).toBeNull()
    expect(() => avancarPauta(r, formato, { agora, estado_esperado: r.estado, papel: 'operator', para: 'candidate', precondicoes: { satisfeitas: true } })).toThrow()
  })
  it('diagnóstico e destinos não são adivinhados; artigo sem catalog não aceita essa recuperação', () => {
    expect(() => classificarFalhaPauta('missing_required_data', 'write', diagnostico, formato)).toThrow()
    expect(() => classificarFalhaPauta('template_error', 'write', { ...diagnostico, destino: 'research' }, formato)).toThrow()
    expect(() => classificarFalhaPauta('invalid_offer', 'write', diagnostico, formato)).toThrow()
    expect(() => classificarFalhaPauta('invalid_offer', 'write', { ...diagnostico, oferta: 9007199254740992 }, formato)).toThrow()
    expect(() => classificarFalhaPauta('invalid_offer', 'write', { ...diagnostico, oferta: '1' }, FORMATO_ARTIGO_PAUTA)).toThrow()
    expect(() => classificarFalhaPauta('gate_rejected', 'write', { ...diagnostico, destino: 'publish' }, formato)).toThrow()
  })
  it.each([-1, 86401, 0.5])('retry %s não muda estado', retry_segundos => {
    expect(() => falharPauta(pauta(), formato, { ...comando(), codigo: 'template_error', detalhe: diagnostico, retry_segundos })).toThrow()
  })
  it('não compartilha objeto do diagnóstico entre comando e mudança calculada', () => {
    const detalhe = { mensagem: 'Diagnóstico original.' }
    const r = falharPauta(pauta(), formato, { ...comando(), codigo: 'template_error', detalhe })
    detalhe.mensagem = 'Alteração posterior no chamador.'
    expect(r.falha!.detalhe.mensagem).toBe('Diagnóstico original.')
  })
})
