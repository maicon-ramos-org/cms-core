import type { CollectionConfig, Field } from 'payload'
import { authenticated, nunca, podeEscreverConteudo } from '../access/roles'
import { chaveDeOrigem } from '../fields/origem'
import { validaSlugKebab } from '../hooks/validations'
import { eventoInterno, registraEvento } from './eventos'
import { invalidoGrafo, protegeRevisaoPesquisa, unicoGrafo, urlFonte, validaGrafo } from './validacao'
import { preparaOperacaoValorClaim, preservaValorClaim } from './valor-claim'

export const campoTenantGrafo = (): Field => ({ name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true })
const rel = (name: string, relationTo: string, required = false): Field => ({ name, type: 'relationship', relationTo, required })
const slug: Field = { name: 'slug', type: 'text', required: true, validate: validaSlugKebab, maxLength: 200 }
const nome: Field = { name: 'nome', type: 'text', required: true, maxLength: 300 }

function colecao(slug: string, fields: Field[], refs: Record<string, string>, unicos: string[][] = [], versoes = false): CollectionConfig {
  return {
    slug, custom: { tenantCampoProprio: true }, admin: { group: 'Conhecimento' },
    access: { read: authenticated, create: podeEscreverConteudo, update: podeEscreverConteudo, delete: nunca },
    ...(versoes ? { versions: { maxPerDoc: 50 } } : {}),
    indexes: [['origem'], ...unicos].map(fields => ({ fields: ['tenant', ...fields], unique: true })),
    fields: [campoTenantGrafo(), { ...chaveDeOrigem }, ...fields],
    hooks: {
      ...(slug === 'pesquisas' ? { beforeOperation: [protegeRevisaoPesquisa] } : {}),
      ...(slug === 'claims' ? { beforeOperation: [preparaOperacaoValorClaim] } : {}),
      beforeValidate: [validaGrafo(refs, fields.filter(f => 'required' in f && f.required && 'name' in f).map(f => (f as { name: string }).name)), unicoGrafo(['origem']), ...unicos.map(unicoGrafo)],
      beforeDelete: [() => invalidoGrafo('id', 'Exclusão do grafo indisponível; preserve as referências e versões.')],
      afterChange: [registraEvento],
    },
  }
}

export function colecoesGrafo(): CollectionConfig[] {
  return [
    colecao('entidades', [nome, slug, { name: 'tipo', type: 'text', required: true },
      { name: 'resumo', type: 'textarea', maxLength: 4000 }, { name: 'wikidata_qid', type: 'text' },
      { name: 'ymyl', type: 'checkbox', defaultValue: false }, { name: 'saude', type: 'json' }], {}, [['slug']], true),
    colecao('relacoes', [rel('de', 'entidades', true), rel('para', 'entidades', true),
      { name: 'tipo', type: 'text', required: true }, { name: 'peso', type: 'number', required: true, defaultValue: 1,
        validate: (v: number | null | undefined) => v == null || Number.isFinite(v) || 'Peso deve ser finito.' }],
    { de: 'entidades', para: 'entidades' }, [['de', 'para', 'tipo']]),
    colecao('fontes', [{ name: 'url', type: 'text', required: true, validate: urlFonte, maxLength: 2000 },
      { name: 'publisher', type: 'text', maxLength: 300 }, { name: 'titulo', type: 'text', maxLength: 500 },
      { name: 'tier', type: 'number', required: true, min: 1, max: 3, validate: (v: number | null | undefined) => v == null || Number.isInteger(v) || 'Tier deve ser inteiro.' },
      { name: 'publicado_em', type: 'date' }, { name: 'recuperado_em', type: 'date' }, rel('upstream', 'fontes')], { upstream: 'fontes' }, [['url']]),
    colecao('claims', [rel('entidade', 'entidades', true), { name: 'texto', type: 'textarea', required: true, maxLength: 4000 },
      { name: 'valor', type: 'json', hooks: { beforeValidate: [preservaValorClaim] } }, { name: 'ano_ancora', type: 'number', min: 1000, max: 9999,
        validate: (v: number | null | undefined) => v == null || Number.isInteger(v) || 'Ano deve ser inteiro.' },
      rel('fonte', 'fontes', true), { name: 'status', type: 'select', required: true, defaultValue: 'vigente', options: ['vigente', 'revisar', 'refutada'] },
      { name: 'revisado_em', type: 'date' }], { entidade: 'entidades', fonte: 'fontes' }, [], true),
    colecao('pesquisas', [rel('entidade', 'entidades', true), { name: 'corpo_md', type: 'textarea', required: true },
      { name: 'qualidade', type: 'number', min: 0, max: 100 },
      { name: 'revisado_em', type: 'date', admin: { description: 'Data editorial documentada; importar não renova a pesquisa. Sem preenchimento usa updatedAt legado.' } },
      { name: 'validade_dias', type: 'number', required: true, defaultValue: 90, min: 1 }], { entidade: 'entidades' }, [], true),
    colecao('clusters', [nome, slug, rel('entidade_pilar', 'entidades'), { name: 'plano', type: 'json' },
      { name: 'status', type: 'select', required: true, defaultValue: 'planejado', options: ['planejado', 'ativo', 'concluido'] }],
    { entidade_pilar: 'entidades' }, [['slug']], true),
    { slug: 'eventos', custom: { tenantCampoProprio: true }, admin: { group: 'Conhecimento' },
      access: { read: authenticated, create: nunca, update: nunca, delete: nunca },
      fields: [campoTenantGrafo(), { name: 'colecao', type: 'text', required: true }, { name: 'doc', type: 'text', required: true },
        { name: 'acao', type: 'select', required: true, options: ['create', 'update'] }, rel('ator', 'users'), { name: 'campos', type: 'text', hasMany: true }],
      hooks: { beforeValidate: [eventoInterno], beforeDelete: [() => invalidoGrafo('id', 'Eventos são imutáveis.')] } },
  ]
}
