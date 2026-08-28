/**
 * Composição de desconto: o que a LOJA já dá + o que o NOSSO cupom acrescenta.
 * Contrato: spec-desconto-e-historico.md §1.
 *
 * A regra que dá razão a este módulo existir: "70% da loja + 10% do cupom" NÃO é 77%
 * (número que apareceu num mockup). É 73% se o cupom incide sobre o preço já descontado
 * ou 80% se incide sobre o cheio — depende de um DADO (`aplica_sobre`), não de palpite.
 * Sem esse dado, devolvemos null e a página mostra os dois descontos separados: nunca
 * um total inventado, e nunca escondendo o que se sabe.
 */

export interface DescontoDaLoja {
  valor?: number | null
  tipo?: 'percentual' | 'valor' | null
  /** obrigatório junto com o valor: desconto sem timestamp não existe */
  verificado_em?: string | null
}

export interface CupomParaCompor {
  desconto_valor?: number | null
  desconto_tipo?: string | null
  aplica_sobre?: 'preco_cheio' | 'preco_ja_descontado' | 'desconhecido' | null
}

export interface DescontoComposto {
  /** percentual efetivo, sempre arredondado PRA BAIXO */
  total_pct: number
  /** as partes, pra decomposição ("70% da loja + 10% nosso cupom") */
  parcelas: Array<{ rotulo: string; valor_pct: number }>
}

/** Percentual válido pra compor: fora de 1–95 não entra (0 não é desconto). */
const percentualUtil = (v: unknown): v is number => typeof v === 'number' && v >= 1 && v <= 95

export function compor(
  descontoLoja: DescontoDaLoja | null | undefined,
  cupom: CupomParaCompor | null | undefined,
): DescontoComposto | null {
  if (!descontoLoja || !cupom) return null
  // desconto da loja sem timestamp não é dado confiável (mesma régua de produtos.preco)
  if (!descontoLoja.verificado_em) return null
  // valor fixo não compõe com percentual sem conhecer o preço base
  if (descontoLoja.tipo !== 'percentual' || cupom.desconto_tipo !== 'percentual') return null
  if (!percentualUtil(descontoLoja.valor) || !percentualUtil(cupom.desconto_valor)) return null

  const a = descontoLoja.valor / 100
  const b = cupom.desconto_valor / 100

  let total: number
  if (cupom.aplica_sobre === 'preco_ja_descontado') {
    total = 1 - (1 - a) * (1 - b)
  } else if (cupom.aplica_sobre === 'preco_cheio') {
    total = Math.min(a + b, 0.95)
  } else {
    // 'desconhecido' (ou ausente): não dá pra afirmar o total
    return null
  }

  return {
    // pra baixo SEMPRE: nunca prometer mais do que entrega
    total_pct: Math.floor(total * 100),
    parcelas: [
      { rotulo: 'da loja', valor_pct: descontoLoja.valor },
      { rotulo: 'nosso cupom', valor_pct: cupom.desconto_valor },
    ],
  }
}
