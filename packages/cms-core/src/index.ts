/**
 * O núcleo do CMS (PRD 17, ADR-0011): a fábrica da config do Payload, as coleções que todo
 * site tem e o que um site ou plugin usa para montar as dele. Nada aqui conhece marca,
 * domínio ou nicho de um site — a trava `scripts/confere-core-sem-marca.mjs` confere.
 */
export { cmsCore, colecoesComSeo, colecoesDoTenant, type OpcoesCmsCore } from './fabrica'
export {
  derivadosViaImages,
  MIME_DO_BINDING_IMAGES,
  MIME_REDIMENSIONAVEIS,
  type BindingImages,
  type CustomDaMidia,
  type Derivado,
  type EntradaDoGerador,
  type GeradorDeDerivados,
} from './midia/derivados'
export { aplicaOrdem, ordenaPor, type Ordem } from './ordem'
export { acrescentaAoGrupoDoTenant, acrescentaCamposAoTenant, acrescentaDestinosDoAutoLinker, ajustaCampo } from './extensoes'
export { editorFeatures } from './editor'
export { configR2, configR2DaExecucao, endpointR2, urlPublica, VARIAVEIS_R2, type ConfigR2 } from './r2'
export { paginas, TEMPLATES_DO_NUCLEO, type TemplateDePagina } from './collections/Pages'
export { Midia } from './collections/Midia'
// o que as coleções de um site ou plugin usam (acesso, validação, revalidação, campos)
export * from './access/roles'
export * from './hooks/validations'
export {
  revalidateAfterChange,
  revalidateAfterDelete,
  revalidateAfterOperation,
  revalidateBeforeOperation,
  slugDeRelacao,
  TAGS_POR_POST,
  type CustomDaRevalidacao,
  type EmSegundoPlano,
  type OpcoesRevalidacao,
  type TagsExtras,
} from './hooks/revalidate'
export { chaveDeOrigem } from './fields/origem'
export * from './lib/nome-midia'
export * from './lib/contraste'
// puro: serve ao CMS e aos scripts (os de Node moram em `@maicon-ramos-org/cms-core/scripts`, PRD 24 RF1)
export { emPool } from './scripts/pool'
