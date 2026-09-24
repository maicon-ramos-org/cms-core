/**
 * PRD 24 (RF0.10, RF4) — em qual dist-tag do registro uma versão é publicada.
 *
 * Pré-lançamento (`0.2.0-next.1`, `1.0.0-rc.2`) sai em `next`: o `latest` continua na última
 * estável, e quem instala sem versão não recebe o pré-lançamento. O npm 11 também recusa
 * publicar pré-lançamento sem `--tag`.
 *
 * Versão estável devolve `null` e o `pacotes.yml` publica sem `--tag`, como antes: o npm
 * aplica o `latest` e mantém a trava dele que impede o `latest` de voltar para uma versão
 * menor (uma correção 0.1.1 publicada depois da 0.2.0).
 *
 * A regra é a do SemVer, a mesma do npm: pré-lançamento é o `-` antes do `+` dos metadados de
 * build, então `1.0.0+build-7` é estável.
 *
 * Linha de comando: `node scripts/dist-tag.mjs <versão>` imprime `next` ou nada.
 */
import { fileURLToPath } from 'node:url'

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/

/** `'next'` para pré-lançamento, `null` para estável; versão fora do SemVer lança erro. */
export function distTag(versao) {
  const m = SEMVER.exec(versao)
  if (!m) throw new Error(`${JSON.stringify(versao)} não é SemVer`)
  return m[1] ? 'next' : null
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const tag = distTag(process.argv[2] ?? '')
    if (tag) console.log(tag)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
