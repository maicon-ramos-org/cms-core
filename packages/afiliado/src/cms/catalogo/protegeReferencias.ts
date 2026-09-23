import type { CollectionConfig, CollectionSlug, PayloadRequest } from 'payload'
import { invalido, lockReferencia } from './hooks'
import { idRel } from './regras'

const references: Partial<Record<CollectionSlug, Array<[CollectionSlug, string, string?]>>> = {
  lojas: [['ofertas_produto', 'loja']],
  cupons: [['elegibilidade_cupom', 'cupom'], ['ofertas_produto', 'url_redirect', '/r/c']],
  produtos: [['ofertas_produto', 'url_redirect', '/r/p']],
  ofertas: [['ofertas_produto', 'url_redirect', '/r/o']],
  midia: [['produtos_fisicos', 'imagem'], ['variantes_produto', 'imagem']],
  tenants: ['produtos_fisicos', 'variantes_produto', 'ofertas_produto', 'historico_preco_oferta', 'vinculos_catalogo', 'elegibilidade_cupom'].map(s => [s as CollectionSlug, 'tenant']),
}

/** Só protege documentos legados já referenciados pelo catálogo novo. */
export function protegeReferencias(collection: CollectionConfig): CollectionConfig {
  const targets = references[collection.slug as CollectionSlug]
  if (!targets) return collection
  const check = async (req: PayloadRequest, id: unknown) => {
    await lockReferencia(req, collection.slug as CollectionSlug, id, false)
    for (const [slug, field, prefix] of targets) {
      const found = await req.payload.find({ collection: slug, req, depth: 0, overrideAccess: true,
        where: { [field]: { equals: `${prefix ?? ''}${idRel(id)}` } }, limit: 1 })
      if (found.totalDocs) invalido('tenant', 'Documento referenciado pelo catálogo físico não pode ser movido/apagado.')
    }
  }
  return { ...collection, hooks: { ...collection.hooks,
    beforeChange: [...(collection.hooks?.beforeChange ?? []), async ({ data, originalDoc, req }) => {
      if (originalDoc?.id && (('tenant' in data && idRel(data.tenant) !== idRel(originalDoc.tenant)) ||
        (['cupons', 'produtos', 'ofertas'].includes(collection.slug) && 'loja' in data && idRel(data.loja) !== idRel(originalDoc.loja)))) await check(req, originalDoc.id)
      return data
    }],
    beforeDelete: [async ({ req, id }) => { await check(req, id) }, ...(collection.hooks?.beforeDelete ?? [])],
  } }
}
