import type { APIRoute } from 'astro'
import { cmsFetch } from '../../../../../src/lib/cms'
export const GET: APIRoute = async ({ locals }) => {
  const path = `/api/categorias?tenant=${locals.tenant.id}`
  return Response.json(await Promise.all([cmsFetch(path), cmsFetch(path)]))
}
