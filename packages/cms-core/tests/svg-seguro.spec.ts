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

  it('recusa o esquema escondido por referência de caractere, TAB/LF ou animação de href', () => {
    for (const svg of [
      // o parser XML decodifica a referência no valor do atributo antes de o navegador usá-lo
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="&#106;avascript:x()"><rect/></a></svg>',
      '<svg><a href="&#x6A;avascript:x()"><rect/></a></svg>',
      '<svg><a href="&#X6a;&#x61;vascript&#58;x()"><rect/></a></svg>',
      '<svg><a href="&#0000106avascript:x()"><rect/></a></svg>',
      '<svg><a href="javascript&colon;x()"><rect/></a></svg>',
      '<svg><a href="java&#9;script:x()"><rect/></a></svg>',
      '<svg><a href="java\nscript:x()"><rect/></a></svg>',
      '<svg><a href="&#100;ata:text/html,x"><rect/></a></svg>',
      '<svg><a><animate attributeName="href" values="&#106;avascript:x()"/><rect/></a></svg>',
      '<svg><a><set attributeName="xlink:href" to="https://exemplo.test"/><rect/></a></svg>',
    ]) expect(svgPerigoso(svg), svg).toBe(true)
  })

  it('recusa XSLT (roda script sem clique) e texto que não é UTF-8 legível (byte nulo)', () => {
    for (const svg of [
      '<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="a.svg"?><svg xmlns="http://www.w3.org/2000/svg"/>',
      '<?xml-stylesheet href="estilo.css" type="text/css"?><svg/>',
      '<svg xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xsl:version="1.0"><xsl:element name="script">x()</xsl:element></svg>',
      // UTF-16: o regex não leria nada; o arquivo inteiro fica fora
      new TextDecoder().decode(new Uint8Array([0xff, 0xfe, ...[...'<svg><script>x()</script></svg>'].flatMap((c) => [c.charCodeAt(0), 0])])),
    ]) expect(svgPerigoso(svg), svg).toBe(true)
  })

  it('aceita SVG comum (forma, texto, imagem raster embutida)', () => {
    for (const svg of [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z" fill="#000"/><text>Olá</text></svg>',
      '<svg><image href="data:image/png;base64,iVBORw0KGgo="/></svg>',
      '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"><text>P&amp;D &#8212; 10&#x25;</text><a href="https://exemplo.test/?a=1&amp;b=2"><rect/></a></svg>',
      '<svg><animate attributeName="opacity" values="0;1" dur="1s"/></svg>',
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
