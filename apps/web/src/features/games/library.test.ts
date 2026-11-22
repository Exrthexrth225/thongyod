import { describe, expect, it } from 'vitest'
import { fitsGroup, pushRecent, togglePin, topRow } from './library'

describe('games library', () => {
  it('keeps the last opened first, without duplicates, capped', () => {
    expect(pushRecent(['a', 'b', 'c', 'd'], 'c')).toEqual(['c', 'a', 'b', 'd'])
    expect(pushRecent(['a', 'b', 'c', 'd'], 'e')).toEqual(['e', 'a', 'b', 'c'])
  })
  it('toggles a pin', () => {
    expect(togglePin(['a'], 'b')).toEqual(['a', 'b'])
    expect(togglePin(['a', 'b'], 'a')).toEqual(['b'])
  })
  it('shows pins first, then recents not pinned, drops unknown', () => {
    expect(topRow(['x', 'b'], ['b', 'a', 'gone'], (id) => id !== 'gone')).toEqual([
      { id: 'x', pinned: true },
      { id: 'b', pinned: true },
      { id: 'a', pinned: false },
    ])
  })
  it('filters by group size', () => {
    expect(fitsGroup([3, 12], null)).toBe(true)
    expect(fitsGroup([3, 12], 2)).toBe(false)
    expect(fitsGroup([3, 12], 12)).toBe(true)
  })
})
