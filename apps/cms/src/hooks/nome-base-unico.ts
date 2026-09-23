import type { CollectionBeforeOperationHook } from 'payload'
import sanitize from 'sanitize-filename'

import { nomeBase, nomeLivre } from '../lib/nome-midia'

/**
 * PRD 18 RF5 — dois registros de `midia` nunca dividem o nome-base (`lib/nome-midia.ts`).
 *
 * Roda ANTES do Payload escolher o nome: troca o `req.file.name`, e o Payload segue com o
 * nome novo em tudo (original e derivados). Ele mesmo só evita nome IDÊNTICO — `x.webp` ao
 * lado de `x.png` passa, e os dois gerariam `x-640x336.avif`.
 *
 * Reenvio do mesmo registro com o mesmo nome-base (o `regenera:tamanhos`, ou trocar a
 * imagem por outra de mesmo nome no admin) NÃO muda de nome: mudar apagaria os arquivos
 * antigos do bucket (o `storage-s3` apaga o que o registro deixou de citar) e quebraria o
 * endereço que já circula.
 *
 * O nome é comparado depois do mesmo `sanitize` que o Payload aplica, senão `a:b.png`
 * escaparia da checagem e viraria `ab.png`, ao lado de um `ab.webp`.
 */
export const nomeBaseUnico: CollectionBeforeOperationHook = async ({ args, collection, operation, req }) => {
  if (operation !== 'create' && operation !== 'update') return args
  const arquivo = req.file
  if (!arquivo?.name) return args

  const i = arquivo.name.lastIndexOf('.')
  const pedido = i > 0 ? `${sanitize(arquivo.name.slice(0, i))}${arquivo.name.slice(i)}` : sanitize(arquivo.name)
  const base = nomeBase(pedido)
  const id = (args as { id?: number | string }).id

  if (id !== undefined) {
    const atual = await req.payload.findByID({ collection: collection.slug as 'midia', id, depth: 0, req })
    if (atual?.filename && nomeBase(atual.filename) === base) return args
  }

  // `like` devolve quem CONTÉM o nome-base — um superconjunto de `x`, `x-1`, `x-2`…; a
  // igualdade exata é feita aqui
  const parecidos = await req.payload.find({
    collection: collection.slug as 'midia',
    where: { filename: { like: base } },
    pagination: false,
    depth: 0,
    req,
  })
  const ocupadas = new Set(
    parecidos.docs.filter((d) => String(d.id) !== String(id) && d.filename).map((d) => nomeBase(d.filename!)),
  )
  const livre = nomeLivre(pedido, ocupadas)
  if (livre !== arquivo.name) arquivo.name = livre
  return args
}
