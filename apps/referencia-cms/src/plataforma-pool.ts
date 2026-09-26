/** Ativação somente da fixture local/CI; nunca transforma referência em deploy. */
import { poolPostgresPorRequisicao, type OpcoesCmsCore } from '@maicon-ramos-org/cms-core'
import { claimsJsonFixture } from './claims-json-fixture'
import type { Config, Plugin } from 'payload'

interface ContextoFixture {
  ctx: { waitUntil(promessa: Promise<unknown>): void }
  env: { HYPERDRIVE?: { connectionString: string }; TESTAR_POOL_POR_REQUISICAO?: string; TESTAR_CLAIMS_JSON?: string }
}
type OpcoesFixture = Pick<OpcoesCmsCore, 'db' | 'logger' | 'revalidacao' | 'sharp'> & { plugins?: Plugin[] }

export function opcoesPoolFixture(atual: () => ContextoFixture): OpcoesFixture {
  const conexao = () => {
    const contexto = atual()
    if (!contexto.ctx || !contexto.env.HYPERDRIVE?.connectionString) throw new Error('Fixture exige contexto e binding PostgreSQL atuais.')
    return { identidade: contexto.ctx, connectionString: contexto.env.HYPERDRIVE.connectionString }
  }
  return {
    db: { connectionString: conexao().connectionString, maxUses: 1 },
    sharp: null,
    // A fixture nunca imprime query, chave, connectionString ou corpo de exceção.
    logger: Object.fromEntries(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'].map(n => [n, () => {}])) as unknown as Config['logger'],
    plugins: [...(atual().env.TESTAR_CLAIMS_JSON === '1' ? [claimsJsonFixture] : []), poolPostgresPorRequisicao(conexao)],
    revalidacao: { emSegundoPlano: promessa => atual().ctx.waitUntil(promessa) },
  }
}

export async function plataformaPoolFixture(): Promise<OpcoesFixture> {
  if (typeof navigator === 'undefined' || navigator.userAgent !== 'Cloudflare-Workers') return {}
  const { getCloudflareContext } = await import('@opennextjs/cloudflare')
  const inicial = await getCloudflareContext({ async: true }) as unknown as ContextoFixture
  if (inicial.env.TESTAR_POOL_POR_REQUISICAO !== '1') return {}
  return opcoesPoolFixture(() => getCloudflareContext() as unknown as ContextoFixture)
}
