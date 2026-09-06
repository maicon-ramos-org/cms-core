import type { Destino, No, Regra } from '../src/index'

/** Fixtures dos testes — árvore Lexical mínima, montada à mão pra ler no diff. */
export const texto = (t: string): No => ({ type: 'text', text: t, format: 0, version: 1 })
export const paragrafo = (...filhos: No[]): No => ({ type: 'paragraph', children: filhos, version: 1 })
export const heading = (t: string): No => ({ type: 'heading', tag: 'h2', children: [texto(t)], version: 1 })
export const citacao = (t: string): No => ({ type: 'quote', children: [texto(t)], version: 1 })
export const link = (url: string, t: string): No => ({
  type: 'link',
  fields: { url },
  children: [texto(t)],
  version: 1,
})
export const tabela = (t: string): No => ({
  type: 'table',
  version: 1,
  children: [{ type: 'tablerow', version: 1, children: [{ type: 'tablecell', version: 1, children: [paragrafo(texto(t))] }] }],
})
export const raiz = (...filhos: No[]): { root: No } => ({ root: { type: 'root', children: filhos, version: 1 } })

export const destino = (over: Partial<Destino> = {}): Destino => ({
  colecao: 'ofertas',
  id: 10,
  slug: 'hostinger-vps-n8n',
  url: '/ofertas/hostinger-vps-n8n/',
  publicado: true,
  tenant: 1,
  ...over,
})

export const regra = (ancoras: string[], over: Partial<Regra> = {}): Regra => ({
  destino: destino(over.destino),
  ancoras,
  prioridade: 0,
  linksEntrantes: 0,
  ...over,
})

/** Todo texto de link aplicado, na ordem, pra asserção legível. */
export function linksDe(no: unknown, saida: Array<{ url: string; ancora: string }> = []): Array<{ url: string; ancora: string }> {
  if (!no || typeof no !== 'object') return saida
  const o = no as { type?: string; fields?: { url?: string }; children?: unknown[]; root?: unknown }
  if (o.root) return linksDe(o.root, saida)
  if (o.type === 'link' && o.fields?.url) {
    const t = (o.children ?? []).map((c) => (c as { text?: string }).text ?? '').join('')
    saida.push({ url: o.fields.url, ancora: t })
  }
  for (const c of o.children ?? []) linksDe(c, saida)
  return saida
}
