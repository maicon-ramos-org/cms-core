import type { Access, PayloadRequest } from 'payload'

/**
 * Papéis (contrato: PRD 01 RF3):
 * - super-admin: o dono da instância — tudo, todos os tenants
 * - agente:      os agentes de conteúdo e de build — CRUD no(s) tenant(s)
 * - editor:      humano editando via admin
 * - ingestao:    ingestao-worker — SÓ cria draft (hook draftOnlyIngestao)
 * - sistema:     processos server-side (web logando cliques/queries) — escrita em coleções de log
 */
export type Papel = 'super-admin' | 'agente' | 'editor' | 'ingestao' | 'sistema'

type UserLike = { roles?: Papel[] | string[] | null } | null | undefined

/**
 * `user: unknown` e não `UserLike`: o tipo de `req.user` vem do `payload-types.ts` DO SITE.
 * Compilado sozinho, o pacote do núcleo não o tem (é o `UntypedUser` do Payload).
 */
export const hasRole = (user: unknown, role: Papel): boolean =>
  Boolean((user as UserLike)?.roles?.includes(role as never))

export const isSuperAdmin = (user: unknown): boolean => hasRole(user, 'super-admin')

export const authenticated: Access = ({ req }) => Boolean(req.user)

export const superAdminOnly: Access = ({ req }) => isSuperAdmin(req.user)

/** Escrita reservada a processos do sistema (ou super-admin) — cliques, links_gerados, queries_log */
export const sistemaOnly: Access = ({ req }) =>
  isSuperAdmin(req.user) || hasRole(req.user, 'sistema')

export const podeEscreverConteudo: Access = ({ req }) =>
  isSuperAdmin(req.user) ||
  hasRole(req.user, 'agente') ||
  hasRole(req.user, 'editor') ||
  hasRole(req.user, 'ingestao')

export const nunca: Access = () => false

export type { PayloadRequest }
