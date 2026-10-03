import { APIError, type Access, type CollectionBeforeValidateHook, type CollectionConfig, type Field, type FieldAccess } from 'payload'

import { authenticated, entrouPorChave, isSuperAdmin, superAdminOnly } from '../access/roles'

const idDe = (valor: unknown): string | undefined => {
  const id = (valor as { id?: unknown } | null | undefined)?.id
  return typeof id === 'number' || typeof id === 'string' ? String(id) : undefined
}

/**
 * Leitura de `users`: o super-admin vê todos; os demais, só o próprio documento
 * (`/api/users/me` continua; `/api/users/<id de outro>` vira 404). Antes era `authenticated`, e
 * com o campo `apiKey` decifrado na leitura qualquer chave (até a do servidor do site) listava a
 * API key de todos os usuários em texto puro.
 */
export const leituraDeUsuarios: Access = (args) => {
  if (!authenticated(args)) return false
  if (isSuperAdmin(args.req.user)) return true
  const meu = idDe(args.req.user)
  return meu === undefined ? false : { id: { equals: meu } }
}

/**
 * Edição de `users`: o super-admin edita qualquer um; os demais só a si mesmos E só numa
 * sessão de login. Quem entra por API key não edita usuário nenhum: uma chave vazada gravava
 * uma SENHA no próprio usuário e entrava no /admin por ela — acesso que sobrevivia à troca da
 * chave. Chave e senha de usuário de serviço são da semente.
 */
export const edicaoDeUsuarios: Access = ({ req, id }) => {
  if (isSuperAdmin(req.user)) return true
  if (!req.user || entrouPorChave(req.user)) return false
  if (!authenticated({ req } as Parameters<Access>[0])) return false
  const meu = idDe(req.user)
  return meu !== undefined && id !== undefined && id !== null && meu === String(id)
}

/** Campo do próprio usuário: lê quem é dono do documento, ou o super-admin. */
export const doDonoOuSuperAdmin: FieldAccess = ({ req, doc, id }) => {
  if (isSuperAdmin(req.user)) return true
  const meu = idDe(req.user)
  const alvo = idDe(doc) ?? (id === undefined || id === null ? undefined : String(id))
  return meu !== undefined && alvo !== undefined && meu === alvo
}

/**
 * Por API key, nem o super-admin troca senha ou e-mail de usuário (nem o próprio): a chave é
 * credencial de máquina, e uma chave vazada não pode virar sessão permanente no /admin. A troca
 * de senha/e-mail é do /admin (sessão de login) ou da semente (API local, sem usuário).
 */
export const senhaEEmailSoEmSessao: CollectionBeforeValidateHook = ({ data, originalDoc, operation, req }) => {
  if (operation !== 'update' || !data || !entrouPorChave(req.user)) return data
  const trocaEmail = 'email' in data && data.email !== undefined && data.email !== (originalDoc as { email?: unknown } | undefined)?.email
  if ('password' in data || trocaEmail) {
    throw new APIError('Senha e e-mail de usuário não se alteram por API key: use uma sessão do /admin.', 403, undefined, true)
  }
  return data
}

/**
 * Os campos de API key do Payload só entram na coleção na sanitização (`getBaseAuthFields`).
 * Declarar um campo com o MESMO nome faz o Payload fundir o nosso com o dele
 * (`mergeBaseFields`): ficam o tipo, os hooks (cifra/decifra) e a coluna dele, mais o `access`
 * daqui. Mesma ordem de campos, mesmo schema.
 *
 * O super-admin continua lendo `apiKey`: o componente de API key do /admin GERA uma chave nova
 * quando o campo chega vazio com `enableAPIKey` ligado; se ele não lesse, salvar um usuário de
 * serviço pelo /admin trocaria a chave sem aviso. A autenticação (por chave e por JWT) lê com
 * `overrideAccess`, então não depende destas regras.
 */
export const CAMPOS_DE_CHAVE: Field[] = [
  { name: 'enableAPIKey', type: 'checkbox', access: { read: doDonoOuSuperAdmin } },
  { name: 'apiKey', type: 'text', access: { read: doDonoOuSuperAdmin } },
  // o HMAC da chave: ninguém lê pela API
  { name: 'apiKeyIndex', type: 'text', access: { read: () => false } },
]

/**
 * Contrato PRD 01 RF3 — auth com useAPIKey; uma key POR agente
 * (hermes-redator, hermes-estrategista, hermes-severino, claude-code-build,
 * ingestao-worker, web-server). Roles definem o que cada um pode.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: { useAPIKey: true },
  admin: { useAsTitle: 'email', group: 'Sistema' },
  access: {
    create: superAdminOnly,
    delete: superAdminOnly,
    read: leituraDeUsuarios,
    update: edicaoDeUsuarios,
  },
  hooks: {
    beforeValidate: [senhaEEmailSoEmSessao],
  },
  fields: [
    { name: 'nome', type: 'text', required: true },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['editor'],
      options: [
        { label: 'Super Admin', value: 'super-admin' },
        { label: 'Agente', value: 'agente' },
        { label: 'Editor', value: 'editor' },
        { label: 'Ingestão (só draft)', value: 'ingestao' },
        { label: 'Sistema (logs)', value: 'sistema' },
      ],
      access: { update: ({ req }) => isSuperAdmin(req.user) },
    },
    ...CAMPOS_DE_CHAVE,
  ],
}
