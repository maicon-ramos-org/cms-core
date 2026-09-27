import { readFileSync } from 'node:fs'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'

const modulo = (nome: string) => ({
  type: 'ESModule' as const,
  path: `${nome}.js`,
  contents: ts.transpileModule(readFileSync(new URL(`../src/lib/${nome}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replaceAll("from './ambiente'", "from './ambiente.js'")
    .replaceAll("from './contexto-requisicao'", "from './contexto-requisicao.js'"),
})

const modulos = [modulo('contexto-requisicao'), modulo('cms'), modulo('ambiente')]
const codigo = `
  import { cmsFetch } from './cms.js';
  globalThis.fetch = async () => { throw new Error('HTTP público não deve ser chamado') };
  export default { async fetch(request) {
    try {
      const post = new URL(request.url).pathname === '/post';
      return Response.json(await cmsFetch('/api/teste?tenant=1', post
        ? { method: 'POST', body: JSON.stringify({ valor: 42 }) } : undefined));
    } catch (erro) { return Response.json({ erro: erro.message }, { status: 503 }); }
  } };
`
const bindings = { CMS_URL: 'https://cms.exemplo.test', CMS_API_KEY: 'ficticia', CMS_SERVICE_REQUIRED: '1' }

const comBinding = new Miniflare(convertV4MiniflareOptions({
  cf: false,
  workers: [{
    name: 'site', compatibilityDate: '2026-09-01', compatibilityFlags: ['nodejs_compat'],
    modules: [{ type: 'ESModule', path: 'worker.js', contents: codigo }, ...modulos],
    bindings,
    serviceBindings: {
      CMS_SERVICE: async (request: Request) => Response.json({
        url: request.url,
        method: request.method,
        authorization: request.headers.get('authorization'),
        corpo: await request.text(),
      }),
    },
  }],
}))

const semBinding = new Miniflare(convertV4MiniflareOptions({
  cf: false,
  workers: [{
    name: 'site-sem-binding', compatibilityDate: '2026-09-01', compatibilityFlags: ['nodejs_compat'],
    modules: [{ type: 'ESModule', path: 'worker.js', contents: codigo }, ...modulos],
    bindings,
  }],
}))

afterAll(async () => { await Promise.all([comBinding.dispose(), semBinding.dispose()]) })

describe('transporte interno do CMS em Workers', () => {
  it('usa o Service Binding e preserva URL, autorização e POST', async () => {
    for (const [caminho, metodo] of [['/get', 'GET'], ['/post', 'POST']]) {
      const resposta = await comBinding.dispatchFetch(`https://site.test${caminho}`)
      expect(resposta.status).toBe(200)
      const dados = await resposta.json() as Record<string, string>
      expect(dados.url).toBe('https://cms.exemplo.test/api/teste?tenant=1')
      expect(dados.method).toBe(metodo)
      expect(dados.authorization).toBe('users API-Key ficticia')
      if (metodo === 'POST') expect(dados.corpo).toBe('{"valor":42}')
    }
  })

  it('falha fechado sem binding obrigatório, sem tentar o HTTP público', async () => {
    const resposta = await semBinding.dispatchFetch('https://site.test/get')
    expect(resposta.status).toBe(503)
    expect(await resposta.json()).toEqual({ erro: 'CMS_SERVICE obrigatório e não configurado' })
  })
})
