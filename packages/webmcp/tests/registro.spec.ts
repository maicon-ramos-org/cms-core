/**
 * PRD 11 RF1 — a casca é o ÚNICO lugar do projeto que conhece `document.modelContext`.
 *
 * O que estes testes travam não é a API do Chrome (que vai mudar): é o CONTRATO da casca —
 * silêncio total onde não há suporte, e nenhuma ferramenta registrada pela metade.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { registraFerramentas, suportaWebMCP, type Ferramenta } from '../src/index'

/** Duas ferramentas de mentira, com as duas anotações que importam (RF6). */
const leitura: Ferramenta = {
  name: 'resumo_da_oferta',
  description: 'Resumo da oferta desta página, com a data em que foi conferida.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: async () => ({ titulo: 'VPS n8n', verificado_em: '2026-08-28T09:00:00Z' }),
}

const consequente: Ferramenta = {
  name: 'ir_para_a_loja',
  description: 'Abre a loja pelo redirect que registra o clique.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { consequentialHint: true },
  execute: async () => '/r/o46?ref=webmcp',
}

const fingeSuporte = (): { registerTool: ReturnType<typeof vi.fn> } => {
  const modelContext = { registerTool: vi.fn().mockResolvedValue(undefined) }
  // @ts-expect-error — o ambiente de teste não tem DOM; montamos o mínimo
  globalThis.document = { modelContext }
  return modelContext
}

beforeEach(() => {
  // @ts-expect-error — limpa entre casos
  delete globalThis.document
})

describe('suportaWebMCP', () => {
  it('é falso sem document (SSR) — a casca roda no servidor sem explodir', () => {
    expect(suportaWebMCP()).toBe(false)
  })

  it('é falso com document mas sem modelContext (navegador comum)', () => {
    // @ts-expect-error — DOM mínimo
    globalThis.document = {}
    expect(suportaWebMCP()).toBe(false)
  })

  it('é verdadeiro quando o navegador expõe registerTool', () => {
    fingeSuporte()
    expect(suportaWebMCP()).toBe(true)
  })
})

describe('registraFerramentas', () => {
  it('não lança e não registra nada onde a API não existe', async () => {
    await expect(registraFerramentas([leitura])).resolves.toEqual({ registradas: 0, suportado: false })
  })

  it('registra cada ferramenta uma vez, preservando nome e anotações', async () => {
    const mc = fingeSuporte()
    const r = await registraFerramentas([leitura, consequente])

    expect(r).toEqual({ registradas: 2, suportado: true })
    expect(mc.registerTool).toHaveBeenCalledTimes(2)
    const nomes = mc.registerTool.mock.calls.map((c) => (c[0] as Ferramenta).name)
    expect(nomes).toEqual(['resumo_da_oferta', 'ir_para_a_loja'])
    expect((mc.registerTool.mock.calls[1]![0] as Ferramenta).annotations).toEqual({ consequentialHint: true })
  })

  it('falha de UMA ferramenta não derruba as outras', async () => {
    const mc = fingeSuporte()
    mc.registerTool.mockRejectedValueOnce(new Error('nome duplicado'))

    const r = await registraFerramentas([leitura, consequente])

    expect(r.registradas).toBe(1)
    expect(mc.registerTool).toHaveBeenCalledTimes(2)
  })

  it('lista vazia é no-op, mesmo com suporte', async () => {
    const mc = fingeSuporte()
    await expect(registraFerramentas([])).resolves.toEqual({ registradas: 0, suportado: true })
    expect(mc.registerTool).not.toHaveBeenCalled()
  })
})

describe('o que o execute devolve', () => {
  /*
   * O Chrome espera string do `execute`. Objeto vira JSON aqui, e não em cada chamador —
   * senão metade das ferramentas devolve `[object Object]` e a outra metade não.
   */
  it('serializa objeto em JSON', async () => {
    const mc = fingeSuporte()
    await registraFerramentas([leitura])
    const registrada = mc.registerTool.mock.calls[0]![0] as Ferramenta
    const saida = await registrada.execute({}, { signal: new AbortController().signal })
    expect(typeof saida).toBe('string')
    expect(JSON.parse(saida as string)).toMatchObject({ verificado_em: '2026-08-28T09:00:00Z' })
  })

  it('string passa intacta', async () => {
    const mc = fingeSuporte()
    await registraFerramentas([consequente])
    const registrada = mc.registerTool.mock.calls[0]![0] as Ferramenta
    await expect(registrada.execute({}, { signal: new AbortController().signal })).resolves.toBe('/r/o46?ref=webmcp')
  })

  it('erro dentro do execute vira mensagem, nunca exceção pro agente', async () => {
    const mc = fingeSuporte()
    await registraFerramentas([
      { ...leitura, execute: async () => { throw new Error('cupom expirado') } },
    ])
    const registrada = mc.registerTool.mock.calls[0]![0] as Ferramenta
    const saida = (await registrada.execute({}, { signal: new AbortController().signal })) as string
    expect(saida).toContain('cupom expirado')
  })
})
