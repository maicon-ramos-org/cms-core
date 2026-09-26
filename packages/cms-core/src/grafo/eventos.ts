import type { CollectionAfterChangeHook, CollectionBeforeOperationHook, CollectionBeforeValidateHook, RelationshipField, UploadField } from 'payload'
import { idGrafo } from './acesso'
import { invalidoGrafo } from './validacao'

const internos = new WeakMap<object, number>()

/** `select` reduz o doc entregue ao afterChange e tornaria eventos.campos incompleto. */
export const rejeitaSelecaoNaEscritaAuditada: CollectionBeforeOperationHook = ({ args, operation }) => {
  if (['create', 'update', 'restoreVersion'].includes(operation) && 'select' in args && args.select != null) {
    invalidoGrafo('select', 'Seleção parcial é permitida apenas na leitura de coleções auditadas.')
  }
  return args
}

type CampoRelacional = RelationshipField | UploadField

/** afterChange recebe o anterior com depth:0 e o novo com depth configurado. */
function identidadeRelacional(valor: unknown, campo: CampoRelacional): unknown {
  const identidade = (item: unknown): unknown => {
    if (Array.isArray(campo.relationTo)) {
      if (!item || typeof item !== 'object' || !('relationTo' in item) || !('value' in item)) return item
      const id = idGrafo(item.value)
      return id === undefined ? item : { relationTo: item.relationTo, value: String(id) }
    }
    const id = idGrafo(item)
    return id === undefined ? item : String(id)
  }
  if (campo.hasMany) return Array.isArray(valor) ? valor.map(identidade) : valor
  return identidade(valor)
}

function campoMudou(nome: string, antes: unknown, depois: unknown, campos: readonly { name?: string; type: string }[]): boolean {
  const campo = campos.find(c => c.name === nome)
  if (campo?.type === 'relationship' || campo?.type === 'upload') {
    antes = identidadeRelacional(antes, campo as CampoRelacional)
    depois = identidadeRelacional(depois, campo as CampoRelacional)
  }
  return JSON.stringify(depois) !== JSON.stringify(antes)
}

export const eventoInterno: CollectionBeforeValidateHook = ({ req, operation, data }) => {
  if (operation !== 'create' || !internos.get(req)) invalidoGrafo('ator', 'Eventos são append-only e escritos pelo servidor.')
  return data
}

export const registraEvento: CollectionAfterChangeHook = async ({ req, doc, previousDoc, collection, operation }) => {
  const campos = Object.keys(doc).filter(c => !['id', 'createdAt', 'updatedAt'].includes(c)
    && campoMudou(c, previousDoc?.[c], doc[c], collection.fields ?? []))
  internos.set(req, (internos.get(req) ?? 0) + 1)
  try {
    await req.payload.create({ collection: 'eventos' as never, req, overrideAccess: true,
      data: { tenant: doc.tenant, colecao: collection.slug, doc: String(doc.id), acao: operation,
        ator: req.user?.id ?? null, campos } as never })
  } finally {
    const restantes = (internos.get(req) ?? 1) - 1
    if (restantes) internos.set(req, restantes)
    else internos.delete(req)
  }
  return doc
}
