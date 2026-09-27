/**
 * WebMCP origin trials belong to an origin, not to a theme or a tenant.
 * The caller reads its own first-party token from a server-side secret and
 * supplies the exact public origin for that site.
 */
export function withWebMcpOriginTrial(
  response: Response,
  request: Request,
  token: string | undefined,
  allowedOrigin: string | undefined,
): Response {
  if (!token || token.length > 4096 || !/^[A-Za-z0-9+/=]+$/.test(token) ||
      !allowedOrigin || !/^https:\/\/[^/]+$/.test(allowedOrigin) ||
      request.method !== 'GET' || new URL(request.url).origin !== allowedOrigin ||
      response.status !== 200 ||
      !/^text\/html\b/i.test(response.headers.get('content-type') ?? '')) return response

  const enabled = new Response(response.body, response)
  enabled.headers.set('Origin-Trial', token)
  return enabled
}
