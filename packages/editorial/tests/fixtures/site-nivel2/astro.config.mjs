import { defineConfig } from 'astro/config'

import { temaAstro } from '../../../src/tema.ts'
import { tema } from '../tema-teste/definicao.mjs'

export default defineConfig({ integrations: [temaAstro(tema, { componentes: { Cab: './src/MeuCab.astro' }, config: { servico: 'teste' } })] })
