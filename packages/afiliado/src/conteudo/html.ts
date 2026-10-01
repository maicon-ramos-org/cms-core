import { micromark } from 'micromark'

/** HTML editorial: o parser escapa HTML cru e protocolos perigosos por padrão. */
export const produtoMarkdownHtml = (markdown: string): string => micromark(markdown, { allowDangerousHtml: false, allowDangerousProtocol: false })
