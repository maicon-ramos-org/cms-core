/**
 * O índice da busca (`/search-index.json`) tem que sair na MESMA ordem sempre.
 *
 * `itensParaBusca` busca posts, ofertas, pages e lojas em paralelo. Quando cada resposta
 * empurrava os itens numa lista comum, a ordem do arquivo passava a ser a ordem em que o
 * CMS respondia: a cada reinício do site os blocos trocavam de lugar. Para o leitor é
 * quase invisível (a busca filtra no navegador), mas o arquivo muda sem ninguém ter
 * mexido em nada — e a prova de refatoração do PRD 17 (RF7) acusava diferença onde não
 * havia. Medido: duas capturas do mesmo build, com o site reiniciado no meio, davam os
 * mesmos 193 itens em blocos trocados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { itensParaBusca } from '../src/lib/cms'

/** Quanto cada coleção demora pra responder, em ms — o que o teste manipula. */
let atraso: Record<string, number>

const doc = (colecao: string, n: number) => ({
  id: n,
  slug: `${colecao}-${n}`,
  titulo: `${colecao} ${n}`,
  nome: `${colecao} ${n}`,
})

beforeEach(() => {
  vi.stubEnv('CMS_URL', 'http://cms.test')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const u = new URL(input)
      const colecao = u.pathname.split('/')[2]!
      const pagina = Number(u.searchParams.get('page') ?? '1')
      await new Promise((r) => setTimeout(r, atraso[colecao] ?? 0))
      // duas páginas por coleção: a ordem DENTRO da coleção também é contrato
      const docs = [doc(colecao, pagina * 10 + 1), doc(colecao, pagina * 10 + 2)]
      return Response.json({ docs, totalDocs: 4, totalPages: 2 })
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const ordem = async () => (await itensParaBusca(1)).map((i) => i.slug)

const ESPERADA = [
  'posts-11', 'posts-12', 'posts-21', 'posts-22',
  'ofertas-11', 'ofertas-12', 'ofertas-21', 'ofertas-22',
  'pages-11', 'pages-12', 'pages-21', 'pages-22',
  'lojas-11', 'lojas-12', 'lojas-21', 'lojas-22',
]

describe('itensParaBusca — ordem estável', () => {
  it('sai em posts → ofertas → pages → lojas mesmo quando lojas responde primeiro', async () => {
    atraso = { posts: 30, ofertas: 20, pages: 10, lojas: 0 }
    expect(await ordem()).toEqual(ESPERADA)
  })

  it('a ordem não depende de quem responde primeiro', async () => {
    atraso = { posts: 0, ofertas: 25, pages: 5, lojas: 15 }
    const uma = await ordem()
    atraso = { posts: 20, ofertas: 0, pages: 30, lojas: 10 }
    expect(await ordem()).toEqual(uma)
  })
})
