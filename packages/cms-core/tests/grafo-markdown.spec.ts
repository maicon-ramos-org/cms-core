import { beforeAll, describe, expect, it } from 'vitest'
import type { PayloadRequest } from 'payload'
import { cmsCore } from '../src/fabrica'
import { grafoEditorial } from '../src/grafo'
import { markdownCanonico, preparaMarkdown } from '../src/grafo/markdown'

describe('Markdown e Lexical com o editor real', () => {
  let req: PayloadRequest
  beforeAll(async () => {
    const config = await cmsCore({ raiz: '/tmp/editor-grafo-fixture', plugins: [grafoEditorial()], sharp: null,
      midia: { r2: { bucket: 'nenhum', endpoint: 'https://bucket.invalid', publicBase: 'https://media.invalid', credentials: { accessKeyId: 'x', secretAccessKey: 'y' } } } })
    req = { payload: { config, collections: Object.fromEntries(config.collections.map(c => [c.slug, { config: c }])) } } as unknown as PayloadRequest
  })

  it.each([
    ['heading', '## Título'],
    ['list', '- Primeiro\n- Segundo'],
    ['paragraph', '[Fonte](https://pesquisa.example/estudo)'],
    ['quote', '> Citação com fonte'],
    ['table', '| Nome | Valor |\n| --- | --- |\n| Item | 12 |'],
    ['horizontalrule', '---'],
    ['upload', '![midia:123]()'],
  ])('preserva estrutura %s no round-trip', async (tipo, md) => {
    const data: any = { corpo_md: md }
    await preparaMarkdown({ args: { data }, req } as never)
    expect(data.corpo.root.children[0].type).toBe(tipo)
    const volta: any = { corpo_md: markdownCanonico(req, data.corpo) }
    await preparaMarkdown({ args: { data: volta }, req } as never)
    // Links ganham IDs de nó novos; relações e texto precisam permanecer iguais.
    const semIDsDeNo = (valor: unknown) => JSON.parse(JSON.stringify(valor, (chave, v) => chave === 'id' ? undefined : v))
    expect(semIDsDeNo(volta.corpo)).toEqual(semIDsDeNo(data.corpo))
  })
  it('PATCH sem os dois campos não os acrescenta', async () => {
    const data = { titulo: 'Título atualizado' }
    await preparaMarkdown({ args: { data }, req } as never)
    expect(data).toEqual({ titulo: 'Título atualizado' })
  })
  it.each(['```js\nalert(1)\n```', '![Imagem](https://media.example/imagem.png)'])('recusa entrada sem conversão garantida: %s', async corpo_md => {
    expect(() => preparaMarkdown({ args: { data: { corpo_md } }, req } as never)).toThrow()
  })
})
