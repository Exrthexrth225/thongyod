import { describe, expect, it } from 'vitest'
import { addBond, levelOf, levelProgress, TOUCH_DAILY_CAP } from './bond'
import { traitOf } from './personality'
import { isLearned, LEARN_AFTER, practise, readGesture, successChance, TRIES_PER_DAY, type TrickProgress } from './tricks'
import { activeWish, grants, planWishes, WISH_MINUTES } from './wishes'

const seq = (xs: number[]) => {
  let i = 0
  return () => xs[i++ % xs.length]
}

describe('bond', () => {
  it('levels and progress', () => {
    expect(levelOf(0)).toBe(0)
    expect(levelOf(20)).toBe(1)
    expect(levelOf(5000)).toBe(8)
    expect(levelProgress(40)).toBeCloseTo(0.5)
  })
  it('caps touch points per day, not other points', () => {
    let b = { points: 0, touchDay: null as string | null, touchToday: 0 }
    for (let i = 0; i < 40; i++) b = addBond(b, 'touch', '2026-11-22').bond
    expect(b.points).toBe(TOUCH_DAILY_CAP)
    b = addBond(b, 'touch', '2026-11-23').bond
    expect(b.points).toBe(TOUCH_DAILY_CAP + 1)
    expect(addBond({ points: 18, touchDay: null, touchToday: 0 }, 'care', 'd').levelUp).toBe(1)
  })
})

describe('tricks', () => {
  it('gets better with practice and is learned after enough good tries', () => {
    expect(successChance(0)).toBeCloseTo(0.35)
    expect(successChance(10)).toBe(0.95)
    let p: TrickProgress = { good: {}, day: null, triesToday: 0 }
    let last = ''
    for (let i = 0; i < LEARN_AFTER; i++) {
      const r = practise(p, 'trickSit', 'd', 0)
      p = r.progress
      last = r.result
    }
    expect(last).toBe('learned')
    expect(isLearned(p, 'trickSit')).toBe(true)
    expect(practise(p, 'trickFive', 'd', 0.99).result).toBe('miss')
  })
  it('gets tired after the daily tries', () => {
    const p: TrickProgress = { good: {}, day: 'd', triesToday: TRIES_PER_DAY }
    expect(practise(p, 'trickSit', 'd', 0).result).toBe('tired')
    expect(practise(p, 'trickSit', 'next', 0).result).not.toBe('tired')
  })
  it('reads gestures', () => {
    const line = (dx: number, dy: number) => Array.from({ length: 10 }, (_, i) => ({ x: (dx * i) / 9, y: (dy * i) / 9 }))
    expect(readGesture(line(0, 120))).toBe('down')
    expect(readGesture(line(0, -120))).toBe('up')
    expect(readGesture(line(150, 10))).toBe('sideways')
    const circle = Array.from({ length: 30 }, (_, i) => ({ x: 60 * Math.cos((i / 29) * 2 * Math.PI), y: 60 * Math.sin((i / 29) * 2 * Math.PI) }))
    expect(readGesture(circle)).toBe('circle')
    expect(readGesture(line(5, 5))).toBeNull()
  })
})

describe('wishes', () => {
  const plan = planWishes('2026-11-22', seq([0.1, 0.5, 0.9, 0.3, 0.2, 0.7, 0.4, 0.6, 0.8]), { foods: ['cookie', 'donut'], tricks: [], trait: null })
  it('three wishes, 2 h apart, in the day window', () => {
    expect(plan.wishes).toHaveLength(3)
    const hours = plan.wishes.map((w) => (new Date(w.at).getUTCHours() + 7) % 24)
    expect(Math.min(...hours)).toBeGreaterThanOrEqual(9)
    expect(Math.max(...hours)).toBeLessThanOrEqual(21)
    expect(plan.wishes.every((w) => w.kind !== 'trick')).toBe(true) // knows no tricks yet
  })
  it('opens for an hour, and only the right thing grants it', () => {
    const w = plan.wishes[0]
    const at = Date.parse(w.at)
    expect(activeWish(plan, new Date(at - 1000))).toBeNull()
    expect(activeWish(plan, new Date(at + 1000))?.id).toBe(w.id)
    expect(activeWish(plan, new Date(at + WISH_MINUTES * 60_000))).toBeNull()
    expect(grants({ kind: 'food', food: 'donut' }, { kind: 'food', food: 'donut' })).toBe(true)
    expect(grants({ kind: 'food', food: 'donut' }, { kind: 'food', food: 'cookie' })).toBe(false)
    expect(grants({ kind: 'pat' }, { kind: 'tickle' })).toBe(false)
  })
})

describe('personality', () => {
  it('no leaning until enough care, then the care given most', () => {
    expect(traitOf({ feed: 3, play: 1, bath: 0, touch: 2, settled: null })).toBeNull()
    expect(traitOf({ feed: 10, play: 2, bath: 1, touch: 5, settled: null })).toBe('glutton')
    expect(traitOf({ feed: 2, play: 2, bath: 4, touch: 5, settled: null })).toBe('neat')
    expect(traitOf({ feed: 2, play: 2, bath: 0, touch: 40, settled: null })).toBe('cuddly')
    expect(traitOf({ feed: 99, play: 0, bath: 0, touch: 0, settled: 'playful' })).toBe('playful')
  })
})
