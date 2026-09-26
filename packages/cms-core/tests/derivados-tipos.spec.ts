import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const origem = fileURLToPath(new URL('../src/midia/derivados.ts', import.meta.url))
const fixture = fileURLToPath(new URL('./fixtures/payload-sem-jpg.fixture.ts', import.meta.url))
const config = fileURLToPath(new URL('../tsconfig.json', import.meta.url))

describe('tipos do gerador com formatos de Sharp transitivos no consumidor', () => {
  it('compila o módulo real com contrato sem jpg, sem transpile-only', () => {
    const lida = ts.readConfigFile(config, ts.sys.readFile)
    expect(lida.error).toBeUndefined()
    const { options, errors } = ts.parseJsonConfigFileContent(lida.config, ts.sys, fileURLToPath(new URL('..', import.meta.url)))
    expect(errors).toEqual([])
    const host = ts.createCompilerHost(options)
    host.resolveModuleNames = (nomes, importador) => nomes.map(nome => {
      if (nome === 'payload' && importador === origem) {
        return { resolvedFileName: fixture, extension: ts.Extension.Ts }
      }
      return ts.resolveModuleName(nome, importador, options, host).resolvedModule
    })
    const programa = ts.createProgram([origem], options, host)
    const erros = ts.getPreEmitDiagnostics(programa).filter(d => d.category === ts.DiagnosticCategory.Error)
    expect(erros.map(d => ({ codigo: d.code, mensagem: ts.flattenDiagnosticMessageText(d.messageText, '\n') }))).toEqual([])
  }, 30_000)
})
