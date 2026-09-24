/**
 * O nicho do tenant — o pedaço de texto que dois tenants do mesmo site NÃO compartilham.
 *
 * POR QUE EXISTE: o nicho de um tenant estava cravado em três arquivos (a home, o manifest e
 * o `.well-known/mcp.json`) e vazava inteiro para o outro tenant do mesmo site, que vende
 * outra coisa: o `<title>` da home anunciava, no ar, o nicho de outro site (PRD 14 D4).
 * Marca e tenant saem da coleção `tenants` desde o começo do projeto; o nicho era a última
 * exceção.
 *
 * SEM VALOR GRAVADO A FRASE NÃO SAI (PRD 14 D4). Não há fallback textual: qualquer padrão
 * que eu escrevesse aqui seria o nicho de ALGUM tenant cravado no código de novo, que é
 * exatamente o defeito. Título curto é melhor que título de outro nicho.
 *
 * Isto vive em `lib/` e não nos arquivos que usam porque a regra é a mesma em todos, e regra
 * que vive em três arquivos é regra que diverge em três arquivos.
 */

/** O que estas funções precisam do tenant — nada além disso. */
export interface TenantComNicho {
  nome: string
  nicho?: string | null
}

/**
 * O complemento pronto para concatenar: `' de software e hospedagem'`, ou string vazia
 * quando o tenant não declarou nicho. Já vem com o espaço à esquerda, para que o chamador
 * não precise decidir entre `${x} ${y}` e `${x}${y}` conforme o dado — que é onde nasce o
 * espaço duplo antes da vírgula.
 */
export function deNicho(tenant: TenantComNicho): string {
  const nicho = tenant.nicho?.trim()
  return nicho ? ` de ${nicho}` : ''
}

