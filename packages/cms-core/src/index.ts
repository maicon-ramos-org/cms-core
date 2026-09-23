/**
 * O núcleo do CMS (PRD 17, ADR-0011): a fábrica da config do Payload e o que todo site
 * compartilha. Nada aqui conhece marca, domínio ou nicho de um site — a trava
 * `scripts/confere-core-sem-marca.mjs` confere.
 */
export { cmsCore, colecoesComSeo, colecoesDoTenant, type OpcoesCmsCore } from './fabrica'
export { editorFeatures } from './editor'
export { configR2, configR2DaExecucao, endpointR2, urlPublica, VARIAVEIS_R2, type ConfigR2 } from './r2'
