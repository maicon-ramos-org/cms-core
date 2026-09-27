import { describe, expect, it } from 'vitest'

import { withWebMcpOriginTrial } from '../src/index'

const origin = 'https://site.example'
const token = 'YWFhYmJiY2NjZA=='
const page = () => new Response('<h1>Olá</h1>', {
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' },
})
const request = (url = `${origin}/contato/`, method = 'GET') => new Request(url, { method })

describe('withWebMcpOriginTrial', () => {
  it('adiciona o header só ao HTML canônico, mantendo status, corpo e cache', async () => {
    const original = page()
    const result = withWebMcpOriginTrial(original, request(), token, origin)
    expect(result).not.toBe(original)
    expect(result.headers.get('origin-trial')).toBe(token)
    expect(result.headers.get('cache-control')).toBe('public, max-age=60')
    expect(result.status).toBe(200)
    expect(await result.text()).toBe('<h1>Olá</h1>')
    expect(original.headers.get('origin-trial')).toBeNull()
  })

  it.each([
    ['sem token', undefined, origin, request(), page()],
    ['token inválido', 'invalido\nheader', origin, request(), page()],
    ['sem origem', token, undefined, request(), page()],
    ['origem não HTTPS', token, 'http://site.example', request(), page()],
    ['outra origem', token, origin, request('https://outro.example/'), page()],
    ['escrita', token, origin, request(`${origin}/contato/`, 'POST'), page()],
    ['JSON', token, origin, request(), new Response('{}', { headers: { 'content-type': 'application/json' } })],
    ['redirect', token, origin, request(), new Response(null, { status: 301, headers: { location: '/' } })],
    ['erro HTML', token, origin, request(), new Response('Erro', { status: 404, headers: { 'content-type': 'text/html' } })],
  ])('não ativa em %s', (_caso, chave, permitida, req, original) => {
    expect(withWebMcpOriginTrial(original, req, chave, permitida)).toBe(original)
    expect(original.headers.get('origin-trial')).toBeNull()
  })
})
