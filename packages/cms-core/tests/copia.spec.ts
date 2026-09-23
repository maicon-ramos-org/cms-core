/**
 * A fábrica pode montar a config mais de uma vez no mesmo processo (PRD 17 RF1d).
 *
 * As coleções do núcleo e as de um plugin são objetos de módulo, e o Payload — o
 * multi-tenant e a sanitização — mexe neles NO LUGAR ao montar a config. Na segunda montagem,
 * o `tenant` aparecia duas vezes e o Payload recusava ("DuplicateFieldName"). O site monta uma
 * vez só por processo, então nunca apareceu em produção; o teste que monta o núcleo sozinho e
 * depois com o plugin achou.
 */
import type { CollectionConfig } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cmsCore } from '../src/fabrica'
import { copiaProfunda } from '../src/copia'

describe('copiaProfunda', () => {
  it('copia objetos e listas, e mantém as funções (hooks, acesso)', () => {
    const hook = () => true
    const c: CollectionConfig = { slug: 'x', fields: [{ name: 'a', type: 'text' }], hooks: { beforeChange: [hook] } }
    const k = copiaProfunda(c)
    expect(k).toEqual(c)
    expect(k.fields).not.toBe(c.fields)
    expect(k.fields[0]).not.toBe(c.fields[0])
    expect(k.hooks!.beforeChange![0]).toBe(hook)
  })

  it('o que não é objeto simples passa como está (RegExp, Date, instância de classe)', () => {
    class Coisa {}
    const coisa = new Coisa()
    const data = new Date(0)
    const re = /x/
    const k = copiaProfunda({ coisa, data, re })
    expect(k.coisa).toBe(coisa)
    expect(k.data).toBe(data)
    expect(k.re).toBe(re)
  })
})

describe('cmsCore duas vezes no mesmo processo', () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries({
      R2_ACCOUNT_ID: 'teste',
      R2_ACCESS_KEY_ID: 'teste',
      R2_SECRET_ACCESS_KEY: 'teste',
      R2_BUCKET: 'teste',
      R2_PUBLIC_BASE: 'https://media.exemplo.test',
      PAYLOAD_SECRET: 'teste',
    }))
      vi.stubEnv(k, v)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('a segunda montagem sai igual à primeira', async () => {
    const campos = async () => {
      const c = await cmsCore({ raiz: '/tmp/cms-core-teste' })
      return c.collections.map((x) => `${x.slug}:${x.flattenedFields.map((f) => f.name).join(',')}`)
    }
    const primeira = await campos()
    expect(await campos()).toEqual(primeira)
  })
})
