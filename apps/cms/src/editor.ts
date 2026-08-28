import { EXPERIMENTAL_TableFeature, defaultEditorFeatures } from '@payloadcms/richtext-lexical'
import type { FeatureProviderServer } from '@payloadcms/richtext-lexical'

/**
 * Features do editor em UM lugar só: a config do Payload e os scripts de migração
 * precisam usar exatamente a mesma lista, senão o import converte com um editor e a
 * coleção valida com outro (foi o que aconteceu no PRD 03 com as tabelas —
 * `editorConfigFactory.default()` devolve o editor PADRÃO, não o configurado).
 *
 * Tabelas: 177 posts do WP têm tabela comparativa, elemento-assinatura do template
 * editorial. Sem a feature, convertHTMLToLexical acha a tabela em parágrafos.
 */
export const editorFeatures: FeatureProviderServer[] = [...defaultEditorFeatures, EXPERIMENTAL_TableFeature()]
