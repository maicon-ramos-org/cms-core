import type { ProblemaGate, RegistroGrafo } from './gates'

export type IntencaoEditorial = 'aprender' | 'comparar' | 'resolver' | 'comprar'
export interface FormatoEditorial {
  slug: string
  rotulo: string
  intencao: IntencaoEditorial
  validarPublicacao?: (post: RegistroGrafo) => ProblemaGate[]
}
export interface OpcoesGrafoEditorial { formatos?: FormatoEditorial[] }

export function registrarFormatos(formatos: FormatoEditorial[] = []): FormatoEditorial[] {
  const registrados: FormatoEditorial[] = [{ slug: 'artigo', rotulo: 'Artigo', intencao: 'aprender' }, ...formatos]
  const vistos = new Set<string>()
  for (const f of registrados) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.slug) || !f.rotulo.trim()
      || !['aprender', 'comparar', 'resolver', 'comprar'].includes(f.intencao) || vistos.has(f.slug)) {
      throw new Error(`Formato editorial inválido ou duplicado: ${f.slug}`)
    }
    vistos.add(f.slug)
  }
  return registrados
}
