/**
 * Semente do site de referência — idempotente, com dado de EXEMPLO (nada de site real).
 * `pnpm --filter @maicon-ramos-org/referencia-cms seed`
 *
 * Dois tenants (`exemplo` e `outro`), porque o que o núcleo mais precisa provar é que nada
 * cruza tenant; usuários de serviço com chave por agente; e o mínimo de conteúdo para cada
 * rota do tema e do plugin ter o que mostrar: um post com categoria e tag, uma página, uma
 * loja com cupom e uma oferta.
 */
import './scripts/env'

import { mantemVivo, sair, semeia, upsert, type ContextoDoConteudo, type Semente } from '@maicon-ramos-org/cms-core/scripts'

import config from './payload.config'

const lexical = (texto: string) => ({
  root: {
    type: 'root',
    children: [{ type: 'paragraph', version: 1, children: [{ type: 'text', text: texto, version: 1 }] }],
    direction: null as null,
    format: '' as const,
    indent: 0,
    version: 1,
  },
})

/** Uma paleta que passa na trava de contraste do núcleo (os 11 pares críticos). */
const TEMA = {
  cor_primaria: '#6F57D3',
  cor_sobre_marca: '#ffffff',
  cor_fundo: '#ffffff',
  cor_acao: '#0A8429',
  cor_sobre_acao: '#ffffff',
  cor_desconto: '#AC0167',
  cor_verificado: '#0a7a2c',
  cor_texto: '#242424',
  cor_apoio: '#6b6b6b',
  cor_sutil: '#746a90',
  cor_superficie: '#ffffff',
  cor_superficie_marca: '#faf9ff',
  cor_superficie_verificado: '#f4fdf7',
  cor_borda: '#e7e4f0',
  cor_borda_codigo: '#cbbff0',
  cor_superficie_expirado: '#f4f6f9',
  cor_aviso: '#9a5b08',
}

const tenant = (slug: string, nome: string) => ({
  slug,
  nome,
  canonical_host: `${slug}.referencia.test`,
  tema: TEMA,
  seo: { sitemap_enabled: true },
})

// o nicho por extenso: a trava `confere-nicho-cravado` lê daqui os nichos que procura no código
const TENANTS: Semente['tenants'] = [
  { ...tenant('exemplo', 'Exemplo'), nicho: 'ferramentas de exemplo' },
  { ...tenant('outro', 'Outro Exemplo'), nicho: 'outro assunto' },
]

const USUARIOS: Semente['usuarios'] = [
  {
    email: 'admin@referencia.test',
    nome: 'admin',
    roles: ['super-admin'],
    tenants: [],
    senhaDoAmbiente: 'ADMIN_PASSWORD',
  },
  // a chave fixa do CI: o site sobe com ela sem ler de log
  {
    email: 'web-server@referencia.test',
    nome: 'web-server',
    roles: ['sistema'],
    tenants: ['exemplo', 'outro'],
    apiKeyDoAmbiente: 'SEED_API_KEY',
  },
]

const conteudo = async ({ payload, tenants }: ContextoDoConteudo) => {
  for (const [slug, id] of Object.entries(tenants)) {
    const categoria = await upsert(payload, 'categorias', { and: [{ slug: { equals: 'guias' } }, { tenant: { equals: id } }] }, {
      tenant: id,
      nome: 'Guias',
      slug: 'guias',
    })
    const tag = await upsert(payload, 'tags', { and: [{ slug: { equals: 'iniciante' } }, { tenant: { equals: id } }] }, {
      tenant: id,
      nome: 'Iniciante',
      slug: 'iniciante',
    })
    await upsert(payload, 'posts', { and: [{ slug: { equals: `primeiro-artigo-${slug}` } }, { tenant: { equals: id } }] }, {
      tenant: id,
      titulo: `Primeiro artigo do tenant ${slug}`,
      slug: `primeiro-artigo-${slug}`,
      corpo: lexical(`Artigo de exemplo do tenant ${slug}. Nenhum dado aqui é real.`),
      categoria: categoria.id,
      tags: [tag.id],
      publicado_em: '2026-09-01T12:00:00.000Z',
      _status: 'published',
    })
    await upsert(payload, 'pages', { and: [{ slug: { equals: 'sobre' } }, { tenant: { equals: id } }] }, {
      tenant: id,
      titulo: 'Sobre',
      slug: 'sobre',
      template: 'institucional',
      corpo: lexical('Página institucional de exemplo.'),
      _status: 'published',
    })
    const loja = await upsert(payload, 'lojas', { and: [{ slug: { equals: 'loja-exemplo' } }, { tenant: { equals: id } }] }, {
      tenant: id,
      nome: 'Loja Exemplo',
      slug: 'loja-exemplo',
      url_site: 'https://loja.exemplo.test',
      programa: 'outro',
    })
    const cupom = await upsert(payload, 'cupons', { and: [{ codigo: { equals: 'EXEMPLO10' } }, { tenant: { equals: id } }] }, {
      tenant: id,
      loja: loja.id,
      codigo: 'EXEMPLO10',
      desconto_tipo: 'percentual',
      desconto_valor: 10,
      condicoes: 'Cupom de exemplo — não é uma oferta real.',
      estado: 'publicado',
      fontes_count: 1,
      fontes: [{ origem: 'semente', ts: '2026-09-01T12:00:00.000Z' }],
      verificado_em: '2026-09-01T12:00:00.000Z',
      metodo: 'manual',
      url_afiliado_fonte: 'https://loja.exemplo.test/',
      _status: 'published',
    })
    await upsert(payload, 'ofertas', { and: [{ slug: { equals: 'oferta-exemplo' } }, { tenant: { equals: id } }] }, {
      tenant: id,
      loja: loja.id,
      titulo: 'Oferta de exemplo',
      slug: 'oferta-exemplo',
      tipo: 'cupom',
      cupom: cupom.id,
      corpo: lexical('Oferta de exemplo criada pela semente do site de referência.'),
      _status: 'published',
    })
  }
}

const encerra = mantemVivo()
semeia({ config, tenants: TENANTS, usuarios: USUARIOS, conteudo })
  .then(async () => {
    encerra()
    await sair(0)
  })
  .catch(async (err: unknown) => {
    encerra()
    console.error(err instanceof Error ? err.message : err)
    await sair(1)
  })
