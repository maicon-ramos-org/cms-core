/**
 * A entrada `@maicon-ramos-org/cms-core/scripts` (PRD 24 RF1): o que só roda em Node — ciclo
 * de vida do processo, portão de migração, semente, a trava do schema e os scripts de acervo
 * da mídia. Mexe em disco (`node:fs`, `node:os`) e no processo, então fica FORA da entrada
 * principal, que é o que o CMS carrega (num Worker, inclusive).
 *
 * Tabela fechada (o teste `tests/scripts.spec.ts` confere): cada nome mora num lugar só. O que
 * é puro ou do CMS — `emPool`, `editorFeatures`, `ajustaCampo`, `configR2*`, coleções,
 * hooks, acesso — continua em `@maicon-ramos-org/cms-core`.
 */
export { mantemVivo, SaidaInesperada, sair, semSaidaDoProcesso } from './sair'
export { portaoDeMigracao, type OpcoesDoPortao } from './portao'
export {
  aplicaSemente,
  semeia,
  upsert,
  type ContextoDoConteudo,
  type ResultadoDaSemente,
  type Semente,
  type TenantDaSemente,
  type UsuarioDaSemente,
} from './semeia'
// a trava do ADR-0006 (coleção mudou sem migration), dentro do processo
export { confereSchema, confereSchemaNoPayload } from './confere-schema'
export {
  chavesDaMidia,
  clienteR2,
  copiaAcervo,
  type BucketS3,
  type MidiaParaCopia,
  type Relatorio as RelatorioDaCopia,
} from '../midia/copia-r2'
export {
  DERIVADOS,
  regeneraAcervo,
  temTodosOsDerivados,
  type BucketRegenera,
  type MidiaDoAcervo,
  type Relatorio as RelatorioDaRegeneracao,
} from '../midia/regenera'
