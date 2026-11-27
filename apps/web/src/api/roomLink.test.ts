import { describe, expect, it } from 'vitest'
import type { Room } from './types'
import { newActionId, newerRoom, roomSocketsEnabled } from './roomLink'

describe('roomSocketsEnabled', () => {
  it('is off in the Pages demo and when dev mocks cover rooms', () => {
    expect(roomSocketsEnabled({ DEV: false, VITE_DEPLOY_MOCKS: 'true' })).toBe(false)
    expect(roomSocketsEnabled({ DEV: true })).toBe(false)
    expect(roomSocketsEnabled({ DEV: true, VITE_API_MOCKS: 'all' })).toBe(false)
    expect(roomSocketsEnabled({ DEV: true, VITE_API_MOCKS: 'auth, rooms' })).toBe(false)
  })
  it('is on for the real app and when rooms come from the real backend', () => {
    expect(roomSocketsEnabled({ DEV: false })).toBe(true)
    expect(roomSocketsEnabled({ DEV: true, VITE_API_MOCKS: 'off' })).toBe(true)
    expect(roomSocketsEnabled({ DEV: true, VITE_API_MOCKS: 'friends,home' })).toBe(true)
  })
})

describe('newActionId', () => {
  it('makes distinct RFC 4122 v4 ids the server accepts', () => {
    const ids = new Set(Array.from({ length: 200 }, newActionId))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('newerRoom', () => {
  const room = (code: string, revision: number) => ({ code, revision }) as Room
  it('never goes back to an older snapshot', () => {
    const now = room('123456', 5)
    expect(newerRoom(now, room('123456', 4))).toBe(now)
    const same = room('123456', 5)
    expect(newerRoom(now, same)).toBe(same)
    const next = room('123456', 6)
    expect(newerRoom(now, next)).toBe(next)
  })
  it('takes any snapshot of another room or when nothing is cached', () => {
    const other = room('654321', 1)
    expect(newerRoom(room('123456', 9), other)).toBe(other)
    expect(newerRoom(undefined, other)).toBe(other)
  })
})
