import type { APIRoute } from 'astro'
import config from 'virtual:editorial/config'

// `servico` é o que o site declara em `editorial({ config: { servico } })`: quem lê o
// /healthz (smoke, monitoramento) vê o nome que ele sempre viu, mesmo o site mudando de pasta.
export const GET: APIRoute = () => Response.json({ ok: true, servico: config.servico ?? 'editorial' })
