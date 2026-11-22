import { describe, expect, it } from 'vitest'
import { applyCare, awakeHours, isCareDay, isNightAt, moodOf, needsAt, wantOf, type NeedsState } from './needs'

// 2026-11-22 10:00 Bangkok = 03:00 UTC.
const T = (bkkHour: number, day = 22) => new Date(Date.UTC(2026, 10, day, bkkHour - 7))
const full = (at: Date): NeedsState => ({ food: 100, fun: 100, clean: 100, at: at.toISOString() })

describe('pet needs', () => {
  it('knows Bangkok night', () => {
    expect(isNightAt(T(23))).toBe(true)
    expect(isNightAt(T(6))).toBe(true)
    expect(isNightAt(T(7))).toBe(false)
    expect(isNightAt(T(14))).toBe(false)
  })
  it('night hours count half', () => {
    expect(awakeHours(T(10), T(14))).toBeCloseTo(4)
    expect(awakeHours(T(22), T(24))).toBeCloseTo(1.5) // 22–23 awake, 23–24 asleep
    expect(awakeHours(T(14), T(10))).toBe(0)
  })
  it('food empties in about 10 waking hours, fun in a day, clean in two', () => {
    const n = needsAt(full(T(8)), T(13))
    expect(n.food).toBeCloseTo(50)
    expect(n.fun).toBeCloseTo(100 - 5 * (100 / 24))
    expect(n.clean).toBeCloseTo(100 - 5 * (100 / 48))
    expect(needsAt(full(T(8)), T(8, 25)).food).toBe(0) // never below 0
  })
  it('care adds and caps at 100', () => {
    const s = applyCare({ food: 20, fun: 90, clean: 50, at: T(10).toISOString() }, T(10), { food: 35, fun: 30 })
    expect(s).toMatchObject({ food: 55, fun: 100, clean: 50 })
  })
  it('mood, wants and care days', () => {
    expect(moodOf({ food: 80, fun: 70, clean: 90 })).toBe('happy')
    expect(moodOf({ food: 40, fun: 70, clean: 90 })).toBe('ok')
    expect(moodOf({ food: 10, fun: 70, clean: 90 })).toBe('sad')
    expect(wantOf({ food: 25, fun: 10, clean: 90 })).toBe('fun')
    expect(wantOf({ food: 50, fun: 40, clean: 90 })).toBeNull()
    expect(isCareDay({ food: 40, fun: 40, clean: 40 })).toBe(true)
    expect(isCareDay({ food: 39, fun: 90, clean: 90 })).toBe(false)
  })
})
