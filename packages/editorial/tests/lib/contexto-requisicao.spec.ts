import { describe, expect, it, vi } from 'vitest'
import { comContextoLeituraCms, leituraCmsNaRequisicao, permiteMemoLeituras } from '../../src/lib/contexto-requisicao'

const url = 'https://cms.test/api/categorias?tenant=1'
const init = { headers: { authorization: 'users API-Key ficticia' } }
const fonte = () => vi.fn(async () => ({ valor: { docs: [{ nome: 'Categoria' }] }, headers: new Headers() }))
const contexto = async (f: () => Promise<void>) => {
  const resposta = await comContextoLeituraCms(async () => { await f(); return new Response('fim') })
  expect(await resposta.text()).toBe('fim')
}

describe('memo de leitura limitado à requisição', () => {
  it('fora de contexto não deduplica', async () => {
    const ler = fonte()
    await Promise.all([leituraCmsNaRequisicao(url, init, ler), leituraCmsNaRequisicao(url, init, ler)])
    expect(ler).toHaveBeenCalledTimes(2)
  })

  it('deduplica concorrentes e sequenciais sem compartilhar objetos mutáveis', async () => {
    const ler = fonte()
    await contexto(async () => {
      const [a, b] = await Promise.all([leituraCmsNaRequisicao(url, init, ler), leituraCmsNaRequisicao(url, init, ler)])
      a.docs[0]!.nome = 'Mudou'
      expect(b.docs[0]!.nome).toBe('Categoria')
      expect((await leituraCmsNaRequisicao(url, init, ler)).docs[0]!.nome).toBe('Categoria')
      expect(ler).toHaveBeenCalledTimes(1)
    })
    await contexto(async () => { await leituraCmsNaRequisicao(url, init, ler) })
    expect(ler).toHaveBeenCalledTimes(2)
  })

  it('isola requests concorrentes mesmo quando URL e identidade coincidem', async () => {
    const ler = fonte()
    await Promise.all(Array.from({ length: 10 }, () => contexto(async () => {
      await Promise.all([leituraCmsNaRequisicao(url, init, ler), leituraCmsNaRequisicao(url, init, ler)])
    })))
    expect(ler).toHaveBeenCalledTimes(10)
  })

  it('não colapsa origem, query, tenant, identidade nem Accept diferentes', async () => {
    const ler = fonte()
    await contexto(async () => {
      for (const [alvo, opcoes] of [
        [url, init], [url.replace('tenant=1', 'tenant=2'), init], [url.replace('cms.test', 'outro.test'), init],
        [url + '&locale=pt', init], [url, { headers: { authorization: 'outra identidade' } }],
        [url, { headers: { ...init.headers, accept: 'text/markdown' } }],
      ] as const) await leituraCmsNaRequisicao(alvo, opcoes, ler)
      expect(ler).toHaveBeenCalledTimes(6)
    })
  })

  it('headers equivalentes em formatos distintos deduplicam', async () => {
    const ler = fonte()
    await contexto(async () => {
      await leituraCmsNaRequisicao(url, init, ler)
      await leituraCmsNaRequisicao(url, { method: 'GET', headers: new Headers(init.headers) }, ler)
      expect(ler).toHaveBeenCalledTimes(1)
    })
  })

  it('erro não fica guardado: próxima tentativa pode recuperar', async () => {
    const ler = fonte().mockRejectedValueOnce(new Error('indisponível'))
    await contexto(async () => {
      await expect(leituraCmsNaRequisicao(url, init, ler)).rejects.toThrow('indisponível')
      await leituraCmsNaRequisicao(url, init, ler)
      await leituraCmsNaRequisicao(url, init, ler)
      expect(ler).toHaveBeenCalledTimes(2)
    })
  })

  it.each([
    { method: 'POST' }, { method: 'PATCH' }, { method: 'DELETE' },
    { signal: new AbortController().signal }, { cache: 'no-store' },
    { redirect: 'manual' }, { credentials: 'include' },
    { headers: { 'cache-control': 'no-store' } }, { headers: { cookie: 'sessao=ficticia' } },
  ] as RequestInit[])('não memoiza opções privadas/escritas/custom: %j', async (opcoes) => {
    const ler = fonte()
    await contexto(async () => {
      await Promise.all([leituraCmsNaRequisicao(url, opcoes, ler), leituraCmsNaRequisicao(url, opcoes, ler)])
      expect(ler).toHaveBeenCalledTimes(2)
    })
  })

  it.each(['?draft=true', '?preview=1'])('não memoiza preview %s', async (query) => {
    const ler = fonte()
    await contexto(async () => {
      await leituraCmsNaRequisicao('https://cms.test/api/posts' + query, init, ler)
      await leituraCmsNaRequisicao('https://cms.test/api/posts' + query, init, ler)
      expect(ler).toHaveBeenCalledTimes(2)
    })
  })

  it.each(['no-store', 'private', 'no-cache'])('CMS %s não compartilha nem consumidores pendentes', async (diretiva) => {
    const ler = vi.fn(async () => ({ valor: { privado: true }, headers: new Headers({ 'cache-control': diretiva }) }))
    await contexto(async () => {
      await Promise.all([leituraCmsNaRequisicao(url, init, ler), leituraCmsNaRequisicao(url, init, ler)])
      await leituraCmsNaRequisicao(url, init, ler)
      expect(ler).toHaveBeenCalledTimes(3)
    })
  })

  it('CMS Set-Cookie não é reaproveitado', async () => {
    const ler = vi.fn(async () => ({ valor: {}, headers: new Headers({ 'set-cookie': 'teste=ficticio' }) }))
    await contexto(async () => {
      await Promise.all([leituraCmsNaRequisicao(url, init, ler), leituraCmsNaRequisicao(url, init, ler)])
      expect(ler).toHaveBeenCalledTimes(2)
    })
  })

  it('teto de 64 entradas não impede a leitura seguinte', async () => {
    const ler = fonte()
    await contexto(async () => {
      for (let i = 0; i < 64; i++) await leituraCmsNaRequisicao(url + '&id=' + i, init, ler)
      await leituraCmsNaRequisicao(url + '&id=64', init, ler)
      await leituraCmsNaRequisicao(url + '&id=64', init, ler)
      await leituraCmsNaRequisicao(url + '&id=0', init, ler)
      expect(ler).toHaveBeenCalledTimes(66)
    })
  })

  it('resposta maior que 256 KiB e orçamento total de 1 MiB não ficam retidos', async () => {
    const enorme = vi.fn(async () => ({ valor: 'x'.repeat(256 * 1024), headers: new Headers() }))
    const grande = vi.fn(async () => ({ valor: 'x'.repeat(220 * 1024), headers: new Headers() }))
    await contexto(async () => {
      await leituraCmsNaRequisicao(url, init, enorme)
      await leituraCmsNaRequisicao(url, init, enorme)
      expect(enorme).toHaveBeenCalledTimes(2)
      for (let i = 0; i < 5; i++) await leituraCmsNaRequisicao(url + '&id=' + i, init, grande)
      await leituraCmsNaRequisicao(url + '&id=4', init, grande)
      expect(grande).toHaveBeenCalledTimes(6)
    })
  })

  it('contexto acompanha pull após retornar Response e preserva chunks/headers', async () => {
    const ler = fonte()
    const r = await comContextoLeituraCms(async () => {
      await leituraCmsNaRequisicao(url, init, ler)
      let parte = 0
      return new Response(new ReadableStream({ async pull(controller) {
        await leituraCmsNaRequisicao(url, init, ler)
        controller.enqueue(new TextEncoder().encode(++parte === 1 ? '<html>' : 'fim</html>'))
        if (parte === 2) controller.close()
      } }, { highWaterMark: 0 }), { headers: { vary: 'Host, Accept', 'cache-tag': 'tenant:exemplo' } })
    })
    expect(await r.text()).toBe('<html>fim</html>')
    expect(r.headers.get('vary')).toBe('Host, Accept')
    expect(r.headers.get('cache-tag')).toBe('tenant:exemplo')
    expect(ler).toHaveBeenCalledTimes(1)
  })

  it('status e corpo de erro do render não viram sucesso nem atravessam requests', async () => {
    const r = await comContextoLeituraCms(async () => new Response('Página não encontrada.', { status: 404 }))
    expect(r.status).toBe(404)
    expect(await r.text()).toBe('Página não encontrada.')
    const ok = await comContextoLeituraCms(async () => new Response('Página publicada.', { status: 200 }))
    expect(ok.status).toBe(200)
    expect(await ok.text()).toBe('Página publicada.')
  })

  it.each(['fim', 'cancelamento', 'abort', 'privada'])('tarefas tardias não reutilizam contexto após %s', async (finalizacao) => {
    const ler = fonte()
    const abort = new AbortController()
    let liberar!: () => void
    let tardia!: Promise<unknown>
    const espera = new Promise<void>(resolve => { liberar = resolve })
    const r = await comContextoLeituraCms(async () => {
      await leituraCmsNaRequisicao(url, init, ler)
      tardia = (async () => { await espera; return leituraCmsNaRequisicao(url, init, ler) })()
      return new Response('corpo', { headers: finalizacao === 'privada' ? { 'cache-control': 'private' } : {} })
    }, abort.signal)
    if (finalizacao === 'cancelamento') await r.body!.cancel()
    else if (finalizacao === 'abort') abort.abort()
    else await r.text()
    liberar()
    await tardia
    expect(ler).toHaveBeenCalledTimes(2)
  })
})

describe('opt-in somente em caminhos públicos declarados', () => {
  const caminhos = ['/', '/blog/*', '/search-index.json', '/r/*', '/admin/*']
  const permite = (path: string, init?: RequestInit) => permiteMemoLeituras(new Request('https://site.test' + path, init), caminhos)
  it('aceita caminho exato/subárvore, não prefixo parcial ou wildcard geral', () => {
    expect(permite('/')).toBe(true)
    expect(permite('/blog/post.md')).toBe(true)
    expect(permite('/search-index.json')).toBe(true)
    expect(permite('/blog-malicioso/')).toBe(false)
    expect(permite('/outro/')).toBe(false)
    expect(permiteMemoLeituras(new Request('https://site.test/outro/'), ['/*'])).toBe(false)
    expect(permiteMemoLeituras(new Request('https://site.test/'))).toBe(false)
  })
  it.each(['/r/c1', '/admin/usuarios', '/api/privada', '/login/', '/preview/post', '/?preview=1', '/?draft=true'])('nunca aceita %s', path => {
    expect(permite(path)).toBe(false)
  })
  it.each([{ method: 'POST' }, { method: 'HEAD' }, { headers: { cookie: 'teste=ficticio' } },
    { headers: { authorization: 'Bearer ficticio' } }, { headers: { 'cache-control': 'no-store' } } ] as RequestInit[])('exclui request privado %j', opcoes => {
    expect(permite('/', opcoes)).toBe(false)
  })
})
