import type { Payload, TaskConfig } from 'payload'

import { compor, type CupomParaCompor, type DescontoDaLoja } from '@runzos/desconto'

/*
 * O recorte de `ofertas` e `cupons` que a tarefa lê. O tipo completo sai do
 * `payload-types.ts` do SITE, que um pacote não enxerga (PRD 17 RF1c).
 */
type Cupon = CupomParaCompor & { codigo?: string | null }
interface Oferta {
  id: number | string
  slug?: string | null
  tenant?: number | string | { id: number | string } | null
  preco?: { valor?: number | null } | null
  cupom?: number | string | Cupon | null
  desconto_loja?: DescontoDaLoja | null
}

/**
 * Fotografia diária do desconto de cada oferta (spec-desconto-e-historico §2).
 *
 * Mora aqui — e não no script — porque a série precisa acumular TODO dia sem ninguém
 * lembrar de rodar: quem esquece de coletar não recupera o passado. O script
 * `snapshot:desconto` virou só um gatilho manual desta mesma função.
 *
 * Idempotente pelo índice (oferta, data): rodar duas vezes no mesmo dia atualiza a linha.
 */

/** Data do dia em UTC, zerada — a chave do registro é o DIA, não o instante. */
export const diaDeHoje = (): string => new Date(new Date().toISOString().slice(0, 10)).toISOString()

export interface ResumoSnapshot {
  data: string
  criados: number
  atualizados: number
  sem_percentual: number
  falhas: string[]
}

export async function rodaSnapshotDesconto(payload: Payload): Promise<ResumoSnapshot> {
  const data = diaDeHoje()
  const resumo: ResumoSnapshot = { data, criados: 0, atualizados: 0, sem_percentual: 0, falhas: [] }

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
        const cupom = oferta.cupom && typeof oferta.cupom === 'object' ? (oferta.cupom as Cupon) : null
        const descontoLoja = oferta.desconto_loja ?? null

        // o efetivo do dia: composto quando dá, senão o maior isolado que conhecemos
        const composto = compor(descontoLoja, cupom)
        const pctCupom =
          cupom?.desconto_tipo === 'percentual' && typeof cupom.desconto_valor === 'number' ? cupom.desconto_valor : null
        const pctLoja =
          descontoLoja?.tipo === 'percentual' && typeof descontoLoja.valor === 'number' ? descontoLoja.valor : null
        const efetivo = composto?.total_pct ?? pctLoja ?? pctCupom

        if (efetivo === null || efetivo === undefined) {
          resumo.sem_percentual += 1
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
          resumo.atualizados += 1
        } else {
          await payload.create({ collection: 'historico_desconto', data: dados as never, overrideAccess: true })
          resumo.criados += 1
        }
      } catch (err) {
        // RF8: um item que falha nunca aborta o lote
        resumo.falhas.push(`${String(oferta.slug)}: ${(err as Error).message}`)
      }
    }
    pagina += 1
  } while (pagina <= totalPages)

  return resumo
}

export const snapshotDescontoTask: TaskConfig<'snapshotDesconto'> = {
  slug: 'snapshotDesconto',
  label: 'Snapshot diário do desconto',
  // uma tentativa: se falhar, a próxima execução diária cobre — represar retry de um job
  // que roda todo dia só empilha trabalho
  retries: 1,
  outputSchema: [
    { name: 'criados', type: 'number' },
    { name: 'atualizados', type: 'number' },
    { name: 'sem_percentual', type: 'number' },
    { name: 'falhas', type: 'number' },
  ],
  handler: async ({ req }) => {
    const resumo = await rodaSnapshotDesconto(req.payload)
    req.payload.logger.info(
      { ...resumo, falhas: resumo.falhas.length },
      `snapshot de desconto ${resumo.data.slice(0, 10)}`,
    )
    return {
      output: {
        criados: resumo.criados,
        atualizados: resumo.atualizados,
        sem_percentual: resumo.sem_percentual,
        falhas: resumo.falhas.length,
      },
    }
  },
}
