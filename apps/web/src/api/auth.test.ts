import { describe, expect, it } from 'vitest'
import { guestReturnTo } from './auth'

describe('guest return targets', () => {
  it('preserves room links, creation settings and six-digit codes', () => {
    for (const path of ['/games/rooms', '/games/rooms/123456', '/games/rooms/new?game=spy']) expect(guestReturnTo(path)).toBe(path)
  })
  it('rejects external, account and encoded redirect destinations', () => {
    for (const path of ['https://evil.example/games/rooms', '//evil.example/games/rooms', '/me', '/games/rooms/12345', '/%2fgames/rooms', '/games/rooms\\evil']) expect(guestReturnTo(path)).toBe('/games/rooms')
  })
})
