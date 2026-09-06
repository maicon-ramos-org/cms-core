/**
 * Contrato das duas paletas (PRD 12).
 *
 * O que este teste protege não dá pra ver olhando a tela: quem desenvolve olha o tema
 * claro o dia inteiro. Papel que existe só no claro, cor que o tenant deixou vazia e
 * caiu num padrão errado, paleta escura que divergiu do CMS — nada disso muda um pixel
 * no ambiente de quem escreveu o código, e tudo isso quebra a página de quem lê à noite.
 */
import { describe, expect, it } from 'vitest'

import {
  PADRAO_CLARO,
  PADRAO_ESCURO,
  PAPEIS,
  PARES_CRITICOS,
  SOMBRAS,
  TOKEN_DO_PAPEL,
  contraste,
  declaracoesDoPalco,
  resolvePaleta,
  temaEscuroAtivo,
  type Paleta,
} from '../src/lib/tema'

const EH_HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

describe('as duas paletas cobrem os mesmos papéis', () => {
  it.each(PAPEIS)('%s existe nos dois temas e é hex', (papel) => {
    expect(PADRAO_CLARO[papel], `claro.${papel}`).toMatch(EH_HEX)
    expect(PADRAO_ESCURO[papel], `escuro.${papel}`).toMatch(EH_HEX)
  })

  it('nenhum papel sobra de um lado só', () => {
    expect(Object.keys(PADRAO_ESCURO).sort()).toEqual(Object.keys(PADRAO_CLARO).sort())
    expect(Object.keys(PADRAO_CLARO).sort()).toEqual([...PAPEIS].sort())
  })

  /*
   * Copiar a paleta clara pro escuro "só pra ter os dois" é o jeito mais fácil de o tema
   * escuro existir no código e não existir na tela. Os papéis de FUNDO e TEXTO são os que
   * denunciam: se o fundo escuro for igual ao claro, não há tema escuro nenhum.
   */
  it('o escuro não é uma cópia do claro nos papéis que definem a luz', () => {
    for (const papel of ['cor_fundo', 'cor_superficie', 'cor_texto', 'cor_primaria'] as const) {
      expect(PADRAO_ESCURO[papel], papel).not.toBe(PADRAO_CLARO[papel])
    }
  })

  it('no escuro o fundo da página e a superfície do cartão são cores distintas', () => {
    // no claro os dois são o mesmo branco — é por isso que a régua ganhou pares novos
    expect(PADRAO_CLARO.cor_fundo).toBe(PADRAO_CLARO.cor_superficie)
    expect(PADRAO_ESCURO.cor_fundo).not.toBe(PADRAO_ESCURO.cor_superficie)
  })
})

describe('resolvePaleta preenche o que o tenant não gravou', () => {
  it('usa o valor do tenant quando ele existe', () => {
    const p = resolvePaleta({ cor_primaria: '#123456' }, PADRAO_CLARO)
    expect(p.cor_primaria).toBe('#123456')
  })

  it('cai no padrão em campo ausente, vazio ou só espaço', () => {
    const p = resolvePaleta({ cor_primaria: '', cor_texto: '   ' }, PADRAO_CLARO)
    expect(p.cor_primaria).toBe(PADRAO_CLARO.cor_primaria)
    expect(p.cor_texto).toBe(PADRAO_CLARO.cor_texto)
  })

  /*
   * O CMS devolve `null` em campo de grupo nunca preenchido. Sem esta guarda o token sai
   * como `--rz-ink: null` — que o navegador descarta, deixando o texto na cor herdada.
   * Em tema escuro isso é texto preto em fundo preto.
   */
  it('valor que não é string não vaza pro CSS', () => {
    const p = resolvePaleta({ cor_texto: null, cor_apoio: 42, cor_fundo: undefined }, PADRAO_ESCURO)
    expect(p.cor_texto).toBe(PADRAO_ESCURO.cor_texto)
    expect(p.cor_apoio).toBe(PADRAO_ESCURO.cor_apoio)
    expect(p.cor_fundo).toBe(PADRAO_ESCURO.cor_fundo)
  })

  it('tenant sem tema nenhum ainda recebe as 17 cores', () => {
    const p = resolvePaleta(null, PADRAO_ESCURO)
    for (const papel of PAPEIS) expect(p[papel], papel).toMatch(EH_HEX)
  })

  it('devolve só os papéis conhecidos — campo estranho do CMS não vira token', () => {
    const p = resolvePaleta({ cor_inventada: '#fff' } as Partial<Record<keyof Paleta, unknown>>, PADRAO_CLARO)
    expect(Object.keys(p).sort()).toEqual([...PAPEIS].sort())
  })
})

describe('o escuro é opção do tenant, não dedução', () => {
  it('só liga com `ativo` explicitamente verdadeiro', () => {
    expect(temaEscuroAtivo({ tema_escuro: { ativo: true } })).toBe(true)
    expect(temaEscuroAtivo({ tema_escuro: { ativo: false } })).toBe(false)
    expect(temaEscuroAtivo({ tema_escuro: { ativo: null } })).toBe(false)
    expect(temaEscuroAtivo({ tema_escuro: {} })).toBe(false)
    expect(temaEscuroAtivo({})).toBe(false)
  })
})

describe('sombra', () => {
  /*
   * A sombra do tema claro sobre fundo escuro é invisível: ela separa por escurecer, e não
   * há o que escurecer entre dois quase-pretos. Se alguém "unificar" os dois conjuntos, os
   * cartões do escuro perdem a profundidade sem ninguém notar no claro.
   */
  it('o escuro sombreia mais forte que o claro em todos os níveis', () => {
    const alfa = (s: string) => Number(s.match(/\/\s*([\d.]+)\)/)![1])
    for (const nivel of ['suave', 'media', 'forte'] as const) {
      expect(alfa(SOMBRAS.escuro[nivel]), nivel).toBeGreaterThan(alfa(SOMBRAS.claro[nivel]))
    }
  })
})

/*
 * ---------------------------------------------------------------------------------------
 * PRD 13 — o que sustenta a página `/design-system`.
 *
 * O guia mostra os dois temas lado a lado emitindo, por palco, uma declaração para cada
 * papel. O modo de falha é silencioso e específico: papel novo entra no `PAPEIS`, ninguém
 * lembra do mapa de tokens, e o palco escuro passa a mostrar UM papel a menos que o site
 * — com cara de correto, porque o valor herdado é o do tema claro.
 * ---------------------------------------------------------------------------------------
 */
describe('contraste (espelho da régua do CMS)', () => {
  it('preto sobre branco é o máximo da escala', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  it('a mesma cor contra si mesma é o mínimo', () => {
    expect(contraste('#6F57D3', '#6F57D3')).toBeCloseTo(1, 5)
  })

  it('a ordem dos argumentos não muda a razão', () => {
    expect(contraste('#242424', '#ffffff')).toBe(contraste('#ffffff', '#242424'))
  })

  it('aceita a forma curta de três dígitos', () => {
    expect(contraste('#fff', '#000')).toBeCloseTo(21, 5)
  })

  it('devolve null pro que não é hex — não zero, que passaria por reprovação', () => {
    expect(contraste('rgb(0 0 0)', '#fff')).toBeNull()
    expect(contraste('#12345', '#fff')).toBeNull()
  })
})

describe('as duas paletas de referência passam na própria auditoria', () => {
  it.each(PARES_CRITICOS)('$rotulo', (par) => {
    for (const [nome, paleta] of [
      ['claro', PADRAO_CLARO],
      ['escuro', PADRAO_ESCURO],
    ] as const) {
      const razao = contraste(paleta[par.frente], paleta[par.fundo])
      expect(razao, `${nome}: ${par.frente} sobre ${par.fundo}`).not.toBeNull()
      expect(razao!, `${nome}: ${par.frente} sobre ${par.fundo}`).toBeGreaterThanOrEqual(par.minimo)
    }
  })

  it('todo par crítico referencia papel que existe', () => {
    for (const par of PARES_CRITICOS) {
      expect(PAPEIS).toContain(par.frente)
      expect(PAPEIS).toContain(par.fundo)
    }
  })
})

describe('mapa de papel → token CSS', () => {
  it('cobre exatamente os papéis, sem sobra nem falta', () => {
    expect(Object.keys(TOKEN_DO_PAPEL).sort()).toEqual([...PAPEIS].sort())
  })

  it('nenhum papel divide token com outro', () => {
    const tokens = Object.values(TOKEN_DO_PAPEL)
    expect(new Set(tokens).size).toBe(tokens.length)
  })

  it('todo token é uma custom property do prefixo do projeto', () => {
    for (const token of Object.values(TOKEN_DO_PAPEL)) expect(token).toMatch(/^--rz-[a-z-]+$/)
  })
})

describe('declaracoesDoPalco', () => {
  const css = declaracoesDoPalco(PADRAO_ESCURO, SOMBRAS.escuro)

  it('emite uma declaração por papel mais as três sombras', () => {
    expect(css.split(';').filter((l) => l.trim() !== '')).toHaveLength(PAPEIS.length + 3)
  })

  it('leva o valor do papel, e não o nome dele', () => {
    expect(css).toContain(`--rz-bg: ${PADRAO_ESCURO.cor_fundo};`)
    expect(css).toContain(`--rz-sombra-forte: ${SOMBRAS.escuro.forte};`)
  })
})
