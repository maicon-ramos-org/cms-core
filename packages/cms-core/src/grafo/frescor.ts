/** Metadados registrados no CMS; sua adequação editorial é decisão do pipeline. */
export interface PesquisaGrafo {
  revisado_em?: string | null
  updatedAt?: string | null
}

/** Null legado conserva o timestamp técnico, sem inferir validade editorial. */
export const dataFrescorPesquisa = (pesquisa?: PesquisaGrafo) => pesquisa?.revisado_em ?? pesquisa?.updatedAt
