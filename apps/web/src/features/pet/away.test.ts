import { describe, expect, it } from 'vitest'
import { AWAY_MS, SOUVENIRS, awayEvent } from './away'

const always = (pick: number) => (max: number) => Math.min(pick, max - 1)

describe('awayEvent', () => {
  it('nothing on the first visit or after a short break', () => {
    expect(awayEvent(null, 1e12, 12, [], false)).toBeNull()
    expect(awayEvent(1e12, 1e12 + AWAY_MS - 1, 12, [], false)).toBeNull()
  })
  it('after a few hours it did something, and may bring a souvenir it did not have', () => {
    const e = awayEvent(0, AWAY_MS, 12, ['leaf'], false, always(0))
    expect(e?.activity).toBe('walk')
    expect(e?.souvenir).toBe('pebble')
  })
  it('at most one souvenir a day, none once the album is full, night activities at night', () => {
    expect(awayEvent(0, AWAY_MS, 12, [], true, always(0))?.souvenir).toBeNull()
    expect(awayEvent(0, AWAY_MS, 12, [...SOUVENIRS], false, always(0))?.souvenir).toBeNull()
    expect(['nap', 'stars', 'snack']).toContain(awayEvent(0, AWAY_MS, 23, [], false)?.activity)
  })
})
