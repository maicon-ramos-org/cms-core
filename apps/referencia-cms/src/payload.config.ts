/**
 * O CMS do site de referência: só o núcleo e o plugin de afiliado, sem nada de site nenhum
 * (ADR-0011 §4). É contra ele que o CI do núcleo prova que os pacotes montam um site sozinhos
 * — o que só funciona com o acervo de um site real não é núcleo.
 */
import path from 'path'
import { fileURLToPath } from 'url'

import { afiliado } from '@maicon-ramos-org/afiliado/cms'
import { cmsCore } from '@maicon-ramos-org/cms-core'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default cmsCore({ raiz: dirname, plugins: [afiliado()] })
