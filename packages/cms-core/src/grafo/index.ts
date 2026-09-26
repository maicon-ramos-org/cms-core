import { APIError, ValidationError, type Field, type FieldAccess, type Plugin } from 'payload'
import { isSuperAdmin } from '../access/roles'
import { campoTenantGrafo, colecoesGrafo } from './colecoes'
import { registrarFormatos, type OpcoesGrafoEditorial } from './contratos'
import { avaliaPost, contextoGrafo, endpointGates } from './endpoints'
import { registraEvento } from './eventos'
import { preparaMarkdown, sincronizaMarkdown } from './markdown'
import { draftPrimeiro, validaCorpoGrafo, validaGrafo } from './validacao'

export type { FormatoEditorial, IntencaoEditorial, OpcoesGrafoEditorial } from './contratos'
export { registrarFormatos } from './contratos'
export { avaliarGates, dataFrescorPesquisa, type PesquisaGate, type ClaimGate, type ConfigGates, type EntradaGates, type ProblemaGate, type RegistroGrafo } from './gates'

const somenteAdmin: FieldAccess = ({ req }) => isSuperAdmin(req.user)
const camposTenant: Field[] = [
  { name: 'grafo', type: 'group', access: { create: somenteAdmin, update: somenteAdmin }, fields: [
    { name: 'tipos_de_entidade', type: 'text', hasMany: true }, { name: 'tipos_de_relacao', type: 'text', hasMany: true },
  ] },
  { name: 'gates', type: 'group', access: { create: somenteAdmin, update: somenteAdmin }, fields: [
    { name: 'ativo', type: 'checkbox', defaultValue: false },
    ...['g1', 'g2', 'g3', 'g4'].map((name): Field => ({ name, type: 'checkbox', defaultValue: true })),
    { name: 'qualidade_minima', type: 'number', min: 0, max: 100, defaultValue: 70 },
    { name: 'palavras_minimas', type: 'number', min: 1, defaultValue: 250 },
  ] },
]

/** Extensão explícita: cada instância gera/revisa sua migration antes de ativar. */
export function grafoEditorial(opcoes: OpcoesGrafoEditorial = {}): Plugin {
  const formatos = registrarFormatos(opcoes.formatos)
  return config => {
    const colecoes = config.collections ?? []
    if (!colecoes.some(c => c.slug === 'posts') || !colecoes.some(c => c.slug === 'tenants')) throw new Error('grafoEditorial exige cmsCore com posts e tenants.')
    const novas = colecoesGrafo()
    if (novas.some(n => colecoes.some(c => c.slug === n.slug))) throw new Error('grafoEditorial já registrado ou coleção do grafo duplicada.')
    return { ...config, endpoints: [...(config.endpoints ?? []), contextoGrafo],
      collections: [...colecoes.map(c => {
        if (c.slug === 'tenants') return { ...c, fields: [...c.fields, ...camposTenant], hooks: { ...c.hooks,
          beforeValidate: [...(c.hooks?.beforeValidate ?? []), ({ data, req }) => {
            if (req.user && !isSuperAdmin(req.user) && data && ('gates' in data || 'grafo' in data)) throw new APIError('Apenas super-admin configura o grafo e gates.', 403)
            return data
          }] } } as typeof c
        if (c.slug !== 'posts') return c
        return { ...c, custom: { ...c.custom, tenantCampoProprio: true },
          endpoints: [...(c.endpoints || []), endpointGates(formatos)],
          fields: [...c.fields, campoTenantGrafo(),
            { name: 'tipo', type: 'select', required: true, defaultValue: 'artigo', options: formatos.map(f => ({ label: f.rotulo, value: f.slug })) },
            { name: 'intencao', type: 'select', options: ['aprender', 'comparar', 'resolver', 'comprar'] },
            { name: 'resumo', type: 'textarea', maxLength: 4000 },
            { name: 'entidades', type: 'relationship', relationTo: 'entidades', hasMany: true },
            { name: 'cluster', type: 'relationship', relationTo: 'clusters' },
            { name: 'claims', type: 'relationship', relationTo: 'claims', hasMany: true },
            { name: 'corpo_md', type: 'textarea' }, { name: 'pontuacao', type: 'json' },
            { name: 'gates', type: 'json', admin: { readOnly: true }, access: { create: () => false, update: () => false } },
          ], hooks: { ...c.hooks,
            beforeOperation: [preparaMarkdown, ...(c.hooks?.beforeOperation ?? [])],
            beforeValidate: [draftPrimeiro, validaGrafo({ entidades: 'entidades', claims: 'claims', cluster: 'clusters', capa: 'midia' }), sincronizaMarkdown, validaCorpoGrafo, ...(c.hooks?.beforeValidate ?? [])],
            beforeChange: [...(c.hooks?.beforeChange ?? []), async ({ data, originalDoc, req }) => {
              const efetivo = { ...originalDoc, ...data }
              const formato = formatos.find(f => f.slug === (efetivo.tipo ?? 'artigo'))
              if (!efetivo.intencao && formato) data.intencao = formato.intencao
              if (efetivo._status !== 'published') { data.gates = null; return data }
              const problemas = await avaliaPost(req, { ...efetivo, intencao: data.intencao ?? efetivo.intencao }, formatos)
              const p0 = problemas.filter(p => p.severidade === 'P0')
              if (p0.length) throw new ValidationError({ collection: 'posts', errors: p0.map(p => ({ path: p.path, message: `${p.gate}: ${p.mensagem}` })) })
              data.gates = problemas
              return data
            }],
            afterChange: [...(c.hooks?.afterChange ?? []), registraEvento],
          },
        } as typeof c
      }), ...novas],
    }
  }
}
