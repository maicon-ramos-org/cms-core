/** Só fixture OpenNext: mesmos hooks de produção, sem alterar GeneratedTypes/schema default. */
import type { Plugin } from 'payload'
import { bancoComValorClaimPreservado, preparaOperacaoValorClaim, preservaValorClaim } from '../../../packages/cms-core/src/grafo/valor-claim'

export const claimsJsonFixture: Plugin = config => ({
  ...config, db: bancoComValorClaimPreservado(config.db),
  collections: [...(config.collections ?? []), {
    slug: 'claims' as never, custom: { tenantCampoProprio: true }, versions: { maxPerDoc: 50 },
    hooks: { beforeOperation: [preparaOperacaoValorClaim] },
    access: { read: ({ req }) => Boolean(req.user), create: ({ req }) => req.user?.roles.includes('agente') ?? false,
      update: ({ req }) => req.user?.roles.includes('agente') ?? false, delete: () => false },
    fields: [{ name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true },
      { name: 'texto', type: 'text', required: true }, { name: 'origem', type: 'text', required: true },
      { name: 'valor', type: 'json', hooks: { beforeValidate: [preservaValorClaim] } },
      { name: 'outro_json', type: 'json' }],
  }],
})
