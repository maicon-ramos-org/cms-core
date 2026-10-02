import { tenant } from './dados'
import type { MiddlewareHandler } from 'astro'
export const onRequest: MiddlewareHandler = async ({ locals }, next) => {
  // Apenas fixture: não faz conexão com Payload nem usa credenciais reais.
  Object.assign(locals, { tenant })
  return next()
}
