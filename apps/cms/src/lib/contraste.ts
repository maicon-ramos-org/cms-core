/**
 * Contraste WCAG 2.x — a mesma fórmula que o Lighthouse usa.
 *
 * Existe porque as cores do design system são DADO editável do tenant: sem uma régua no
 * schema, alguém grava um valor que reprova e ninguém percebe até o Lighthouse acusar em
 * produção. Regra 4 do design-tokens.md: "falhou, não sobe".
 */

/** #rgb ou #rrggbb → [r,g,b] 0-255. Devolve null pro que não é hex. */
export function hexParaRgb(hex: string): [number, number, number] | null {
  const limpo = hex.trim().replace(/^#/, '')
  const completo =
    limpo.length === 3
      ? limpo
          .split('')
          .map((c) => c + c)
          .join('')
      : limpo
  if (!/^[0-9a-fA-F]{6}$/.test(completo)) return null
  return [
    parseInt(completo.slice(0, 2), 16),
    parseInt(completo.slice(2, 4), 16),
    parseInt(completo.slice(4, 6), 16),
  ]
}

/** Luminância relativa (WCAG 2.x). */
export function luminancia([r, g, b]: [number, number, number]): number {
  const canal = (v: number): number => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

/** Razão de contraste entre duas cores hex. null se alguma não for hex válido. */
export function contraste(corA: string, corB: string): number | null {
  const a = hexParaRgb(corA)
  const b = hexParaRgb(corB)
  if (!a || !b) return null
  const la = luminancia(a)
  const lb = luminancia(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Pares que o design-tokens.md v1.1 marca como críticos, com o mínimo de cada um.
 *
 * Os cinco últimos entraram com o tema escuro (PRD 12 RF4). Não são zelo extra: no tema
 * claro `cor_fundo` e `cor_superficie` são os dois o mesmo branco, então "texto no fundo
 * da página" vinha coberto de graça pelo par do cartão. No escuro os dois divergem — a
 * página é mais escura que o cartão —, e o par que ninguém media passa a ser justamente o
 * que pode reprovar.
 */
export const PARES_CRITICOS: Array<{ frente: string; fundo: string; minimo: number; rotulo: string }> = [
  { frente: 'cor_sobre_acao', fundo: 'cor_acao', minimo: 4.5, rotulo: 'texto do botão de monetização' },
  { frente: 'cor_texto', fundo: 'cor_superficie', minimo: 4.5, rotulo: 'texto do corpo' },
  { frente: 'cor_apoio', fundo: 'cor_superficie_marca', minimo: 4.5, rotulo: 'texto de apoio na superfície de marca' },
  { frente: 'cor_verificado', fundo: 'cor_superficie_verificado', minimo: 4.5, rotulo: 'selo de verificação' },
  { frente: 'cor_desconto', fundo: 'cor_superficie', minimo: 3.0, rotulo: 'número do desconto (texto grande)' },
  { frente: 'cor_primaria', fundo: 'cor_superficie', minimo: 4.5, rotulo: 'link e marca' },
  { frente: 'cor_sobre_marca', fundo: 'cor_primaria', minimo: 4.5, rotulo: 'texto sobre a marca (chip ativo, CTA)' },
  { frente: 'cor_texto', fundo: 'cor_fundo', minimo: 4.5, rotulo: 'texto do corpo no fundo da página' },
  { frente: 'cor_apoio', fundo: 'cor_superficie', minimo: 4.5, rotulo: 'texto de apoio na superfície' },
  { frente: 'cor_sutil', fundo: 'cor_fundo', minimo: 4.5, rotulo: 'trilha e placeholder no fundo da página' },
  { frente: 'cor_aviso', fundo: 'cor_superficie_expirado', minimo: 4.5, rotulo: 'aviso no bloco de expirados' },
]

/**
 * Os dois conjuntos de valores que os papéis acima podem assumir. Um tenant tem uma paleta
 * clara e (se ligada) uma escura; a régua é a MESMA para as duas — é isso que separa
 * "tema escuro" de "filtro por cima do claro".
 */
export const GRUPOS_DE_TEMA = ['tema', 'tema_escuro'] as const
export type GrupoDeTema = (typeof GRUPOS_DE_TEMA)[number]
