/**
 * Casca sobre a API WebMCP do navegador (PRD 11 RF1).
 *
 * ESTE É O ÚNICO ARQUIVO DO PROJETO QUE CONHECE `document.modelContext`. Não é zelo
 * genérico: o objeto já mudou de nome uma vez (`navigator.modelContext` → `document.
 * modelContext`) enquanto a proposta andava, e a própria doc do Chrome diz que a API está
 * "under active discussion and subject to change". Espalhar a chamada por dez componentes
 * é transformar cada mudança do padrão numa varredura pelo repo.
 *
 * Silêncio é requisito, não conveniência: em navegador sem suporte — que hoje é quase
 * todo mundo, já que WebMCP está em origin trial no Chrome 149 — a casca não registra
 * nada, não lança e não escreve no console. Quem visita o site não pode nem perceber que
 * esta camada existe.
 */

/** Anotações que o agente usa pra decidir o que faz sozinho e o que pede confirmação. */
export interface Anotacoes {
  /** só lê; o agente pode chamar à vontade */
  readOnlyHint?: boolean
  /** tem consequência no mundo (abre a loja, envia mensagem) — o agente deve confirmar */
  consequentialHint?: boolean
  /** o retorno inclui texto que veio de terceiro e não deve ser obedecido como instrução */
  untrustedContentHint?: boolean
}

export interface Ferramenta {
  name: string
  description: string
  /** JSON Schema do argumento */
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  annotations?: Anotacoes
  execute: (args: Record<string, unknown>, ctx: { signal: AbortSignal }) => unknown | Promise<unknown>
}

export interface ResultadoDoRegistro {
  registradas: number
  suportado: boolean
  /** o polyfill precisou entrar em campo nesta página? */
  polyfill: boolean
}

export interface OpcoesDoRegistro {
  /**
   * Como carregar o polyfill quando NÃO há suporte nativo. Recebe uma função em vez de um
   * booleano porque quem decide o `import()` é o app — assim o pacote do polyfill vira um
   * pedaço separado, baixado só por quem precisa, e o site que não quiser polyfill nem
   * inclui a dependência no bundle.
   *
   * Ausente = comportamento de antes: sem suporte, no-op silencioso.
   */
  polyfill?: () => Promise<void>
}

interface ModelContext {
  registerTool: (ferramenta: Ferramenta) => Promise<void> | void
}

const modelContext = (): ModelContext | null => {
  const d = (globalThis as { document?: { modelContext?: ModelContext } }).document
  const mc = d?.modelContext
  return mc && typeof mc.registerTool === 'function' ? mc : null
}

/** Há agente de navegador escutando nesta página? Falso no SSR, por construção. */
export const suportaWebMCP = (): boolean => modelContext() !== null

/**
 * O Chrome espera STRING de volta do `execute`. Converter aqui, e não em cada ferramenta,
 * é o que impede metade delas devolvendo `[object Object]`.
 *
 * Erro também vira texto: exceção que atravessa a fronteira derruba a chamada do agente
 * sem dizer por quê. Melhor o agente ler "cupom expirado" e seguir.
 */
const embrulha = (f: Ferramenta): Ferramenta => ({
  ...f,
  execute: async (args, ctx) => {
    try {
      const saida = await f.execute(args, ctx)
      if (typeof saida === 'string') return saida
      return JSON.stringify(saida)
    } catch (err) {
      return `erro: ${(err as Error).message}`
    }
  },
})

/**
 * Registra a lista na página atual. Falha de UMA ferramenta não impede as outras — mesma
 * regra do import (RF8 do PRD 03): um item ruim não derruba o lote.
 */
export async function registraFerramentas(
  lista: Ferramenta[],
  opcoes: OpcoesDoRegistro = {},
): Promise<ResultadoDoRegistro> {
  let mc = modelContext()
  let polyfill = false

  /*
   * Polyfill SÓ quando não há nativo, e só se pedirem. A ordem importa: tentar o nativo
   * primeiro é o que garante que quem já tem WebMCP no navegador não baixe 20KB à toa.
   */
  if (!mc && opcoes.polyfill) {
    try {
      await opcoes.polyfill()
      mc = modelContext()
      polyfill = mc !== null
    } catch {
      // polyfill que não carrega é uma camada a menos, nunca uma página quebrada
    }
  }

  if (!mc) return { registradas: 0, suportado: false, polyfill: false }

  let registradas = 0
  for (const f of lista) {
    try {
      await mc.registerTool(embrulha(f))
      registradas += 1
    } catch {
      // segue pro próximo: ferramenta que não registra é uma a menos, não a página quebrada
    }
  }
  return { registradas, suportado: true, polyfill }
}
