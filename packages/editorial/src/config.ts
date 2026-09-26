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
  /**
   * Prefixos de caminho que pulam a resolução de tenant E a regra de barra final — o mesmo
   * bypass que `/api/revalidate` e `/healthz` já têm, generalizado (PRD 24: os endereços
   * antigos de mídia, redirecionados pro bucket sem tenant, e outros caminhos sem extensão
   * que não dependem do CMS). Casamento por prefixo (`pathname.startsWith(prefixo)`). Sem
   * a opção, o comportamento é idêntico ao de hoje.
   */
  semTenant?: string[]
  /**
   * Opt-in: GETs CMS idênticos compartilham resultado somente durante um render.
   * Caminhos exatos ou subárvores terminadas em /* (não aceita o wildcard geral).
   * Cookies, Authorization, previews, /r e APIs/rotas reservadas nunca participam.
   * Não altera cache de rota, tags, TTL ou invalidação. Ausente = comportamento atual.
   */
  memoLeituras?: { caminhosPublicos: string[] }
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
  /**
   * Templates de página que moram numa pasta própria (`/apps/{slug}`), com o rótulo delas na
   * busca: em `/{slug}` respondem 404, e o índice de busca aponta para a pasta.
   */
  fichas?: Record<string, { pasta: string; rotulo: string }>
  /** Como o formulário de contato se apresenta a um agente (atributos WebMCP do `<form>`). */
  contato?: { ferramenta: string; descricaoDaFerramenta: string }
  sitemap?: {
    /** A ordem dos sub-sitemaps no índice — a que o buscador já conhece. */
    ordem?: string[]
    /** Hubs do site (`/ofertas/`) que entram no sub-sitemap de páginas, depois do blog. */
    hubs?: string[]
    /** Templates de página com pasta própria: as fichas não saem como `/{slug}/`. */
    templatesDeFora?: string[]
  }
  busca?: {
    /** A ordem das fontes no `/search-index.json` (o tema tem `posts` e `pages`). */
    ordem?: string[]
    /** Descrição da ferramenta WebMCP do formulário de busca da página. */
    descricaoDaFerramenta?: string
    /** O texto de exemplo do campo. */
    placeholder?: string
    /** O que a página diz quando nada é encontrado, depois do termo. */
    dicaSemResultado?: string
  }
  mcp?: {
    /** Ferramentas WebMCP por rota — quem troca `Ferramentas` sabe quais registra. */
    ferramentasPorRota?: Record<string, string[]>
    /** Formulários com atributos WebMCP (`toolname`) nas páginas. */
    formulariosAnotados?: string[]
    /** Regras que valem para toda superfície (ex.: de onde vem um preço). */
    garantias?: Record<string, string>
  }
  /** As frases fixas do `llms.txt`; as contagens e listas vêm do banco e das extensões. */
  llms?: {
    /** Parágrafo de apresentação, uma linha por item (sai como citação). */
    intro?: string[]
    /** Os itens de "Como ler este site". */
    comoLer?: string[]
  }
}
