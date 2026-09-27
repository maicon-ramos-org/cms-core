/**
 * Uma visita especulativa não é um clique afirmativo. A guarda é igual para as
 * duas famílias de redirect do plugin e precisa rodar ANTES de ler CMS ou registrar
 * sinal. Não depende de User-Agent: navegadores e extensões podem usar qualquer UA.
 */
export function requisicaoComercialEspeculativa(request: Request): boolean {
  return ['purpose', 'sec-purpose', 'x-purpose', 'x-moz']
    .some(nome => /prefetch|prerender/i.test(request.headers.get(nome) ?? ''))
}

export function respostaComercialEspeculativa(): Response {
  return new Response(null, { status: 204, headers: {
    'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
  } })
}
