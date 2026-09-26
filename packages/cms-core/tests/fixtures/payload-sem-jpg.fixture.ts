import type { ImageSize as ImageSizeOriginal } from 'payload'

// Payload deriva este campo de Sharp.toFormat. Sharp 0.35 não declara o alias jpg;
// o contrato de entrada pode estreitar sem remover configurações legadas em runtime.
type OpcoesFormato = NonNullable<ImageSizeOriginal['formatOptions']>
type FormatoSemAlias = Exclude<OpcoesFormato['format'], 'jpg'>
export type ImageSize = Omit<ImageSizeOriginal, 'formatOptions'> & {
  formatOptions?: Omit<OpcoesFormato, 'format'> & { format: FormatoSemAlias }
}

// Impede a fixture de deixar de reproduzir o estreitamento silenciosamente.
export const aliasExcluido: 'jpg' extends FormatoSemAlias ? never : true = true
