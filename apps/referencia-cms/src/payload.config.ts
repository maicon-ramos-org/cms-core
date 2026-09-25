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

/**
 * PRD 24 RF4 — prova que a fábrica (RF1) monta o CMS sem `sharp` (binário nativo que os
 * Workers não têm), como a RF7 de um site real fará de verdade. Sem `midia.derivados`: o gerador
 * pelo binding Images é da RF2 (PR #5, aberto até o Maicon decidir o corte de AVIF acima de
 * 1.200px — ADR-0014). Sem ele, a fábrica só deixa de gerar `imageSizes` (ver `fabrica.ts`);
 * o `opennextjs-cloudflare build` não precisa de derivados de verdade, só de montar.
 */
const nosWorkers = process.env.ALVO === 'workers'

export default cmsCore({ raiz: dirname, plugins: [afiliado()], ...(nosWorkers ? { sharp: null } : {}) })
