/** Valores JavaScript nativos; só strings recebem encoding na fronteira HTTP. */
export const VALORES_CLAIM = [
  ['texto', '12%'], ['numero-texto', '12'], ['null-texto', 'null'], ['vazia', ''],
  ['booleano-texto', 'false'], ['objeto-texto', '{}'], ['array-texto', '[]'],
  ['aspas-texto', '"texto"'], ['escape', 'aspas " / barra \\ e\nnova linha'],
  ['objeto', { unidade: '12%', detalhes: { valor: 'null' } }],
  ['array', ['12%', 12, null, { valor: 'false' }]], ['numero', 12.5], ['booleano', false], ['null', null],
] as const

export const valorNoWire = (valor: unknown): unknown => typeof valor === 'string' ? JSON.stringify(valor) : valor
