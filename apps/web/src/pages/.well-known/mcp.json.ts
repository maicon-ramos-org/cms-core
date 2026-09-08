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
    description:
      'Cupons e ofertas de software e hospedagem, com a data em que cada preço e cada desconto foram conferidos.',
    /**
     * As ferramentas que o agente do navegador encontra ao abrir uma página. Não é uma
     * lista de endpoints: são registradas na própria página, por tipo de rota, e só
     * existem enquanto a aba existe.
     */
    webmcp: {
      spec: 'https://github.com/webmachinelearning/webmcp',
      disponivel_em: 'document.modelContext',
      ferramentas_por_rota: {
        '*': ['buscar_no_site', 'markdown_desta_pagina (onde há gêmeo .md)'],
        '/{slug} (artigo)': ['resumo_do_artigo', 'sumario_do_artigo'],
        '/ofertas/{slug}': ['resumo_da_oferta', 'ver_cupom', 'ir_para_a_loja'],
        '/cupom-{loja}': ['listar_cupons_da_loja', 'ver_cupom'],
        '/ofertas/ e /lifetimes/': ['filtrar_ofertas'],
        '/blog/, /categoria/{slug}, /tag/{slug}': ['buscar_artigo'],
        '/apps/': ['buscar_app'],
        '/apps/{slug}': ['requisitos_do_app'],
      },
      formularios_anotados: ['buscar_no_runzos', 'refinar_busca', 'enviar_mensagem_ao_runzos'],
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
     * Regra que vale para toda superfície, e que é o produto: preço e desconto nunca saem
     * sem a data em que foram conferidos.
     */
    garantias: {
      dado_verificado: 'todo preço e todo desconto vêm com verificado_em ou preco_em',
      links_de_saida: 'sempre /r/{id} — nunca link de afiliado cru',
    },
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
