/**
 * Semeadura de desenvolvimento (PRD 17 RF5c): cria os tenants e os usuários de serviço que
 * o site passa — uma chave de API POR agente (PRD 01 RF3) — e depois o conteúdo de exemplo
 * do site, se ele mandar. O núcleo não conhece tenant nenhum: tudo chega por parâmetro.
 *
 * SÓ CRIA. O que já existe (mesmo slug, mesmo email) fica como está, então rodar de novo
 * não troca chave nem senha de ninguém. Mudar um tenant que já existe é trabalho de script
 * do site, não da semente.
 *
 * Chave e senha nunca vêm escritas no código: ou do ambiente (a variável que o usuário
 * declara), ou geradas aqui. A gerada é impressa UMA vez, na criação — depois disso não há
 * como reexibir.
 */
import crypto from 'node:crypto'

import type { Payload, SanitizedConfig } from 'payload'

/** Um tenant da semente: o slug é a chave natural; o resto são os campos dele. */
export type TenantDaSemente = { slug: string } & Record<string, unknown>

export interface UsuarioDaSemente {
  email: string
  nome: string
  roles: string[]
  /** Slugs de tenants DESTA semente. */
  tenants: string[]
  /**
   * Variável de ambiente com a chave de API. Existe para o CI subir a pilha com uma chave
   * conhecida sem lê-la de log; sem a variável, a chave é aleatória como a dos outros.
   */
  apiKeyDoAmbiente?: string
  /**
   * Variável de ambiente com a senha. Sem ela, a senha é gerada e impressa na criação.
   * Usuário que não declara variável recebe senha aleatória e não impressa: entra por chave.
   */
  senhaDoAmbiente?: string
}

export interface ContextoDoConteudo {
  payload: Payload
  /** id de cada tenant da semente, pelo slug. */
  tenants: Record<string, number | string>
}

export interface Semente {
  tenants: TenantDaSemente[]
  usuarios: UsuarioDaSemente[]
  /** O conteúdo de exemplo do site — roda depois dos usuários e antes do resumo. */
  conteudo?: (ctx: ContextoDoConteudo) => Promise<void>
}

export interface ResultadoDaSemente {
  tenants: Record<string, number | string>
  chavesNovas: Array<{ usuario: string; apiKey: string }>
}

/** Devolve o documento que casa com `where` ou cria com `data`. Nunca atualiza. */
export async function upsert<T extends Record<string, unknown>>(
  payload: Payload,
  collection: string,
  where: Record<string, unknown>,
  data: T,
): Promise<{ id: string | number; criado: boolean; doc: Record<string, unknown> }> {
  const found = await payload.find({
    collection: collection as never,
    where: where as never,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const primeiro = found.docs[0] as { id: string | number } | undefined
  if (primeiro) return { id: primeiro.id, criado: false, doc: primeiro }
  const doc = (await payload.create({
    collection: collection as never,
    data: data as never,
    depth: 0,
    overrideAccess: true,
  })) as { id: string | number }
  return { id: doc.id, criado: true, doc }
}

/** A semente sobre um Payload já aberto. */
export async function aplicaSemente(payload: Payload, semente: Semente): Promise<ResultadoDaSemente> {
  // referência quebrada é erro de quem escreveu a semente: falha antes de criar qualquer coisa
  const slugs = new Set(semente.tenants.map((t) => t.slug))
  for (const u of semente.usuarios) {
    const fora = u.tenants.find((t) => !slugs.has(t))
    if (fora) throw new Error(`o usuário ${u.email} aponta para o tenant "${fora}", que não está na semente`)
  }

  const tenants: Record<string, number | string> = {}
  for (const t of semente.tenants) {
    tenants[t.slug] = (await upsert(payload, 'tenants', { slug: { equals: t.slug } }, t)).id
  }

  const chavesNovas: ResultadoDaSemente['chavesNovas'] = []
  const senhasGeradas: Array<{ usuario: string; variavel: string; senha: string }> = []
  for (const u of semente.usuarios) {
    const apiKey = (u.apiKeyDoAmbiente && process.env[u.apiKeyDoAmbiente]) || crypto.randomUUID()
    const senhaDoAmbiente = u.senhaDoAmbiente ? process.env[u.senhaDoAmbiente] : undefined
    const senha = senhaDoAmbiente ?? crypto.randomUUID()
    const r = await upsert(payload, 'users', { email: { equals: u.email } }, {
      email: u.email,
      password: senha,
      nome: u.nome,
      roles: u.roles,
      enableAPIKey: true,
      apiKey,
      tenants: u.tenants.map((slug) => ({ tenant: tenants[slug] })),
    })
    if (!r.criado) continue
    chavesNovas.push({ usuario: u.email, apiKey })
    if (u.senhaDoAmbiente && senhaDoAmbiente === undefined) {
      senhasGeradas.push({ usuario: u.email, variavel: u.senhaDoAmbiente, senha })
    }
  }

  if (semente.conteudo) await semente.conteudo({ payload, tenants })

  payload.logger.info('Seed concluído.')
  for (const s of senhasGeradas) {
    payload.logger.info(`Senha do ${s.usuario} GERADA agora (defina ${s.variavel} pra escolher): ${s.senha}`)
  }
  if (chavesNovas.length > 0) {
    payload.logger.info('API keys criadas AGORA (anote — não são reexibidas):')
    for (const k of chavesNovas) payload.logger.info(`  ${k.usuario}: ${k.apiKey}`)
  } else {
    payload.logger.info('Nenhum usuário novo — keys existentes preservadas.')
  }
  return { tenants, chavesNovas }
}

/**
 * Abre o Payload do site e semeia. Recusa produção antes de abrir qualquer conexão: a
 * semente cria usuários com chave de API, e isso não pode acontecer por engano no ar.
 *
 * Quem chama segura o event loop (`mantemVivo`) e encerra com `sair`.
 */
export async function semeia({
  config,
  ...semente
}: Semente & { config: SanitizedConfig | Promise<SanitizedConfig> }): Promise<ResultadoDaSemente> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed é de DESENVOLVIMENTO — não roda com NODE_ENV=production.')
  }
  const { getPayload } = await import('payload')
  const payload = await getPayload({ config })
  try {
    return await aplicaSemente(payload, semente)
  } finally {
    await payload.destroy()
  }
}
