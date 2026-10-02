import { ValidationError, type CollectionBeforeValidateHook, type CollectionSlug, type Plugin } from 'payload'
import { criaCatalogoFisico } from './collections/CatalogoFisico'
import { registrarCategorias, type CategoriaCatalogo } from './catalogo/categorias'
import { protegeReferencias } from './catalogo/protegeReferencias'
import { idRel } from './catalogo/regras'

export interface OpcoesProdutoCanonico {
  categoriasAdicionais?: readonly CategoriaCatalogo[]
  /** Instâncias fora do 3D declaram apenas as próprias categorias. */
  incluirCategoriasPadrao?: boolean
  /** Ofertas comerciais existentes podem apontar para a mesma ficha, sem migração automática. */
  vincularOfertasEditoriais?: boolean
}

const erroVinculo = (): never => { throw new ValidationError({ errors: [
  { path: 'produto', message: 'Produto deve existir no mesmo tenant da oferta.' },
] }) }

const validaProdutoDaOferta: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  if (!data || !('produto' in data) || data.produto == null) return data
  const tenant = idRel(data.tenant ?? originalDoc?.tenant)
  const id = idRel(data.produto)
  if (!tenant || !id) return erroVinculo()
  try {
    const produto = await req.payload.findByID({ collection: 'produtos_fisicos', id,
      req, depth: 0, overrideAccess: true })
    if (idRel(produto.tenant) !== tenant) return erroVinculo()
  } catch (cause) {
    if (cause instanceof ValidationError) throw cause
    return erroVinculo()
  }
  return data
}

/**
 * Entidade editorial de produto físico, sem instalar listings Amazon, ofertas, lojas,
 * cupons ou rotas. Sites com catálogo comercial próprio podem usá-la como a mesma
 * identidade canônica que o plugin afiliado completo fornece a outras instâncias.
 */
export function produtoCanonico(opcoes: OpcoesProdutoCanonico = {}): Plugin {
  const registro = registrarCategorias(opcoes.categoriasAdicionais,
    { incluirPadrao: opcoes.incluirCategoriasPadrao })
  const produto = criaCatalogoFisico(registro).find(c => c.slug === 'produtos_fisicos')!
  return config => {
    const atuais = config.collections ?? []
    if (!['tenants', 'midia'].every(slug => atuais.some(c => c.slug === slug))) {
      throw new Error('produtoCanonico exige cmsCore instalado antes.')
    }
    if (atuais.some(c => c.slug === produto.slug)) {
      throw new Error('produtoCanonico conflita com catálogo físico já instalado.')
    }
    if (opcoes.vincularOfertasEditoriais && !atuais.some(c => c.slug === 'ofertas_editoriais')) {
      throw new Error('produtoCanonico exige ofertasEditoriais antes para vincular ofertas.')
    }
    const collections = [...atuais.map(c => c.slug !== 'ofertas_editoriais' || !opcoes.vincularOfertasEditoriais ? c : {
      ...c,
      fields: [...c.fields, { name: 'produto', type: 'relationship', relationTo: 'produtos_fisicos', index: true }],
      indexes: [...(c.indexes ?? []), { fields: ['tenant', 'produto'] }],
      hooks: { ...c.hooks, beforeValidate: [...(c.hooks?.beforeValidate ?? []), validaProdutoDaOferta] },
    } as typeof c), produto]
    const disponiveis = new Set(collections.map(c => c.slug as CollectionSlug))
    return { ...config, collections: collections.map(c => protegeReferencias(c, disponiveis)) }
  }
}
