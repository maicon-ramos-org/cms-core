/**
 * Fumaça do site de referência (PRD 17 RF9): com o CMS e o site no ar, semeados, cada rota
 * do tema e do plugin responde o que deve — nos DOIS tenants — e um tenant não enxerga o
 * conteúdo do outro. É o que prova que o núcleo monta um site sem nada de site nenhum.
 *
 *   node scripts/fumaca-referencia.mjs --base=http://127.0.0.1:4321
 *
 * O host de cada tenant vai no cabeçalho `Host` (`{slug}.referencia.local`): o middleware do
 * tema resolve o tenant pelo sufixo, como em staging. Saída 1 se alguma rota falhar.
 */
import http from 'node:http'

const arg = (n, padrao) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? padrao
const BASE = new URL(arg('base', 'http://127.0.0.1:4321'))

/**
 * `node:http` e não `fetch`: o `fetch` do Node descarta o cabeçalho `Host` que a gente
 * passa, e toda requisição cairia no tenant padrão — o teste passaria olhando um tenant só.
 */
const pede = (slug, caminho) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: BASE.hostname, port: BASE.port, path: caminho, headers: { host: `${slug}.referencia.local` } },
      (res) => {
        let corpo = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (corpo += c))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            tipo: String(res.headers['content-type'] ?? ''),
            local: String(res.headers.location ?? ''),
            corpo,
          }),
        )
      },
    )
    req.on('error', reject)
    req.end()
  })

/** [caminho, status esperado, trecho que o corpo tem que ter (opcional), tipo (opcional)] */
const rotas = (slug, nome) => [
  ['/healthz', 200, '"ok":true'],
  ['/', 200, nome],
  ['/blog/', 200, `Primeiro artigo do tenant ${slug}`],
  ['/blog', 301],
  [`/primeiro-artigo-${slug}/`, 200, `Primeiro artigo do tenant ${slug}`],
  [`/primeiro-artigo-${slug}.md`, 200, `# Primeiro artigo do tenant ${slug}`, 'text/markdown'],
  ['/sobre/', 200, 'Página institucional de exemplo'],
  ['/categoria/guias/', 200, 'Guias'],
  ['/tag/iniciante/', 200, 'Iniciante'],
  ['/cupom-loja-exemplo/', 200, 'Loja Exemplo'],
  ['/ofertas/', 200, 'Oferta de exemplo'],
  ['/ofertas/oferta-exemplo/', 200, 'Oferta de exemplo'],
  ['/empresa/loja-exemplo/', 200, 'Loja Exemplo'],
  ['/busca/?q=exemplo', 200, 'Loja Exemplo'],
  ['/search-index.json', 200, `primeiro-artigo-${slug}`, 'application/json'],
  ['/sitemap_index.xml', 200, 'sitemap-posts.xml'],
  ['/sitemap-posts.xml', 200, `primeiro-artigo-${slug}`],
  ['/sitemap-ofertas.xml', 200, '/ofertas/oferta-exemplo/'],
  ['/llms.txt', 200, `# ${nome}`],
  ['/robots.txt', 200, 'User-agent'],
  ['/feed.xml', 200, `Primeiro artigo do tenant ${slug}`],
  ['/manifest.webmanifest', 200, nome],
  ['/.well-known/mcp.json', 200, nome],
  ['/nao-existe-de-jeito-nenhum/', 404],
]

const falhas = []
let total = 0
for (const [slug, nome, outro] of [
  ['exemplo', 'Exemplo', 'outro'],
  ['outro', 'Outro Exemplo', 'exemplo'],
]) {
  for (const [caminho, status, trecho, tipo] of rotas(slug, nome)) {
    total += 1
    const r = await pede(slug, caminho)
    const erros = []
    if (r.status !== status) erros.push(`status ${r.status}, esperado ${status}`)
    if (trecho && !r.corpo.includes(trecho)) erros.push(`sem "${trecho}"`)
    if (tipo && !r.tipo.includes(tipo)) erros.push(`tipo ${r.tipo}, esperado ${tipo}`)
    if (erros.length) falhas.push(`${slug} ${caminho}: ${erros.join('; ')}`)
  }
  // NADA CRUZA TENANT: o post de um não existe no outro
  total += 1
  const cruzado = await pede(slug, `/primeiro-artigo-${outro}/`)
  if (cruzado.status !== 404) falhas.push(`${slug} enxerga o post de ${outro} (status ${cruzado.status})`)
}

// o redirect de afiliado: toda oferta com link sai por /r/{id}, e ele leva à loja
const oferta = await pede('exemplo', '/ofertas/oferta-exemplo/')
const r = oferta.corpo.match(/href="(\/r\/[^"]+)"/)?.[1]
total += 1
if (!r) falhas.push('a oferta não tem link /r/')
else {
  const ida = await pede('exemplo', r)
  if (ida.status !== 302 || !ida.local.startsWith('https://loja.exemplo.test')) {
    falhas.push(`${r}: status ${ida.status}, destino ${ida.local}`)
  }
}

if (falhas.length) {
  console.error(`fumaça do site de referência: ${falhas.length} de ${total} falharam\n`)
  for (const f of falhas) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`fumaça do site de referência: ${total} verificações, todas ok`)
