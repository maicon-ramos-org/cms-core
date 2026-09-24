/**
 * GET /.well-known/mcp.json — o que este site oferece a agente (PRD 11 RF9).
 *
 * ANUNCIA SÓ O QUE EXISTE. O MCP remoto do PRD 06 ainda não está no ar; listá-lo aqui
 * seria mandar o agente para um endereço morto, que é pior que não anunciar nada. Quando
 * `apps/mcp` subir, ele entra neste mesmo documento — o campo já está previsto abaixo,
 * comentado, com o formato pronto.
 *
 * O host sai do tenant: marca cravada em rota é o que o projeto proíbe desde o começo.
 */
import type { APIRoute } from 'astro'
import config from 'virtual:editorial/config'

import { deNicho } from '../../lib/nicho'
import { texto } from '../../textos'

/**
 * As ferramentas do `Ferramentas` do tema. O site que troca o componente registra outras, e
 * por isso declara a lista dele em `config.mcp.ferramentasPorRota`.
 */
const FERRAMENTAS_DO_TEMA: Record<string, string[]> = {
  '*': ['buscar_no_site', 'markdown_desta_pagina (onde há gêmeo .md)'],
  '/{slug} (artigo)': ['resumo_do_artigo', 'sumario_do_artigo'],
  '/blog/, /categoria/{slug}, /tag/{slug}': ['buscar_artigo'],
}

export const GET: APIRoute = async (context) => {
  const tenant = context.locals.tenant
  const base = `https://${tenant.canonical_host}`

  const doc = {
    /*
     * `serverInfo` é o que a especificação do MCP Server Card (SEP-1649) pede, e a ausência
     * dele fazia um validador externo classificar este documento como "JSON sem os campos
     * obrigatórios" — ou seja, o arquivo existia e não contava. `name` na raiz fica por
     * compatibilidade com quem lê o formato antigo; os dois apontam pro mesmo tenant.
     */
    serverInfo: {
      name: tenant.nome,
      version: '1.0.0',
    },
    name: tenant.nome,
    description: texto(config.textos, 'descricaoDoMcp', { nome: tenant.nome, nicho: deNicho(tenant) }),
    /**
     * As ferramentas que o agente do navegador encontra ao abrir uma página. Não é uma
     * lista de endpoints: são registradas na própria página, por tipo de rota, e só
     * existem enquanto a aba existe.
     */
    webmcp: {
      spec: 'https://github.com/webmachinelearning/webmcp',
      disponivel_em: 'document.modelContext',
      ferramentas_por_rota: config.mcp?.ferramentasPorRota ?? FERRAMENTAS_DO_TEMA,
      formularios_anotados: config.mcp?.formulariosAnotados ?? [
        'refinar_busca',
        config.contato?.ferramenta ?? 'enviar_mensagem',
      ],
    },
    /**
     * Superfícies que não dependem de navegador nenhum — servem qualquer leitor, hoje.
     */
    leitura_direta: {
      markdown_de_cada_pagina: 'adicione .md ao caminho da página',
      /*
       * Negociação por header, como a Cloudflare padronizou: a MESMA URL devolve markdown
       * quando `text/markdown` vem antes de `text/html` no Accept. O sufixo `.md` continua
       * valendo — quem descobre pelo header não precisa saber da convenção.
       */
      markdown_por_header: 'Accept: text/markdown na URL normal da página',
      indice_de_busca: `${base}/search-index.json`,
      llms_txt: `${base}/llms.txt`,
      feed: `${base}/feed.xml`,
      sitemap: `${base}/sitemap_index.xml`,
    },
    /**
     * Regras que valem para toda superfície — no site de ofertas, que preço e desconto nunca
     * saem sem a data em que foram conferidos. Sem declaração do site, a chave não sai.
     */
    garantias: config.mcp?.garantias,
    // mcp_remoto: { url: `https://mcp.${tenant.canonical_host}`, transporte: 'streamable-http' },
    contato: `${base}/contato/`,
  }

  return new Response(JSON.stringify(doc, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
