// PRD 24 RF4 — prova que `opennextjs-cloudflare build` monta o CMS de referência num
// Worker. Sem cache override: nunca é servido de verdade (nunca há `deploy`), então o
// incremental cache padrão (memória) basta.
//
// `buildCommand: 'next build --webpack'` — o mesmo achado do spike do Payload na Cloudflare
// (PRD 24 RF0.13, no runbook de uma instância nova): com o Turbopack
// (padrão do Next 16), o `next build` gera um `require()` de nome hasheado para o binário
// nativo de imagem instalado (`sharp-<hash>`, achado desta RF4 — lá era `drizzle-kit-<hash>`)
// que não corresponde ao nome do pacote, então nem `serverExternalPackages` o alcança e o
// esbuild do OpenNext falha com "Could not resolve". O webpack não gera esse alias.
import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// `buildCommand` é do `OpenNextConfig` base (`@opennextjs/aws`), fora do tipo
// `CloudflareOverrides` que `defineCloudflareConfig` recebe — por isso entra depois, no
// objeto que ela devolve, e não como opção.
export default { ...defineCloudflareConfig({}), buildCommand: 'next build --webpack' }
