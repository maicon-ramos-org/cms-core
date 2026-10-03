import type { Access, CollectionConfig, FieldAccess } from 'payload'

import { hasRole, isSuperAdmin, superAdminOnly } from '../access/roles'

/** Quem cuida da caixa de entrada: super-admin e editor (humanos do /admin). */
const daCaixaDeEntrada = (user: unknown): boolean => isSuperAdmin(user) || hasRole(user, 'editor')

/**
 * Criar: o servidor do site (papel `sistema`, a chave que o endpoint de contato usa) e o
 * super-admin. Não é mais pública: a criação direta em `/api/mensagens` pulava o honeypot e o
 * limite por IP, que moram no endpoint do site.
 */
export const criacaoDeMensagens: Access = ({ req }) => isSuperAdmin(req.user) || hasRole(req.user, 'sistema')

/**
 * Ler: super-admin, editor e `sistema` — o endpoint do site conta as mensagens por `ip_hash` na
 * última hora (limite por IP) e só usa `totalDocs`. Agentes de conteúdo não leem.
 */
export const leituraDeMensagens: Access = ({ req }) => daCaixaDeEntrada(req.user) || hasRole(req.user, 'sistema')

/** Editar (marcar lida): super-admin e editor. */
export const edicaoDeMensagens: Access = ({ req }) => daCaixaDeEntrada(req.user)

/** Dado pessoal de quem escreveu: só super-admin e editor leem (para `sistema`, sai da resposta). */
export const campoPessoalDaMensagem: FieldAccess = ({ req }) => daCaixaDeEntrada(req.user)

/** Os campos com dado pessoal de quem escreveu. */
export const CAMPOS_PESSOAIS_DA_MENSAGEM = ['nome', 'email', 'mensagem', 'origem_url', 'user_agent'] as const

const pessoal = { read: campoPessoalDaMensagem }

/**
 * Caixa de entrada do formulário de contato (contrato colecoes.md).
 *
 * Quem escreve é o endpoint de contato do site, com a chave do papel `sistema`: é ele que segura
 * honeypot e limite por IP (validação de spam é do transporte; o schema só garante o formato, por
 * isso não há rich text e os campos têm teto de tamanho). A coleção não aceita escrita anônima.
 *
 * Mensagem de leitor não é conteúdo público: nome, e-mail, texto, página de origem e user-agent
 * só para super-admin e editor; o `sistema` vê o resto (o `ip_hash`, para o limite por IP).
 *
 * Sem `versions`: mensagem não tem rascunho nem histórico de revisão — ela chega uma vez.
 */
export const Mensagens: CollectionConfig = {
  slug: 'mensagens',
  admin: {
    group: 'Conteúdo',
    useAsTitle: 'nome',
    defaultColumns: ['nome', 'email', 'lida', 'createdAt'],
  },
  access: {
    create: criacaoDeMensagens,
    read: leituraDeMensagens,
    update: edicaoDeMensagens,
    delete: superAdminOnly,
  },
  fields: [
    { name: 'nome', type: 'text', required: true, maxLength: 120, access: pessoal },
    { name: 'email', type: 'email', required: true, access: pessoal },
    { name: 'mensagem', type: 'textarea', required: true, maxLength: 4000, access: pessoal },
    {
      name: 'origem_url',
      type: 'text',
      access: pessoal,
      admin: { description: 'de qual página a pessoa escreveu' },
    },
    {
      name: 'lida',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'a caixa de entrada é a lista de não-lidas' },
    },
    {
      name: 'user_agent',
      type: 'text',
      access: pessoal,
      admin: { readOnly: true, description: 'preenchido pelo endpoint' },
    },
    {
      name: 'ip_hash',
      type: 'text',
      admin: {
        readOnly: true,
        description: 'IP HASHEADO — o cru nunca é gravado (mesma regra do redirect de afiliado)',
      },
    },
  ],
}
