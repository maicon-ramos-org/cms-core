/**
 * O que a entrada `web` do plugin de afiliado precisa saber do site (PRD 17 RF3e). Chega por
 * `afiliado({ config })` no `astro.config` e o plugin lê de `virtual:afiliado/config`. Tem que
 * ser serializável.
 */
export interface ConfigDoAfiliado {
  /**
   * Origens (o prefixo do `wordpress_id`, como `app`) cujas ofertas moram noutra pasta que
   * não `/ofertas/` — a URL que o site velho publicou e que está indexada.
   */
  pastaPorOrigem?: Record<string, string>
  /** Hosts de rastreio de afiliado próprios do site, além das redes conhecidas do plugin. */
  redesDeRastreio?: string[]
}
