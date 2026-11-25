import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoResponse } from './browser'
import { mockLogout, mockIdentity } from './auth'

const call = (path: string, method = 'GET', body?: unknown) => demoResponse(new Request(`https://demo.invalid/api${path}`, {
  method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
}))
afterEach(() => { mockLogout(); vi.clearAllTimers(); vi.useRealTimers() })

describe('guest demo handlers', () => {
  it('logs out, creates a guest, plays without account access and exits rooms on logout', async () => {
    vi.useFakeTimers()
    expect((await call('/auth/logout', 'POST')).status).toBe(204)
    expect((await (await call('/auth/room-identity')).json()).kind).toBe('anonymous')
    expect((await call('/auth/room-guest', 'POST', { displayName: 'x' })).status).toBe(400)
    const guest = await (await call('/auth/room-guest', 'POST', { displayName: 'Guest_Test' })).json()
    expect(guest.kind).toBe('guest')
    const request = call('/rooms', 'POST', { game: 'neverHave' })
    await vi.advanceTimersByTimeAsync(301)
    const room = await (await request).json()
    expect(room.players[0]).toMatchObject({ userId: guest.playerId, displayName: 'Guest_Test', isGuest: true })
    expect((await call('/me')).status).toBe(401)
    expect((await call(`/rooms/${room.code}/invite`, 'POST', { userIds: ['u2'] })).status).toBe(403)
    expect((await call('/auth/logout', 'POST')).status).toBe(204)
    expect((await call(`/rooms/${room.code}`)).status).toBe(401)
    await call('/auth/room-guest', 'POST', { displayName: 'New_Guest' })
    expect((await call(`/rooms/${room.code}`)).status).toBe(404)
  })

  it('expires guests without silently switching them into the demo member', async () => {
    vi.useFakeTimers(); mockLogout()
    await call('/auth/room-guest', 'POST', { displayName: 'Guest_Expiry' })
    await vi.advanceTimersByTimeAsync(10800001)
    expect(mockIdentity().kind).toBe('anonymous')
    expect((await call('/me')).status).toBe(401)
  })
})
