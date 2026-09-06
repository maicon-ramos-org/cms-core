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

/*
 * ---------------------------------------------------------------------------------------
 * Contraste WCAG — ESPELHO DE LEITURA, não a régua (PRD 13 RF6).
 *
 * Quem barra cor reprovada é o `beforeValidate` do Payload (`apps/cms/src/lib/contraste.ts`),
 * que devolve 400 com o `path` do campo. Aqui a mesma conta existe só para a página
 * `/design-system` PODER MOSTRAR a razão de cada par — um número exibido ao lado da
 * amostra vale mais que a promessa de que alguém auditou.
 *
 * A duplicação da fórmula é deliberada e barata: WCAG 2.x está congelado desde 2008 e o
 * site não pode importar do app do CMS (pacotes separados, e o site não depende do CMS pra
 * renderizar). O que PODE divergir é a lista de pares — por isso o teste confere que todo
 * par referencia papel que existe em `PAPEIS`, que é o erro real (papel renomeado, par
 * órfão), e não a fórmula.
 * ---------------------------------------------------------------------------------------
 */

/** `#rgb` ou `#rrggbb` → `[r,g,b]` 0-255. `null` no que não for hex. */
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

/** Razão de contraste entre duas cores hex. `null` se alguma não for hex válido. */
export function contraste(corA: string, corB: string): number | null {
  const a = hexParaRgb(corA)
  const b = hexParaRgb(corB)
  if (!a || !b) return null
  const la = luminancia(a)
  const lb = luminancia(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export interface ParCritico {
  frente: keyof Paleta
  fundo: keyof Paleta
  minimo: number
  rotulo: string
}

/**
 * Os 11 pares que o design-tokens.md v1.1 marca como críticos. Espelho da lista de
 * `apps/cms/src/lib/contraste.ts` — se um par entrar lá e não aqui, a página deixa de
 * mostrar, mas o CMS continua barrando. É a direção segura de divergir.
 */
export const PARES_CRITICOS: ParCritico[] = [
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
 * Papel de cor → nome do token CSS que o site usa (PRD 13 RF2).
 *
 * O `Base.astro` faz esse mesmo mapa em CSS, dentro de `:root`. Aqui ele existe em
 * DADO porque a página `/design-system` precisa emitir o mesmo conjunto de declarações
 * dentro de cada palco — e escrever a lista duas vezes é como o palco escuro passaria a
 * mostrar um papel a menos que o site sem ninguém notar.
 *
 * O teste confere que este mapa cobre exatamente `PAPEIS`: papel novo que não ganhar
 * token aqui derruba `pnpm check` em vez de virar buraco no guia.
 */
export const TOKEN_DO_PAPEL: Record<keyof Paleta, string> = {
  cor_primaria: '--rz-brand',
  cor_sobre_marca: '--rz-on-brand',
  cor_fundo: '--rz-bg',
  cor_acao: '--rz-action',
  cor_sobre_acao: '--rz-on-action',
  cor_desconto: '--rz-deal',
  cor_verificado: '--rz-verified',
  cor_texto: '--rz-ink',
  cor_apoio: '--rz-muted',
  cor_sutil: '--rz-subtle',
  cor_superficie: '--rz-surface',
  cor_superficie_marca: '--rz-surface-brand',
  cor_superficie_verificado: '--rz-surface-verificado',
  cor_borda: '--rz-borda',
  cor_borda_codigo: '--rz-borda-codigo',
  cor_superficie_expirado: '--rz-surface-expirado',
  cor_aviso: '--rz-aviso',
}

/** Uma linha por papel, no formato de declaração CSS. Usado pelos palcos do guia. */
export const declaracoesDoPalco = (
  paleta: Paleta,
  sombras: { suave: string; media: string; forte: string },
): string =>
  [
    ...PAPEIS.map((papel) => `${TOKEN_DO_PAPEL[papel]}: ${paleta[papel]};`),
    `--rz-sombra-suave: ${sombras.suave};`,
    `--rz-sombra-media: ${sombras.media};`,
    `--rz-sombra-forte: ${sombras.forte};`,
  ].join('\n    ')
