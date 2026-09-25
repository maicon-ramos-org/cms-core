import { convertLexicalToMarkdown, convertMarkdownToLexical, type LexicalRichTextAdapter } from '@payloadcms/richtext-lexical'
import type { CollectionBeforeOperationHook, CollectionBeforeValidateHook, PayloadRequest } from 'payload'
import { invalidoGrafo } from './validacao'

function editorConfig(req: PayloadRequest) {
  const campos = req.payload.collections.posts?.config.flattenedFields
  const corpo = campos?.find(f => 'name' in f && f.name === 'corpo')
  const editor = corpo && 'editor' in corpo ? corpo.editor : req.payload.config.editor
  const config = (editor as LexicalRichTextAdapter | undefined)?.editorConfig
  if (!config) throw new Error('Grafo editorial exige editor Lexical no campo posts.corpo.')
  return config
}

/** Gates sempre leem projeção fresca do Lexical, nunca Markdown fornecido pelo cliente. */
export function markdownCanonico(req: PayloadRequest, corpo: unknown): string {
  if (corpo == null) return ''
  try { return convertLexicalToMarkdown({ data: corpo as Parameters<typeof convertLexicalToMarkdown>[0]['data'], editorConfig: editorConfig(req) }) }
  catch { return invalidoGrafo('corpo', 'Corpo Lexical inválido ou incompatível com o editor.') }
}

function sincronizaDados(data: Record<string, any> | undefined, req: PayloadRequest) {
  if (!data) return data
  // Payload injeta chaves com undefined durante beforeValidate dos campos.
  if (data.corpo !== undefined) data.corpo_md = markdownCanonico(req, data.corpo)
  else if (data.corpo_md !== undefined) {
    if (typeof data.corpo_md !== 'string') invalidoGrafo('corpo_md', 'Markdown deve ser texto; use string vazia para limpar.')
    if (/^\s*(?:```|~~~)/m.test(data.corpo_md)) invalidoGrafo('corpo_md', 'Bloco de código ainda não suportado pelo editor desta entrega.')
    if (/!\[[^\]]*\]\((?!\))[^)]*\)/.test(data.corpo_md)) invalidoGrafo('corpo_md', 'Importe a imagem para midia e use ![midia:ID](). URL de imagem externa ainda não é convertida.')
    try { data.corpo = convertMarkdownToLexical({ markdown: data.corpo_md, editorConfig: editorConfig(req) }) }
    catch { invalidoGrafo('corpo_md', 'Markdown não pôde ser convertido para Lexical.') }
    data.corpo_md = markdownCanonico(req, data.corpo)
  }
  return data
}

// Antes de o Payload mesclar o corpo original no PATCH: preserva a precedência
// dos campos que vieram de fato na chamada, inclusive Local API e update em lote.
export const preparaMarkdown: CollectionBeforeOperationHook = ({ args, req }) => {
  if ('data' in args) sincronizaDados(args.data as Record<string, any>, req)
  return args
}

export const sincronizaMarkdown: CollectionBeforeValidateHook = ({ data, req }) => sincronizaDados(data, req)
