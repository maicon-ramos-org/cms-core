/**
 * A entrada `cms` do plugin de afiliado (PRD 17 RF1, ADR-0011): o plugin do Payload e o que
 * os scripts do site ainda usam do catálogo e do snapshot de desconto (eles mudam de casa no
 * RF5). A entrada `web` — rotas e componentes de oferta — nasce no RF3.
 */
export { afiliado, programasAtivos } from './plugin'
export * from './catalogo/regras'
export { lockListing, observaListing } from './catalogo/hooks'
export {
  agendaDoSnapshot,
  diaDeHoje,
  JOB_PRESO_DEPOIS_DE_MS,
  primeiraPassadaNaHora,
  rodaSnapshotDesconto,
  snapshotDescontoTask,
  soltaJobsPresos,
  type ResumoSnapshot,
} from './jobs/snapshotDesconto'
export { tagsDaLoja } from './hooks/tags-loja'
