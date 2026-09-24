/**
 * Ciclo de vida dos scripts de migração — dois problemas reais aprendidos no PRD 03:
 *
 * 1. Node encerra com código 0 assim que o event loop fica sem handle ativo, MESMO com
 *    uma promise pendente. Rodando no terminal, o stdin (TTY) segura o processo e tudo
 *    funciona; em background, sob `pnpm`, em CI ou cron NÃO há TTY — o script morria em
 *    silêncio sem importar nada e ainda retornava sucesso. `mantemVivo()` cria o handle.
 * 2. `process.exit()` logo depois de `console.log` descarta o que não foi escrito quando
 *    a saída é pipe/arquivo — que é como import longo roda. `sair()` drena antes.
 */

/** Segura o event loop enquanto a promise principal roda. Devolve o encerrador. */
export const mantemVivo = (): (() => void) => {
  const handle = setInterval(() => {}, 1 << 30)
  return () => clearInterval(handle)
}

export const sair = async (code: number): Promise<never> => {
  // callback do write: dispara quando o dado foi entregue ao SO. Esperar por 'drain'
  // NÃO funciona — numa escrita vazia em pipe/arquivo o evento nunca vem.
  await new Promise<void>((resolve) => {
    process.stdout.write('', () => resolve())
  })
  process.exit(code)
}

/** Alguém chamou `process.exit` dentro de `semSaidaDoProcesso`. */
export class SaidaInesperada extends Error {
  constructor(readonly codigo: number | string | null | undefined) {
    super(`process.exit(${String(codigo)}) chamado no meio da operação`)
    this.name = 'SaidaInesperada'
  }
}

/**
 * Roda `fn` com o `process.exit` trocado por um que LANÇA. Para código de terceiro que
 * decide encerrar o processo por conta própria — o `migrate` do `@payloadcms/drizzle` 3.88
 * chama `exit(0)` quando cancela o próprio prompt e `exit(1)` quando uma migration falha.
 * Aqui isso vira erro com o código, e quem chamou decide o que reportar.
 */
export async function semSaidaDoProcesso<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.exit
  process.exit = ((codigo?: number | string | null) => {
    throw new SaidaInesperada(codigo)
  }) as typeof process.exit
  try {
    return await fn()
  } finally {
    process.exit = original
  }
}
