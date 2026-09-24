/**
 * O que o tema editorial precisa saber do site e que não é componente (PRD 17 RF3b). Chega
 * pelo `editorial({ config })` do `astro.config` e as rotas e o middleware leem de
 * `virtual:editorial/config`. Tem que ser serializável: vira JSON no build.
 */
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
}
