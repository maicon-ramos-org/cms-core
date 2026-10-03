/**
 * Endurecimento das coleções INTERNAS do Payload, que só nascem na sanitização da config
 * (`buildConfig`), depois de todos os plugins — por isso a fábrica aplica isto sobre a config
 * já sanitizada, e não como plugin.
 *
 * - `payload-locked-documents`: no Payload 3.88 a coleção tem o acesso padrão (qualquer
 *   autenticado) e o campo `user` aceita qualquer valor. Qualquer API key — até a do servidor
 *   do site — criava uma trava em nome de OUTRO usuário, e a trava fazia o PATCH/DELETE dos
 *   agentes falhar com 423 por ~5 min, renovável. Agora só sessão de login (o /admin) cria,
 *   altera ou apaga trava, e sempre em nome próprio (`user` é quem pede). O /admin cria a trava
 *   pelo banco (`db.create`, sem acesso) e usa a REST só para ler, assumir e soltar.
 * - `payload-preferences`: a REST padrão (`POST /api/payload-preferences`) aceitava qualquer
 *   chave. O /admin grava preferências pela API local e pelas rotas `/:key`; a escrita pela
 *   REST fica só para sessão de login.
 *
 * Quem entra por API key é credencial de máquina (agente, servidor do site): não tem trava de
 * edição nem preferência de interface.
 */
import type { Access, CollectionBeforeChangeHook, SanitizedConfig } from 'payload'

import { authenticated, entrouPorChave } from './roles'

/** Sessão de login (não API key), de usuário autenticado e não site-reader. */
export const emSessaoDeLogin: Access = (args) => authenticated(args) && !entrouPorChave(args.req.user)

/** O `user` da trava é sempre quem pede (o /admin manda o próprio usuário ao assumir a edição). */
export const travaEmNomeProprio: CollectionBeforeChangeHook = ({ data, req }) => {
  const user = req.user as { id?: string | number; collection?: string } | null | undefined
  if (!data || user?.id === undefined || user.id === null || !user.collection) return data
  return { ...data, user: { relationTo: user.collection, value: user.id } }
}

/** Aplica as regras acima à config sanitizada (mutação: é a config que o Payload usa). */
export function endureceColecoesInternas(config: SanitizedConfig): SanitizedConfig {
  const porSlug = new Map(config.collections.map((c) => [c.slug, c]))
  const trava = porSlug.get('payload-locked-documents')
  const prefs = porSlug.get('payload-preferences')
  if (!trava || !prefs) throw new Error('cmsCore: coleções internas do Payload ausentes (payload-locked-documents / payload-preferences)')

  trava.access = { ...trava.access, create: emSessaoDeLogin, update: emSessaoDeLogin, delete: emSessaoDeLogin }
  trava.hooks.beforeChange = [travaEmNomeProprio, ...(trava.hooks.beforeChange ?? [])]

  prefs.access = { ...prefs.access, create: emSessaoDeLogin, update: emSessaoDeLogin }
  return config
}
