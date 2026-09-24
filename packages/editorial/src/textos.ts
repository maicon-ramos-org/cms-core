/**
 * As frases que as rotas do tema escrevem e que dependem do assunto do site: o título do
 * blog, a descrição do feed, a do manifest. O tema tem um padrão neutro para cada uma; o site
 * troca pela dele em `editorial({ config: { textos } })` (PRD 17 RF3d).
 *
 * Nicho de TENANT não entra aqui: ele é dado (`tenants.nicho`) e chega pela marca `{nicho}`,
 * que o `deNicho` preenche — um site com dois tenants escreve uma frase só.
 */
export interface TextosDoEditorial {
  /** `<title>` do `/blog/` na primeira página. Marcas: `{total}`, `{nome}`. */
  tituloDoBlog: string
  /** Descrição do `/blog/`. Marcas: `{total}`, `{nome}`. */
  descricaoDoBlog: string
  /** Descrição de `/categoria/{slug}/` quando a categoria não tem a dela. Marcas: `{categoria}`, `{nome}`. */
  descricaoDaCategoria: string
  /** `<description>` do canal do feed. Marcas: `{nome}`, `{nicho}`. */
  descricaoDoFeed: string
  /** `description` do `manifest.webmanifest`. Marcas: `{nome}`, `{nicho}`. */
  descricaoDoManifest: string
}

export const TEXTOS_PADRAO: TextosDoEditorial = {
  tituloDoBlog: 'Blog: {total} artigos',
  descricaoDoBlog: '{total} artigos de {nome}.',
  descricaoDaCategoria: 'Artigos sobre {categoria}.',
  descricaoDoFeed: 'Artigos de {nome}',
  descricaoDoManifest: '{nome}{nicho}',
}

/** A frase com as marcas preenchidas. Marca sem valor fica como está — e aparece na revisão. */
export function texto(
  textos: Partial<TextosDoEditorial> | undefined,
  chave: keyof TextosDoEditorial,
  valores: Record<string, string | number>,
): string {
  const modelo = textos?.[chave] ?? TEXTOS_PADRAO[chave]
  return modelo.replace(/\{(\w+)\}/g, (marca, nome: string) => (nome in valores ? String(valores[nome]) : marca))
}
