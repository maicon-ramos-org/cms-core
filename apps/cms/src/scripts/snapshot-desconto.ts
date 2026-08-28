/**
 * Job diário: fotografa o desconto vigente de cada oferta em `historico_desconto`
 * (spec-desconto-e-historico §2).
 *
 * Roda hoje mesmo, muito antes da tela que vai exibir a série (F3), porque coletar é
 * barato e recuperar o passado é impossível. É idempotente pelo índice (oferta, data):
 * rodar duas vezes no mesmo dia atualiza a linha, não duplica.
 *
 * `pnpm --filter @runzos/cms snapshot:desconto`
 */
import './env'

import type { Payload } from 'payload'

import type { Cupon, Oferta } from '../payload-types'

import { mantemVivo, sair } from './sair'

// keep-alive ANTES dos imports pesados: sem TTY o Node encerra no meio da resolução
const encerra = mantemVivo()

const log = (...args: unknown[]): void => console.error(...args)

/** Data do dia em UTC, zerada — a chave do registro é o DIA, não o instante. */
const diaDeHoje = (): string => new Date(new Date().toISOString().slice(0, 10)).toISOString()

const run = async (): Promise<void> => {
  const { getPayload } = await import('payload')
  const config = (await import('../payload.config')).default
  const { compor } = await import('@runzos/desconto')
  const payload: Payload = await getPayload({ config })

  const data = diaDeHoje()
  let criados = 0
  let atualizados = 0
  let semDesconto = 0
  const falhas: string[] = []

  let pagina = 1
  let totalPages = 1
  do {
    const lote = await payload.find({
      collection: 'ofertas',
      where: { _status: { equals: 'published' } },
      limit: 200,
      page: pagina,
      depth: 1,
      overrideAccess: true,
    })
    totalPages = lote.totalPages

    for (const oferta of lote.docs as Oferta[]) {
      try {
        // depth 1: o cupom vem populado; se vier como id, não há o que compor
        const cupom = oferta.cupom && typeof oferta.cupom === 'object' ? (oferta.cupom as Cupon) : null
        const descontoLoja = oferta.desconto_loja ?? null

        // o efetivo do dia: composto quando dá, senão o maior isolado que conhecemos
        const composto = compor(descontoLoja, cupom)
        const pctCupom =
          cupom?.desconto_tipo === 'percentual' && typeof cupom.desconto_valor === 'number'
            ? cupom.desconto_valor
            : null
        const pctLoja =
          descontoLoja?.tipo === 'percentual' && typeof descontoLoja.valor === 'number' ? descontoLoja.valor : null
        const efetivo = composto?.total_pct ?? pctLoja ?? pctCupom

        if (efetivo === null || efetivo === undefined) {
          semDesconto += 1
          continue // sem percentual conhecido não há o que fotografar (nada inventado)
        }

        const jaExiste = await payload.find({
          collection: 'historico_desconto',
          where: { and: [{ oferta: { equals: oferta.id } }, { data: { equals: data } }] },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })

        const dados = {
          tenant: oferta.tenant,
          oferta: oferta.id,
          data,
          desconto_pct: efetivo,
          ...(typeof oferta.preco?.valor === 'number' ? { preco: oferta.preco.valor } : {}),
          ...(cupom?.codigo ? { cupom_codigo: cupom.codigo } : {}),
          fonte: 'snapshot-diario' as const,
        }

        if (jaExiste.docs[0]) {
          await payload.update({
            collection: 'historico_desconto',
            id: (jaExiste.docs[0] as { id: number }).id,
            data: dados as never,
            overrideAccess: true,
          })
          atualizados += 1
        } else {
          await payload.create({ collection: 'historico_desconto', data: dados as never, overrideAccess: true })
          criados += 1
        }
      } catch (err) {
        // RF8: um item que falha nunca aborta o lote
        falhas.push(`${String(oferta.slug)}: ${(err as Error).message}`)
      }
    }
    pagina += 1
  } while (pagina <= totalPages)

  log(
    `snapshot ${data.slice(0, 10)}: ${criados} criados, ${atualizados} atualizados, ` +
      `${semDesconto} sem percentual conhecido, ${falhas.length} falhas`,
  )
  for (const f of falhas.slice(0, 10)) log(`  falha: ${f}`)
  await sair(falhas.length > 0 ? 1 : 0)
}

run()
  .catch((err: unknown) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(encerra)
