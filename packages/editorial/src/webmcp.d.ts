/**
 * Atributos da API DECLARATIVA do WebMCP (PRD 11 RF2).
 *
 * São HTML de verdade — o Chrome 149 os lê pra montar o schema da ferramenta a partir do
 * formulário. O TypeScript é que ainda não conhece: a proposta é de 2026 e as definições
 * de `astroHTML.JSX` vêm do DOM lib, que anda mais devagar que o origin trial.
 *
 * Declarar aqui é o oposto de silenciar com `any`: os atributos ficam TIPADOS, com o nome
 * exato da spec, e um erro de digitação continua sendo erro de compilação.
 *
 * Mora no tema, e não no site, porque os formulários do tema (contato, busca) usam os
 * atributos: um site sem esta declaração não compila (achado do site de referência do
 * núcleo, PRD 17 RF9). O site que inclui `packages/editorial/src` no `astro check` a recebe.
 */
declare namespace astroHTML.JSX {
  interface FormHTMLAttributes {
    /** nome da ferramenta que este formulário vira */
    toolname?: string
    /** o que a ferramenta faz, na voz de quem lê */
    tooldescription?: string
    /**
     * deixa o modelo SUBMETER sozinho. Não usar em formulário que fala em nome de alguém
     * — ver PRD 11, risco 4.
     */
    toolautosubmit?: boolean
  }
  interface InputHTMLAttributes {
    /** descrição do campo no schema; sem ela o navegador usa o texto do `<label>` */
    toolparamdescription?: string
  }
  interface TextareaHTMLAttributes {
    toolparamdescription?: string
  }
  interface SelectHTMLAttributes {
    toolparamdescription?: string
  }
}
