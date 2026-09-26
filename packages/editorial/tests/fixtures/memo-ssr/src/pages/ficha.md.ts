import type { APIRoute } from 'astro'
import { cmsFetch } from '../../../../../src/lib/cms'
export const GET: APIRoute = async ({ locals }) => {
  const path = `/api/categorias?tenant=${locals.tenant.id}`
  const [a, b] = await Promise.all([cmsFetch(path), cmsFetch(path)])
  return new Response(`# Ficha pública\n${JSON.stringify(a)}\n${JSON.stringify(b)}\n`, { headers: { 'content-type': 'text/markdown; charset=utf-8' } })
}
