/**
 * O que o tema editorial precisa saber do site e que não é componente (PRD 17 RF3b). Chega
 * pelo `editorial({ config })` do `astro.config` e as rotas e o middleware leem de
 * `virtual:editorial/config`. Tem que ser serializável: vira JSON no build.
 */
import type { TextosDoEditorial } from './textos'

export interface ConfigDoEditorial {
  /** O tenant de localhost e do sufixo nu. A variável `DEFAULT_TENANT` ganha deste valor. */
  tenantPadrao: string
  /**
   * Sufixos de host em que o tenant vem do subdomínio (`.exemplo.local`). A variável
   * `HOST_SUFIXOS_TENANT` (separada por vírgula) ganha destes valores.
   */
  sufixosDeHost?: string[]
  /** Primeiros segmentos de caminho que não levam barra final, além de `api`. */
  semBarra?: string[]
  /** Pastas cujas fichas (`/pasta/slug/`) têm gêmeo `.md`; o hub da pasta não tem. */
  pastasComMd?: string[]
  /** Páginas de raiz sem gêmeo `.md`, além de `/`, `/blog/`, `/busca/` e os hubs das pastas. */
  semMd?: string[]
  /** O nome que o `/healthz` responde em `servico` (o smoke e o monitoramento leem). */
  servico?: string
  /** Frases das rotas que dependem do assunto do site; o que faltar usa o padrão do tema. */
  textos?: Partial<TextosDoEditorial>
  /**
   * Caminhos que o `robots.txt` fecha para todos os robôs, inclusive os de IA liberados — cada
   * um com o motivo, que sai como comentário no arquivo. `/api/` o tema já fecha.
   */
  robotsBloqueia?: Array<{ caminho: string; motivo: string }>
  /**
   * Slugs de página do CMS que NÃO saem em `/{slug}`: o site velho os servia montados (a
   * home, o arquivo do blog, um catálogo), e aqui cada um tem rota própria — o corpo
   * migrado é render velho.
   */
  slugsSemPagina?: string[]
  /** Templates de página que moram numa pasta própria (`/apps/{slug}`): em `/{slug}`, 404. */
  templatesForaDaRaiz?: string[]
  /** Como o formulário de contato se apresenta a um agente (atributos WebMCP do `<form>`). */
  contato?: { ferramenta: string; descricaoDaFerramenta: string }
}
