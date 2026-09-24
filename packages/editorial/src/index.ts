/**
 * O tema editorial como integração Astro (PRD 17 RF3): `editorial()` para o `astro.config`
 * do site, e o mecanismo que ele e a entrada `web` dos plugins usam — rotas que o site pode
 * substituir e componentes que ele pode trocar. Dados e utilidades em `./lib/*`.
 */
export { editorial, type ComponenteDoEditorial, type OpcoesEditorial } from './editorial'
export type { ConfigDoEditorial } from './config'
export {
  linksDoCorpo,
  tiposDeSitemap,
  type ExtensaoDoEditorial,
  type GeradorDeSitemap,
  type LinksDoCorpo,
  type LlmsDaExtensao,
} from './extensoes'
export { TEXTOS_PADRAO, texto, type TextosDoEditorial } from './textos'
export { temaAstro, type DefinicaoDoTema, type OpcoesDoSite, type RotaDoTema } from './tema'
export { normalizaPadrao, padraoDoArquivo, rotasDoSite } from './rotas'
