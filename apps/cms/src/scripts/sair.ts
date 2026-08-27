/**
 * process.exit() logo depois de console.log DESCARTA o que ainda não foi escrito quando
 * stdout é arquivo ou pipe (escrita assíncrona) — e é exatamente assim que import longo
 * roda (`pnpm import:wp > import.log`). Drena o buffer antes de sair.
 */
export const sair = async (code: number): Promise<never> => {
  // callback do write: dispara quando o dado foi entregue ao SO. Esperar por 'drain'
  // NÃO funciona — numa escrita vazia em pipe/arquivo o evento nunca vem.
  await new Promise<void>((resolve) => {
    process.stdout.write('', () => resolve())
  })
  process.exit(code)
}
