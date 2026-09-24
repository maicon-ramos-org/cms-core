/**
 * Pool de concorrência limitada com retry por item (PRD 03 RF8: um item que falha
 * nunca aborta o lote). Usado no download das 2552 mídias e no fetch do meta SEO.
 */
export async function emPool<T, R>(
  itens: T[],
  limite: number,
  tarefa: (item: T, indice: number) => Promise<R>,
  opcoes: { tentativas?: number; aoProgredir?: (feitos: number, total: number) => void } = {},
): Promise<Array<{ item: T; ok: true; valor: R } | { item: T; ok: false; erro: Error }>> {
  const tentativas = opcoes.tentativas ?? 3
  const resultados: Array<{ item: T; ok: true; valor: R } | { item: T; ok: false; erro: Error }> = []
  let proximo = 0
  let feitos = 0

  const trabalhador = async (): Promise<void> => {
    for (;;) {
      const i = proximo
      proximo += 1
      if (i >= itens.length) return
      let ultimoErro: Error | null = null
      for (let t = 1; t <= tentativas; t += 1) {
        try {
          // `!`: i < itens.length, conferido acima
          resultados[i] = { item: itens[i]!, ok: true, valor: await tarefa(itens[i]!, i) }
          ultimoErro = null
          break
        } catch (err) {
          ultimoErro = err as Error
          // backoff curto e crescente — falha de rede costuma passar na 2ª
          if (t < tentativas) await new Promise((r) => setTimeout(r, 300 * t))
        }
      }
      if (ultimoErro) resultados[i] = { item: itens[i]!, ok: false, erro: ultimoErro }
      feitos += 1
      opcoes.aoProgredir?.(feitos, itens.length)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, () => trabalhador()))
  return resultados
}
