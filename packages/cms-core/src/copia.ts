/**
 * Cópia de config do Payload que protege os objetos de módulo (PRD 17 RF1d).
 *
 * Copia objetos simples e listas, recursivamente; o resto — funções (hooks, acesso,
 * validação), `RegExp`, `Date`, instâncias de classe — passa pela mesma referência. O
 * conteúdo sai igual; o que muda é que o Payload, ao montar a config, mexe na cópia e não na
 * coleção que o módulo exporta.
 */
const simples = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== 'object') return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

export function copiaProfunda<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => copiaProfunda(x)) as T
  if (!simples(v)) return v
  const saida: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(v)) saida[k] = copiaProfunda(x)
  return saida as T
}
