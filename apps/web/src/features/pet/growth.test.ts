import { describe, expect, it } from 'vitest'
import { addCareDay, stageOf, type Growth } from './growth'

describe('pet growth', () => {
  it('baby on day 1, teen on care day 2, adult on care day 7', () => {
    expect(stageOf(1)).toBe('baby')
    expect(stageOf(2)).toBe('teen')
    expect(stageOf(6)).toBe('teen')
    expect(stageOf(7)).toBe('adult')
  })
  it('counts each day once, days need not be in a row, reports the day it grows', () => {
    let g: Growth = { careDays: 0, lastDay: null, stage: 'baby' }
    const grew: (string | null)[] = []
    for (const day of ['2026-11-01', '2026-11-01', '2026-11-05', '2026-11-20']) {
      const r = addCareDay(g, day)
      g = r.growth
      grew.push(r.grewTo)
    }
    expect(g.careDays).toBe(3)
    expect(grew).toEqual([null, null, 'teen', null])
  })
  it('never shrinks', () => {
    const r = addCareDay({ careDays: 0, lastDay: null, stage: 'adult' }, '2026-11-22')
    expect(r.growth.stage).toBe('adult')
    expect(r.grewTo).toBeNull()
  })
})
