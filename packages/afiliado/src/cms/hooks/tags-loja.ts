import { slugDeRelacao, type TagsExtras } from '@maicon-ramos-org/cms-core'

/**
 * A tag `loja:{slug}` da revalidação (PRD 01 RF5), do lado do afiliado desde o PRD 17 RF1b:
 * o núcleo gera `{colecao}:{id}` e `tenant:{slug}` e não conhece `lojas`. Mesmas tags, na
 * mesma ordem de antes: a da loja relacionada (`doc.loja`) e, na própria coleção `lojas`, a
 * do documento.
 */
export const tagsDaLoja: TagsExtras = async (req, colecao, doc) => {
  const tags: string[] = []
  const lojaSlug = await slugDeRelacao(req, 'lojas', doc.loja)
  if (lojaSlug) tags.push(`loja:${lojaSlug}`)
  if (colecao === 'lojas' && typeof doc.slug === 'string') tags.push(`loja:${doc.slug}`)
  return tags
}
