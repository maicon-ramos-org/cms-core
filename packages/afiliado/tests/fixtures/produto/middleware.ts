import { tenant } from './dados'
import type { MiddlewareHandler } from 'astro'
export const onRequest: MiddlewareHandler = async ({ locals }, next) => {
  Object.assign(locals, { tenant })
  return next()
}
