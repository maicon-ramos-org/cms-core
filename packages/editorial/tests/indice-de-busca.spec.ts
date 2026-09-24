/**
 * O índice da busca (`/search-index.json`) tem que sair na MESMA ordem sempre.
 *
 * As fontes (posts, ofertas, páginas, lojas…) são lidas em paralelo. Quando cada resposta
 * empurrava os itens numa lista comum, a ordem do arquivo passava a ser a ordem em que o
 * CMS respondia: a cada reinício do site os blocos trocavam de lugar. Para o leitor é
 * quase invisível (a busca filtra no navegador), mas o arquivo muda sem ninguém ter
 * mexido em nada — e a prova de refatoração do PRD 17 (RF7) acusava diferença onde não
 * havia. Medido: duas capturas do mesmo build, com o site reiniciado no meio, davam os
 * mesmos 193 itens em blocos trocados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { juntaIndice, ordenaContribuicoes, type FonteDoIndice } from '../src/extensoes'
import { itensDaColecao } from '../src/lib/cms'

/** Quanto cada coleção demora pra responder, em ms — o que o teste manipula. */
let atraso: Record<string, number>

const doc = (colecao: string, n: number) => ({ id: n, slug: `${colecao}-${n}`, titulo: `${colecao} ${n}`, nome: `${colecao} ${n}` })

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

const tenant = { id: 1, slug: 'exemplo', nome: 'Exemplo', canonical_host: 'exemplo.test' }
const fonte = (colecao: string, campo = 'titulo', comStatus = true): FonteDoIndice => async (t) =>
  (await itensDaColecao(t.id, colecao, campo, comStatus)).map((i) => ({ t: i.nome, u: `/${i.slug}/`, k: colecao }))

const FONTES = ordenaContribuicoes(
  { posts: fonte('posts'), pages: fonte('pages') },
  [{ ofertas: fonte('ofertas'), lojas: fonte('lojas', 'nome', false) }],
  ['posts', 'ofertas', 'pages', 'lojas'],
)
const ordem = async () => (await juntaIndice(tenant, FONTES)).map((i) => i.u.slice(1, -1))

const ESPERADA = [
  'posts-11', 'posts-12', 'posts-21', 'posts-22',
  'ofertas-11', 'ofertas-12', 'ofertas-21', 'ofertas-22',
  'pages-11', 'pages-12', 'pages-21', 'pages-22',
  'lojas-11', 'lojas-12', 'lojas-21', 'lojas-22',
]

describe('índice de busca — ordem estável', () => {
  it('sai na ordem declarada mesmo quando a última fonte responde primeiro', async () => {
    atraso = { posts: 30, ofertas: 20, pages: 10, lojas: 0 }
    expect(await ordem()).toEqual(ESPERADA)
  })

  it('e na mesma ordem com os atrasos invertidos', async () => {
    atraso = { posts: 0, ofertas: 10, pages: 20, lojas: 30 }
    expect(await ordem()).toEqual(ESPERADA)
  })

  it('coleção sem versões não recebe filtro de _status (senão o CMS devolve erro)', async () => {
    atraso = {}
    await itensDaColecao(1, 'lojas', 'nome', false)
    const chamadas = vi.mocked(fetch).mock.calls.map(([u]) => String(u))
    expect(chamadas.every((u) => !u.includes('_status'))).toBe(true)
  })
})
