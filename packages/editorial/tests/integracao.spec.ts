/**
 * `temaAstro` construído de verdade: três sites de teste (`fixtures/`) sobre o mesmo tema de
 * mentira, cada um num nível de personalização do PRD 17 RF3, e o HTML que o Astro gera.
 *
 * O controle que importa é o do nível 3: com a rota própria do site, o build não pode
 * avisar de colisão — o Astro 7 promete transformar esse aviso em erro.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'astro'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { temaAstro } from '../src/tema'
import { tema } from './fixtures/tema-teste/definicao.mjs'

const saidas: string[] = []
afterAll(() => {
  for (const s of saidas) rmSync(s, { recursive: true, force: true })
})

/** Constrói o site de teste e devolve o HTML de cada rota e o que o build escreveu. */
async function constroi(site: string) {
  const root = fileURLToPath(new URL(`./fixtures/${site}/`, import.meta.url))
  const outDir = mkdtempSync(path.join(os.tmpdir(), `${site}-`))
  saidas.push(outDir)
  const log: string[] = []
  const guarda = (chunk: unknown) => {
    log.push(String(chunk))
    return true
  }
  const out = vi.spyOn(process.stdout, 'write').mockImplementation(guarda)
  const err = vi.spyOn(process.stderr, 'write').mockImplementation(guarda)
  try {
    await build({ root, outDir, logLevel: 'info' })
  } finally {
    out.mockRestore()
    err.mockRestore()
  }
  const html = (rota: string) => readFileSync(path.join(outDir, rota, 'index.html'), 'utf8')
  return { html, log: log.join('') }
}

describe('temaAstro, construído', () => {
  it('nível 1 (nada trocado): as rotas e o componente do tema, com a config do site', async () => {
    const { html } = await constroi('site-padrao')
    expect(html('')).toContain('CAB DO TEMA')
    expect(html('')).toContain('HOME DO TEMA')
    expect(html('')).toContain('servico=teste')
    expect(html('outra')).toContain('OUTRA DO TEMA')
  }, 60_000)

  it('nível 2: o componente do site entra no lugar do do tema, na rota do tema', async () => {
    const { html } = await constroi('site-nivel2')
    expect(html('')).toContain('MEU CAB DO SITE')
    expect(html('')).not.toContain('CAB DO TEMA')
    expect(html('')).toContain('HOME DO TEMA')
  }, 60_000)

  it('nível 3: a index.astro do site vence a home do tema, sem colisão, e as outras rotas seguem', async () => {
    const { html, log } = await constroi('site-nivel3')
    expect(html('')).toContain('HOME DO SITE')
    expect(html('')).not.toContain('HOME DO TEMA')
    expect(html('outra')).toContain('OUTRA DO TEMA')
    expect(log).toContain('o site tem a própria rota')
    expect(log).not.toMatch(/defined in both|collision/i)
  }, 60_000)
})

describe('temaAstro, erros do site', () => {
  const setup = (opcoes: Parameters<typeof temaAstro>[1]) => {
    const integracao = temaAstro(tema as never, opcoes)
    const raiz = new URL('./fixtures/site-padrao/', import.meta.url)
    return () =>
      (integracao.hooks['astro:config:setup'] as (p: unknown) => void)({
        config: { root: raiz, srcDir: new URL('./src/', raiz) },
        injectRoute: () => {},
        addMiddleware: () => {},
        updateConfig: () => {},
        logger: { info: () => {} },
      })
  }

  it('componente que o tema não tem é erro (erro de digitação não some calado)', () => {
    expect(setup({ componentes: { Cabecalho: './x.astro' } as never })).toThrow('componente "Cabecalho" não existe neste tema (existem: Cab)')
  })

  it('extensão com caminho do site que não existe é erro', () => {
    expect(setup({ extensoes: ['./src/nao-existe.ts'] })).toThrow('a extensão ./src/nao-existe.ts não existe')
  })

  it('as extensões chegam às rotas, na ordem, por virtual:<tema>/extensoes', () => {
    let plugin: { resolveId: (id: string) => string; load: (id: string) => string } | undefined
    const integracao = temaAstro(tema as never, { extensoes: ['./astro.config.mjs', 'pacote-de-exemplo/extensao'] })
    const raiz = new URL('./fixtures/site-padrao/', import.meta.url)
    ;(integracao.hooks['astro:config:setup'] as (p: unknown) => void)({
      config: { root: raiz, srcDir: new URL('./src/', raiz) },
      injectRoute: () => {},
      addMiddleware: () => {},
      updateConfig: (c: { vite: { plugins: Array<typeof plugin> } }) => (plugin = c.vite.plugins[0]),
      logger: { info: () => {} },
    })
    const codigo = plugin!.load(plugin!.resolveId('virtual:tema-teste/extensoes'))
    expect(codigo).toContain(`import * as e0 from ${JSON.stringify(fileURLToPath(new URL('./astro.config.mjs', raiz)))}`)
    expect(codigo).toContain('import * as e1 from "pacote-de-exemplo/extensao"')
    expect(codigo).toContain('export default [e0, e1]')
  })

  it('arquivo de componente que não existe é erro', () => {
    expect(setup({ componentes: { Cab: './src/NaoExiste.astro' } })).toThrow('aponta para ./src/NaoExiste.astro, que não existe')
  })
})
