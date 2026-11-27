import { describe, expect, it } from 'vitest'
import { serverAwake } from './serverAwake'

const reply = (body: string, type: string, status = 200) => (async () => new Response(body, { status, headers: { 'Content-Type': type } })) as typeof fetch

describe('serverAwake', () => {
  it('is true only for our health JSON', async () => {
    expect(await serverAwake(reply('{"status":"ok"}', 'application/json; charset=utf-8'))).toBe(true)
    expect(await serverAwake(reply('<html>Render is waking up</html>', 'text/html'))).toBe(false)
    expect(await serverAwake(reply('{"status":"ok"}', 'application/json', 503))).toBe(false)
    expect(await serverAwake(reply('{"status":"unavailable"}', 'application/json'))).toBe(false)
  })
  it('treats a network error or a hanging request as asleep', async () => {
    expect(await serverAwake((async () => { throw new TypeError('offline') }) as typeof fetch)).toBe(false)
    const hang = ((_: unknown, init?: RequestInit) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError'))))) as typeof fetch
    expect(await serverAwake(hang, 50)).toBe(false)
  })
})
