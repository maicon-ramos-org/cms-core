/**
 * O núcleo do CMS (PRD 17, ADR-0011): a fábrica da config do Payload, as coleções que todo
 * site tem e o que um site ou plugin usa para montar as dele. Nada aqui conhece marca,
 * domínio ou nicho de um site — a trava `scripts/confere-core-sem-marca.mjs` confere.
 */
export { cmsCore, colecoesComSeo, colecoesDoTenant, type OpcoesCmsCore } from './fabrica'
export { aplicaOrdem, ordenaPor, type Ordem } from './ordem'
export { acrescentaAoGrupoDoTenant, acrescentaCamposAoTenant, acrescentaDestinosDoAutoLinker, ajustaCampo } from './extensoes'
export { editorFeatures } from './editor'
export { configR2, configR2DaExecucao, endpointR2, urlPublica, VARIAVEIS_R2, type ConfigR2 } from './r2'
export { paginas, TEMPLATES_DO_NUCLEO, type TemplateDePagina } from './collections/Pages'
export { Midia } from './collections/Midia'
// o que as coleções de um site ou plugin usam (acesso, validação, revalidação, campos)
export * from './access/roles'
export * from './hooks/validations'
export { revalidateAfterChange, revalidateAfterDelete, slugDeRelacao, type OpcoesRevalidacao, type TagsExtras } from './hooks/revalidate'
export { chaveDeOrigem } from './fields/origem'
export * from './lib/nome-midia'
export * from './lib/contraste'
