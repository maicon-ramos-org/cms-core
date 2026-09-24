/**
 * O tema editorial como integração Astro (PRD 17 RF3). Por enquanto, o mecanismo que ele e
 * a entrada `web` dos plugins usam: rotas que o site pode substituir e componentes que ele
 * pode trocar. As rotas e os componentes editoriais entram nas próximas fatias.
 */
export { temaAstro, type DefinicaoDoTema, type OpcoesDoSite, type RotaDoTema } from './tema'
export { normalizaPadrao, padraoDoArquivo, rotasDoSite } from './rotas'
