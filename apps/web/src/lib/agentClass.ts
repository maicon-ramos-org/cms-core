import { isbot } from 'isbot'

const AGENTES_IA = [
  /GPTBot/i,
  /ChatGPT-User/i,
  /OAI-SearchBot/i,
  /Claude-User/i,
  /Claude-SearchBot/i,
  /ClaudeBot/i,
  /PerplexityBot/i,
  /Perplexity-User/i,
  /Google-Extended/i,
  /meta-externalagent/i,
]

/** Classe do user-agent no log de cliques: humano | bot | agente-ia (via isbot + lista IA). */
export const classificaUserAgent = (ua: string | null): 'humano' | 'bot' | 'agente-ia' => {
  if (!ua) return 'humano'
  if (AGENTES_IA.some((re) => re.test(ua))) return 'agente-ia'
  return isbot(ua) ? 'bot' : 'humano'
}
