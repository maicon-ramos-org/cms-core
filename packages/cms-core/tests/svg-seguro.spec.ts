/** SVG que executa algo não entra na mídia (`hooks/svg-seguro.ts`). */
import { describe, expect, it } from 'vitest'

import { Midia } from '../src/collections/Midia'
import { recusaSvgPerigoso, svgPerigoso } from '../src/hooks/svg-seguro'

describe('SVG na mídia', () => {
  it('recusa script com namespace, on*=, javascript:, foreignObject, entidade e data: não raster', () => {
    for (const svg of [
      '<svg xmlns:h="http://www.w3.org/2000/svg"><h:script>x()</h:script></svg>',
      '<svg><script>x()</script></svg>',
      '<svg><rect onload="x()"/></svg>',
      '<svg><set attributeName="onmouseover" to="x()"/></svg>',
      '<svg><a href="javascript:x()"><text>a</text></a></svg>',
      '<svg><foreignObject><div/></foreignObject></svg>',
      '<!DOCTYPE svg [<!ENTITY x "y">]><svg/>',
      '<svg><image href="data:text/html;base64,PHNjcmlwdD4="/></svg>',
    ]) expect(svgPerigoso(svg), svg).toBe(true)
  })

  it('aceita SVG comum (forma, texto, imagem raster embutida)', () => {
    for (const svg of [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z" fill="#000"/><text>Olá</text></svg>',
      '<svg><image href="data:image/png;base64,iVBORw0KGgo="/></svg>',
    ]) expect(svgPerigoso(svg), svg).toBe(false)
  })

  it('o hook roda primeiro na mídia e recusa com 400 (svgz também)', () => {
    expect(Midia.hooks?.beforeOperation?.[0]).toBe(recusaSvgPerigoso)
    const arquivo = (name: string, texto: string) => ({ name, mimetype: 'image/svg+xml', data: new TextEncoder().encode(texto) })
    const roda = (file: unknown) => recusaSvgPerigoso({ args: {}, operation: 'create', req: { file } } as never)
    expect(() => roda(arquivo('a.svg', '<svg><script>x()</script></svg>'))).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => roda(arquivo('a.svgz', '...'))).toThrow(expect.objectContaining({ status: 400 }))
    expect(roda(arquivo('a.svg', '<svg><path d="M0 0"/></svg>'))).toEqual({})
    expect(roda({ name: 'a.png', mimetype: 'image/png', data: new Uint8Array([1]) })).toEqual({})
  })
})
