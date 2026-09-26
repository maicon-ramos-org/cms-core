import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, request as httpRequest, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'astro'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const saida = mkdtempSync(join(tmpdir(), 'editorial-memo-ssr-'))
const leituras: string[] = []
let cms: Server
let web: ChildProcess
let base: string

beforeAll(async () => {
  cms = createServer((req, res) => {
    const url = new URL(req.url!, 'http://cms.test')
    let docs: unknown[]
    if (url.pathname === '/api/tenants') {
      const host = url.searchParams.get('where[canonical_host][equals]')
      docs = [{ id: host === 'outro.test' ? 2 : 1, slug: host === 'outro.test' ? 'outro' : 'exemplo', canonical_host: host }]
    } else {
      const tenant = url.searchParams.get('tenant')!
      leituras.push(tenant)
      docs = [{ nome: tenant === '2' ? 'Segundo tenant' : 'Primeiro tenant' }]
    }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ docs }))
  })
  await new Promise<void>(resolve => cms.listen(0, '127.0.0.1', resolve))
  const address = cms.address()
  if (!address || typeof address === 'string') throw new Error('CMS fixture sem porta')
  const cmsUrl = `http://127.0.0.1:${address.port}`
  const root = fileURLToPath(new URL('./fixtures/memo-ssr/', import.meta.url))
  const silencioso = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  try { await build({ root, outDir: saida, logLevel: 'info' }) } finally { silencioso.mockRestore() }
  base = await new Promise<string>((resolve, reject) => {
    web = spawn(process.execPath, [join(saida, 'server/entry.mjs')], {
      env: { PATH: process.env.PATH, NODE_ENV: 'production', PORT: '0', HOST: '127.0.0.1',
        CMS_URL: cmsUrl, CMS_API_KEY: 'ficticia-ssr', ASTRO_TELEMETRY_DISABLED: '1' },
    })
    let log = ''
    const timeout = setTimeout(() => reject(new Error('fixture SSR não iniciou: ' + log)), 15_000)
    const recebe = (data: unknown) => {
      log += String(data)
      const match = /Server listening on (http:\/\/\S+)/.exec(log)
      if (match) { clearTimeout(timeout); resolve(match[1]!) }
    }
    web.stdout!.on('data', recebe)
    web.stderr!.on('data', recebe)
    web.on('error', erro => { clearTimeout(timeout); reject(erro) })
    web.on('exit', codigo => { if (codigo) { clearTimeout(timeout); reject(new Error('fixture SSR encerrou: ' + log)) } })
  })
}, 60_000)

afterAll(async () => {
  web?.kill()
  if (cms) { cms.closeAllConnections(); await new Promise<void>(resolve => cms.close(() => resolve())) }
  rmSync(saida, { recursive: true, force: true })
})

const pede = (path: string, headers: Record<string, string> = {}) => new Promise<Response>((resolve, reject) => {
  // node:http preserva Host explícito; fetch/undici pode substituí-lo pelo host da URL.
  const req = httpRequest(base + path, { headers: { host: 'exemplo.test', ...headers } }, res => {
    const partes: Buffer[] = []
    res.on('data', parte => partes.push(parte))
    res.on('end', () => resolve(new Response(Buffer.concat(partes), {
      status: res.statusCode,
      headers: Object.fromEntries(Object.entries(res.headers).filter(([,v]) => v !== undefined).map(([k,v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)])),
    })))
    res.on('error', reject)
  })
  req.on('error', reject)
  req.end()
})
describe('Astro SSR construído: conteúdo e isolamento', () => {
  it('HTML sem JS idêntico; cabeçalho/rodapé 2→1 e tags preservadas', async () => {
    leituras.length = 0
    const off = await pede('/', { cookie: 'teste=ficticio' })
    const htmlOff = await off.text()
    expect(leituras).toEqual(['1', '1'])
    leituras.length = 0
    const on = await pede('/')
    const html = await on.text()
    expect(html).toBe(htmlOff)
    expect(html).toContain('<h1>Conteúdo completo</h1>')
    expect(html).toContain('<header>')
    expect(html).toContain('<footer>')
    expect(html).toContain('rel="sponsored nofollow"')
    expect(html).toContain('href="https://exemplo.test/"')
    expect(on.headers.get('vary')).toBe(off.headers.get('vary'))
    expect(on.headers.get('cache-tag')).toBe('tenant:exemplo')
    expect(leituras).toEqual(['1'])
  })
  it('Markdown direto/negociado e JSON preservados byte a byte', async () => {
    for (const path of ['/ficha.md', '/indice.json']) {
      const off = await pede(path, { cookie: 'teste=ficticio' })
      const on = await pede(path)
      expect(await on.text()).toBe(await off.text())
      expect(on.headers.get('content-type')).toBe(off.headers.get('content-type'))
    }
    const direto = await pede('/ficha.md')
    const negociado = await pede('/ficha/', { accept: 'text/markdown' })
    expect(await negociado.text()).toBe(await direto.text())
    expect(negociado.headers.get('vary')).toContain('Accept')
    expect(negociado.headers.get('vary')).toContain('Host')
  })
  it('renders concorrentes não cruzam tenant nem reutilizam o request anterior', async () => {
    leituras.length = 0
    const [a, b, c] = await Promise.all([pede('/'), pede('/', { host: 'outro.test' }), pede('/')])
    const [htmlA, htmlB, htmlC] = await Promise.all([a.text(), b.text(), c.text()])
    expect(htmlA).toContain('Primeiro tenant')
    expect(htmlC).toContain('Primeiro tenant')
    expect(htmlB).toContain('Segundo tenant')
    expect(htmlB).not.toContain('Primeiro tenant')
    expect(htmlA).not.toContain('Segundo tenant')
    expect(leituras.sort()).toEqual(['1', '1', '2'])
  })
})
