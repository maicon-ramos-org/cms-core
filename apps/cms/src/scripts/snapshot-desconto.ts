/**
 * Gatilho MANUAL do snapshot de desconto. A lógica mora na task da jobs queue
 * (`packages/afiliado/src/cms/jobs/snapshotDesconto.ts`), que roda sozinha todo dia às 03:10 UTC — este script
 * existe pra rodar sob demanda (backfill do dia, verificação, incidente) sem duplicar
 * regra nenhuma.
 *
 * `pnpm --filter @runzos/cms snapshot:desconto`
 */
import './env'

import { mantemVivo, sair } from './sair'

// keep-alive ANTES dos imports pesados: sem TTY o Node encerra no meio da resolução
const encerra = mantemVivo()

const run = async (): Promise<void> => {
  const { getPayload } = await import('payload')
  const config = (await import('../payload.config')).default
  const { rodaSnapshotDesconto } = await import('@runzos/afiliado/cms')

  const payload = await getPayload({ config })
  const r = await rodaSnapshotDesconto(payload)

  console.error(
    `snapshot ${r.data.slice(0, 10)}: ${r.criados} criados, ${r.atualizados} atualizados, ` +
      `${r.sem_percentual} sem percentual conhecido, ${r.falhas.length} falhas`,
  )
  for (const f of r.falhas.slice(0, 10)) console.error(`  falha: ${f}`)
  await sair(r.falhas.length > 0 ? 1 : 0)
}

run()
  .catch((err: unknown) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(encerra)
