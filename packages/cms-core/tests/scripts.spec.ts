/**
 * PRD 24 RF1 — o que é de script (Node, disco, processo) sai da entrada principal.
 *
 * A entrada `.` é o que o CMS carrega — num Worker, inclusive —, e ela arrastava `node:fs` e
 * `node:os` pelos scripts de acervo e de migração. Esses passam a morar em
 * `@maicon-ramos-org/cms-core/scripts`, numa tabela fechada: cada nome mora num lugar só.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import * as principal from '../src/index'
import * as scripts from '../src/scripts/index'

const DOS_SCRIPTS = [
  // scripts/sair.ts
  'mantemVivo',
  'sair',
  'SaidaInesperada',
  'semSaidaDoProcesso',
  // scripts/portao.ts
  'portaoDeMigracao',
  // scripts/semeia.ts
  'semeia',
  'aplicaSemente',
  'upsert',
  // scripts/confere-schema.ts
  'confereSchema',
  'confereSchemaNoPayload',
  // midia/copia-r2.ts
  'copiaAcervo',
  'clienteR2',
  'chavesDaMidia',
  // midia/regenera.ts
  'regeneraAcervo',
  'DERIVADOS',
  'temTodosOsDerivados',
]

describe('a entrada ./scripts', () => {
  it('tem exatamente a tabela do RF1', () => {
    expect(Object.keys(scripts).sort()).toEqual([...DOS_SCRIPTS].sort())
  })

  it('nenhum desses nomes sai mais pela entrada principal', () => {
    const sobrando = DOS_SCRIPTS.filter((nome) => nome in principal)
    expect(sobrando).toEqual([])
  })

  it('o que é puro ou do CMS fica na principal', () => {
    for (const nome of ['cmsCore', 'poolPostgresPorRequisicao', 'emPool', 'editorFeatures', 'ajustaCampo', 'configR2', 'configR2DaExecucao', 'Midia', 'revalidateAfterChange']) {
      expect(principal, nome).toHaveProperty(nome)
    }
  })

  it('o package.json publica as entradas de núcleo, grafo e scripts, e o sharp é peer opcional', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    expect(pkg.exports).toEqual({ '.': './src/index.ts', './grafo': './src/grafo/index.ts', './pautas': './src/pautas/index.ts', './scripts': './src/scripts/index.ts' })
    expect(pkg.peerDependenciesMeta?.sharp?.optional).toBe(true)
  })
})
