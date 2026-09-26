import { tenantField } from '@payloadcms/plugin-multi-tenant/fields'
import { authenticated, draftOnlyIngestao, isSuperAdmin, nunca, podeEscreverConteudo, validaSlugKebab } from '@maicon-ramos-org/cms-core'
import { APIError, type CollectionConfig, type CollectionSlug, type Field, type FieldAccess, type Plugin, type RelationshipField } from 'payload'
import { registrarProgramasOferta, type ProgramaOferta, type RegistroProgramasOferta } from '../../ofertas-editoriais/contratos'
import { internoOferta, normalizaOfertaEditorial, normalizaVerificacao, semDeleteOferta, validaEscolhas, validaOfertaEditorial, validaVerificacao } from './validacao'

const interno: FieldAccess = ({ req }) => internoOferta(req.user)
const texto = (name: string, required = false): Field => ({ name, type: 'text', required })
const rel = (name: string, relationTo: string, required = false): RelationshipField => ({ name, type: 'relationship', relationTo: relationTo as CollectionSlug, required })
const data = (name: string, required = false): Field => ({ name, type: 'date', required })
const numero = (name: string): Field => ({ name, type: 'number' })
const campoTenant = (): Field => ({ ...tenantField({ name: 'tenant', tenantsArrayFieldName: 'tenants', tenantsArrayTenantFieldName: 'tenant', tenantsCollectionSlug: 'tenants', unique: false }), required: true })

function colecoes(programas: RegistroProgramasOferta): CollectionConfig[] {
  const ofertas: CollectionConfig = {
    slug: 'ofertas_editoriais' as CollectionSlug, custom: { tenantCampoProprio: true }, admin: { group: 'Ofertas editoriais', useAsTitle: 'nome' },
    versions: { drafts: { validate: true }, maxPerDoc: 50 },
    access: { read: authenticated, create: podeEscreverConteudo, update: podeEscreverConteudo, delete: nunca },
    // URL legada é identidade: maiúsculas não são normalizadas, só delimitadores são recusados.
    fields: [campoTenant(), texto('origem', true), { name: 'slug', type: 'text', required: true,
      validate: (value: string | null | undefined) => !value || /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(value) || 'Slug de oferta exige letras ASCII, números e hífens; caixa original é preservada.' }, texto('nome', true), texto('nome_exibicao'),
      { name: 'programa', type: 'select', required: true, options: programas.map(p => ({ label: p.rotulo, value: p.slug })) }, texto('external_id'),
      texto('url_produto'), { name: 'url_afiliado', type: 'text', access: { read: interno } }, texto('preco'),
      ...['comissao_taxa', 'comissao_estimada'].map((name): Field => ({ name, type: 'text', access: { read: interno } })),
      texto('contexto_de_uso'), { name: 'disclosure', type: 'checkbox', defaultValue: true },
      { name: 'estado', type: 'select', required: true, options: ['ativa', 'quebrada', 'pausada', 'encerrada'] },
      { name: 'especificacoes', type: 'array', fields: [texto('rotulo', true), texto('valor', true)] },
      { name: 'pros_contras', type: 'array', fields: [{ name: 'tipo', type: 'select', required: true, options: ['pro', 'con'] }, texto('texto', true)] },
      { name: 'analise_md', type: 'textarea' },
      { name: 'imagem_comercial', type: 'group', fields: [texto('url'), texto('alt')] },
      { name: 'evidencia_comercial', type: 'group', fields: [numero('vendas'), numero('numero_avaliacoes'), numero('avaliacao'), numero('desconto_percentual'), texto('fonte'), data('observado_em')] },
      { name: 'entidades', type: 'array', fields: [rel('entidade', 'entidades', true), { name: 'prioridade', type: 'number', required: true }] },
      rel('espelho_de', 'ofertas_editoriais'), { name: 'correspondencia', type: 'select', options: ['exato', 'equivalente', 'busca'] }, data('atualizado_na_origem'),
    ],
    indexes: [{ fields: ['tenant', 'origem'], unique: true }, { fields: ['tenant', 'slug'], unique: true }, { fields: ['tenant', 'programa', 'external_id'], unique: true }],
    hooks: { beforeValidate: [normalizaOfertaEditorial], beforeChange: [draftOnlyIngestao, validaOfertaEditorial(programas)], beforeDelete: [semDeleteOferta] },
  }
  const verificacoes: CollectionConfig = {
    slug: 'verificacoes_ofertas_editoriais' as CollectionSlug, custom: { tenantCampoProprio: true }, admin: { group: 'Ofertas editoriais' },
    access: { read: authenticated, create: ({ req }) => internoOferta(req.user), update: nunca, delete: nunca },
    fields: [campoTenant(), texto('origem', true), rel('oferta', 'ofertas_editoriais', true), data('verificado_em', true),
      { name: 'link_ativo', type: 'checkbox', defaultValue: () => null }, texto('preco_visto'), { name: 'disponivel', type: 'checkbox', defaultValue: () => null },
      { name: 'nota', type: 'textarea' }, { ...rel('ator', 'users'), admin: { readOnly: true } }],
    indexes: [{ fields: ['tenant', 'origem'], unique: true }],
    hooks: { beforeValidate: [normalizaVerificacao], beforeChange: [validaVerificacao], beforeDelete: [semDeleteOferta] },
  }
  return [ofertas, verificacoes]
}

export interface OpcoesOfertasEditoriais { programas: readonly ProgramaOferta[] }
/** Não muda afiliado() nem rotas: consumidor instala apenas onde existe contrato editorial. */
export function ofertasEditoriais(opcoes: OpcoesOfertasEditoriais): Plugin {
  const programas = registrarProgramasOferta(opcoes.programas)
  if (!programas.length) throw new Error('ofertasEditoriais exige ao menos um programa explícito.')
  return config => {
    const atuais = config.collections ?? []
    if (!['posts', 'tenants', 'entidades'].every(slug => atuais.some(c => c.slug === slug))) throw new Error('ofertasEditoriais exige cmsCore e grafoEditorial instalados antes.')
    if (atuais.some(c => c.slug === 'ofertas_editoriais' || c.slug === 'verificacoes_ofertas_editoriais')) throw new Error('ofertasEditoriais já instalado ou coleção duplicada.')
    return { ...config, collections: [...atuais.map(c => {
      if (c.slug === 'tenants') return { ...c, fields: [...c.fields, { name: 'ofertas_editoriais', type: 'group',
        access: { create: ({ req }) => isSuperAdmin(req.user), update: ({ req }) => isSuperAdmin(req.user) },
        fields: [{ name: 'papeis_escolha', type: 'array', fields: [{ name: 'slug', type: 'text', required: true, validate: validaSlugKebab }, texto('rotulo', true)] }] }],
        hooks: { ...c.hooks, beforeValidate: [...(c.hooks?.beforeValidate ?? []), ({ data, originalDoc, req }) => {
          if (req.user && !isSuperAdmin(req.user) && data && 'ofertas_editoriais' in data && JSON.stringify(data.ofertas_editoriais) !== JSON.stringify(originalDoc?.ofertas_editoriais)) throw new APIError('Só super-admin configura papéis de escolha.', 403)
          return data
        }] } } as CollectionConfig
      if (c.slug !== 'posts') return c
      return { ...c, fields: [...c.fields, { name: 'escolhas', type: 'array', fields: [rel('oferta', 'ofertas_editoriais', true), texto('papel', true), { name: 'posicao', type: 'number', required: true }] }],
        hooks: { ...c.hooks, beforeChange: [...(c.hooks?.beforeChange ?? []), validaEscolhas] } } as CollectionConfig
    }), ...colecoes(programas)] }
  }
}
