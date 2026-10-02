import { ofertaPorSlug } from './dados'
export const getOfertaBySlug = async (_tenant: unknown, slug: string) => ofertaPorSlug(slug)
export const getOfertasDaLoja = async () => []
export const caminhoDaOferta = (oferta: { slug: string; wordpress_id?: string | null }) =>
  `/${oferta.wordpress_id?.startsWith('app:') ? 'apps' : 'ofertas'}/${oferta.slug}/`
export const urlMidia = (url: string | null | undefined) => url ? new URL(url, 'https://media.example.test').href : undefined
