import { readFileSync } from 'node:fs'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'

// Executa os módulos TS reais em workerd local; nenhum Worker/endpoint externo.
const modulo = (nome: string) => ({ type: 'ESModule' as const, path: `${nome}.js`, contents:
  ts.transpileModule(readFileSync(new URL(`../src/lib/${nome}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replaceAll("from './ambiente'", "from './ambiente.js'")
    .replaceAll("from './contexto-requisicao'", "from './contexto-requisicao.js'"),
})

const runtime = new Miniflare(convertV4MiniflareOptions({
  cf: false,
  workers: [{ name: 'memo',
  compatibilityDate: '2026-09-01', compatibilityFlags: ['nodejs_compat'],
  modules: [{ type: 'ESModule', path: 'worker.js', contents: `
    import { comContextoLeituraCms } from './contexto-requisicao.js';
    import { cmsFetch } from './cms.js';
    let serial = 0;
    globalThis.fetch = async (url) => {
      const id = ++serial;
      await new Promise(r => setTimeout(r, 2));
      return Response.json({ serial: id, tenant: new URL(url).searchParams.get('tenant') });
    };
    export default { async fetch(request) {
      const url = new URL(request.url);
      const path = '/api/publico?tenant=' + (url.searchParams.get('tenant') || '1');
      if (['/fim', '/cancelamento', '/abort'].includes(url.pathname)) {
        let liberar, tardia, primeiro;
        const espera = new Promise(resolve => { liberar = resolve });
        const abort = new AbortController();
        const r = await comContextoLeituraCms(async () => {
          primeiro = await cmsFetch(path);
          tardia = (async () => { await espera; return cmsFetch(path) })();
          return new Response('corpo');
        }, abort.signal);
        if (url.pathname === '/cancelamento') await r.body.cancel();
        else if (url.pathname === '/abort') abort.abort();
        else await r.text();
        liberar();
        return Response.json({ primeiro, depois: await tardia });
      }
      if (url.pathname === '/stream') return comContextoLeituraCms(async () => {
        const primeiro = await cmsFetch(path);
        let parte = 0;
        return new Response(new ReadableStream({ async pull(controller) {
          const proximo = await cmsFetch(path);
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ primeiro, proximo }) + '\\n'));
          if (++parte === 2) controller.close();
        } }, { highWaterMark: 0 }), { headers: { vary: 'Host, Accept' } });
      }, request.signal);
      const render = async () => {
        const [a,b] = await Promise.all([cmsFetch(path), cmsFetch(path)]);
        a.alterado = true;
        const c = await cmsFetch(path);
        return Response.json({a,b,c});
      };
      return url.pathname === '/off' ? render() : comContextoLeituraCms(render, request.signal);
    } };
  ` }, modulo('contexto-requisicao'), modulo('cms'), modulo('ambiente')],
  bindings: { CMS_URL: 'https://cms.test', CMS_API_KEY: 'ficticia-workerd' },
  }],
}))
afterAll(() => runtime.dispose())

type Resultado = { a: { serial: number; tenant: string }; b: { serial: number; tenant: string; alterado?: boolean }; c: { serial: number } }
describe('memo CMS no runtime real Workers', () => {
  it('deduplica concorrentes/sequenciais e mantém cópias independentes', async () => {
    const r = await runtime.dispatchFetch('https://site.test/on')
    const { a, b, c } = await r.json() as Resultado
    expect(a.serial).toBe(b.serial)
    expect(c.serial).toBe(a.serial)
    expect(b.alterado).toBeUndefined()
  })
  it('default desligado não deduplica', async () => {
    const r = await runtime.dispatchFetch('https://site.test/off')
    const { a, b, c } = await r.json() as Resultado
    expect(new Set([a.serial, b.serial, c.serial]).size).toBe(3)
  })
  it('requests concorrentes no mesmo isolate não compartilham entradas, inclusive mesmo tenant', async () => {
    const resultados = await Promise.all(['1', '2', '1'].map(async tenant => {
      const r = await runtime.dispatchFetch('https://site.test/on?tenant=' + tenant)
      return await r.json() as Resultado
    }))
    expect(resultados.map(r => r.a.tenant)).toEqual(['1', '2', '1'])
    expect(new Set(resultados.map(r => r.a.serial)).size).toBe(3)
    expect(resultados.every(r => r.a.serial === r.b.serial && r.a.serial === r.c.serial)).toBe(true)
  })
  it('mantém o contexto nos pulls depois que Response retornou, sem bufferizar o corpo', async () => {
    const r = await runtime.dispatchFetch('https://site.test/stream')
    const linhas = (await r.text()).trim().split('\n').map(linha => JSON.parse(linha))
    expect(linhas).toHaveLength(2)
    expect(linhas.every(linha => linha.primeiro.serial === linha.proximo.serial)).toBe(true)
    expect(r.headers.get('vary')).toBe('Host, Accept')
  })
  it.each(['fim', 'cancelamento', 'abort'])('tarefa tardia após %s não reutiliza resposta', async termino => {
    const r = await runtime.dispatchFetch('https://site.test/' + termino)
    const dados = await r.json() as { primeiro: { serial: number }; depois: { serial: number } }
    expect(dados.depois.serial).not.toBe(dados.primeiro.serial)
  })
})
