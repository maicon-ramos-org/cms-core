/**
 * As duas paletas de um tenant, resolvidas em valores concretos (PRD 12).
 *
 * Existe como módulo PURO, e não como bloco de `??` dentro do `Base.astro`, por dois
 * motivos: dá pra testar sem levantar container de renderização, e o fallback de cada
 * papel fica em UM lugar — quando um tenant novo sobe com o tema meio preenchido, é aqui
 * que se lê o que ele vai receber.
 *
 * Os padrões espelham `apps/cms/src/collections/Tenants.ts`. A duplicação é deliberada e
 * tem limite claro: o site NUNCA pode depender do CMS estar de pé pra saber pintar a
 * página, e um tenant recém-criado com campo vazio não pode servir texto sem cor. O teste
 * `tema.spec.ts` guarda o único risco real dessa cópia, que é ela divergir em algum papel.
 */

/** Os papéis de cor do design system — a mesma lista dos dois lados. */
export interface Paleta {
  cor_primaria: string
  cor_sobre_marca: string
  cor_fundo: string
  cor_acao: string
  cor_sobre_acao: string
  cor_desconto: string
  cor_verificado: string
  cor_texto: string
  cor_apoio: string
  cor_sutil: string
  cor_superficie: string
  cor_superficie_marca: string
  cor_superficie_verificado: string
  cor_borda: string
  cor_borda_codigo: string
  cor_superficie_expirado: string
  cor_aviso: string
}

export const PAPEIS = [
  'cor_primaria',
  'cor_sobre_marca',
  'cor_fundo',
  'cor_acao',
  'cor_sobre_acao',
  'cor_desconto',
  'cor_verificado',
  'cor_texto',
  'cor_apoio',
  'cor_sutil',
  'cor_superficie',
  'cor_superficie_marca',
  'cor_superficie_verificado',
  'cor_borda',
  'cor_borda_codigo',
  'cor_superficie_expirado',
  'cor_aviso',
] as const satisfies ReadonlyArray<keyof Paleta>

/** design-tokens.md v1.0.0 — auditado WCAG AA. */
export const PADRAO_CLARO: Paleta = {
  cor_primaria: '#6F57D3',
  cor_sobre_marca: '#ffffff',
  cor_fundo: '#ffffff',
  cor_acao: '#07C03B',
  cor_sobre_acao: '#04240b',
  cor_desconto: '#AC0167',
  cor_verificado: '#0a7a2c',
  cor_texto: '#242424',
  cor_apoio: '#6b6b6b',
  cor_sutil: '#746a90',
  cor_superficie: '#ffffff',
  cor_superficie_marca: '#faf9ff',
  cor_superficie_verificado: '#f4fdf7',
  cor_borda: '#e7e4f0',
  cor_borda_codigo: '#cbbff0',
  cor_superficie_expirado: '#f4f6f9',
  cor_aviso: '#9a5b08',
}

/** PRD 12 — paleta escura de referência, auditada nos mesmos 11 pares críticos. */
export const PADRAO_ESCURO: Paleta = {
  cor_primaria: '#B5A5F5',
  cor_sobre_marca: '#17132A',
  cor_fundo: '#121019',
  cor_acao: '#22C55E',
  cor_sobre_acao: '#062B12',
  cor_desconto: '#FF6FB1',
  cor_verificado: '#4ADE80',
  cor_texto: '#ECE9F5',
  cor_apoio: '#A9A2BD',
  cor_sutil: '#948DB0',
  cor_superficie: '#1B1826',
  cor_superficie_marca: '#221E33',
  cor_superficie_verificado: '#10261A',
  cor_borda: '#2E2A42',
  cor_borda_codigo: '#4A3F78',
  cor_superficie_expirado: '#191725',
  cor_aviso: '#F0B45E',
}

type PaletaParcial = Partial<Record<keyof Paleta, unknown>> | null | undefined

/** Preenche o que o tenant não gravou. Valor que não é string cai no padrão, não vaza. */
export const resolvePaleta = (tema: PaletaParcial, padrao: Paleta): Paleta => {
  const saida = {} as Paleta
  for (const papel of PAPEIS) {
    const valor = tema?.[papel]
    saida[papel] = typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : padrao[papel]
  }
  return saida
}

/**
 * O escuro sai por opção do tenant, nunca por dedução. Tenant sem paleta curada serve só o
 * claro e declara `color-scheme: light` — melhor um site claro numa tela escura do que um
 * escuro chutado, que é onde nascem os cinzas ilegíveis.
 */
export const temaEscuroAtivo = (tenant: { tema_escuro?: { ativo?: boolean | null } | null }): boolean =>
  tenant.tema_escuro?.ativo === true

/**
 * Sombra é preto neutro com alfa, não decisão de marca — por isso não é campo do tenant
 * (PRD 12 D3). O escuro precisa de MAIS alfa: a mesma sombra que separa um cartão branco
 * do fundo branco é literalmente invisível entre dois tons de quase-preto.
 */
export const SOMBRAS = {
  claro: { suave: 'rgb(0 0 0 / 0.12)', media: 'rgb(0 0 0 / 0.16)', forte: 'rgb(0 0 0 / 0.25)' },
  escuro: { suave: 'rgb(0 0 0 / 0.40)', media: 'rgb(0 0 0 / 0.55)', forte: 'rgb(0 0 0 / 0.70)' },
} as const
