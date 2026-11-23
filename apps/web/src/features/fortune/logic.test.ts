import { describe, expect, it } from 'vitest'
import { DOUBLE_ODDS, POE_MAX, STICK_COUNT, addToHistory, bangkokDayKey, createShakeDetector, levelOf, nextDrawAt, shakeOnce, throwPoe, todaysDraw, type Draw } from './logic'

describe('the 28 sticks', () => {
  it('has the planned mix: 10 good, 9 middling, 9 bad', () => {
    const count = { good: 0, fair: 0, bad: 0 }
    for (let n = 1; n <= STICK_COUNT; n++) count[levelOf(n)]++
    expect(STICK_COUNT).toBe(28)
    expect(count).toEqual({ good: 10, fair: 9, bad: 9 })
  })

  it('every slip is 4 บท that open with its number and close with เอย; bad ones carry a remedy', async () => {
    const { FORTUNES } = await import('@/config/fortunes')
    FORTUNES.forEach((f, i) => {
      expect(f.verse).toHaveLength(16)
      expect(f.verse[0].startsWith('ใบ')).toBe(true)
      expect(f.verse[15].endsWith('เอย')).toBe(true)
      expect(f.verse.every((v) => v.trim().length >= 7 && !v.includes(' '))).toBe(true)
      expect(f.meaning.trim().length).toBeGreaterThan(10)
      expect(Boolean(f.remedy), `stick ${i + 1}`).toBe(f.level === 'bad')
    })
    expect(new Set(FORTUNES.flatMap((f) => f.verse)).size).toBe(28 * 16)
  })
})

describe('bangkokDayKey', () => {
  it('uses the Thai calendar day', () => {
    expect(bangkokDayKey(new Date('2026-11-04T16:59:00Z'))).toBe('2026-11-04') // 23:59 in Bangkok
    expect(bangkokDayKey(new Date('2026-11-04T17:00:00Z'))).toBe('2026-11-05') // 00:00 in Bangkok
  })
})

describe('todaysDraw', () => {
  const now = new Date('2026-11-04T05:00:00Z')
  it("is today's saved reading, nothing otherwise", () => {
    expect(todaysDraw(now, { day: '2026-11-04', stick: 7 })).toEqual({ day: '2026-11-04', stick: 7 })
    expect(todaysDraw(now, { day: '2026-11-03', stick: 7 })).toBeNull()
    expect(todaysDraw(now, { day: '2026-11-04', stick: 33 })).toBeNull() // old 40-stick set: draw again
    expect(todaysDraw(now, null)).toBeNull()
  })
})

describe('shakeOnce', () => {
  it('drops two sticks about 1 in 8 times, otherwise one stick 1–28', () => {
    expect(shakeOnce(() => 0)).toEqual({ kind: 'two' })
    expect(shakeOnce((max) => (max === DOUBLE_ODDS ? 3 : 27))).toEqual({ kind: 'one', stick: 28 })
    const seen = new Set<number>()
    let twos = 0
    for (let i = 0; i < 4000; i++) {
      const r = shakeOnce()
      if (r.kind === 'one') seen.add(r.stick)
      else twos++
    }
    expect(seen.size).toBe(STICK_COUNT)
    expect(twos).toBeGreaterThan(300)
    expect(twos).toBeLessThan(700)
  })
})

describe('throwPoe', () => {
  it('reads the blocks: half yes, a quarter no, a quarter laugh', () => {
    expect([0, 1, 2, 3].map((r) => throwPoe(0, () => r))).toEqual(['yes', 'yes', 'no', 'laugh'])
  })
  it('the third throw for a stick always says yes', () => {
    expect(throwPoe(POE_MAX - 1, () => 3)).toBe('yes')
  })
})

describe('createShakeDetector', () => {
  it('ignores small movement', () => {
    const feed = createShakeDetector()
    let fired = false
    for (let t = 0; t < 2000; t += 50) fired ||= feed(0, 9.8 + Math.sin(t) * 2, 0, t)
    expect(fired).toBe(false)
  })
  it('fires on 3 strong jolts close together, then cools down', () => {
    const feed = createShakeDetector()
    const results: boolean[] = []
    let t = 0
    for (let i = 0; i < 8; i++) {
      results.push(feed(i % 2 ? 15 : -15, 9.8, 0, t))
      t += 100
    }
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(results.indexOf(true)).toBe(3)
  })
  it('does not fire when jolts are too far apart', () => {
    const feed = createShakeDetector()
    let fired = false
    for (let i = 0; i < 6; i++) fired ||= feed(i % 2 ? 15 : -15, 9.8, 0, i * 1000)
    expect(fired).toBe(false)
  })
})

describe('addToHistory', () => {
  const d = (day: string, stick: number) => ({ day, stick }) as Draw
  it('keeps one entry per day, newest first', () => {
    const h = addToHistory([d('2026-11-03', 3), d('2026-11-01', 1)], d('2026-11-04', 9))
    expect(h.map((x) => x.day)).toEqual(['2026-11-04', '2026-11-03', '2026-11-01'])
    expect(addToHistory(h, d('2026-11-04', 9))).toHaveLength(3)
  })
  it('caps the length and drops broken entries', () => {
    const many = Array.from({ length: 70 }, (_, i) => d(`2026-08-${String((i % 28) + 1).padStart(2, '0')}-${i}`, 1))
    expect(addToHistory(many, d('2026-11-04', 1), 60)).toHaveLength(60)
    expect(addToHistory([d('2026-11-01', 99)], d('2026-11-02', 3))).toEqual([d('2026-11-02', 3)])
  })
  it('never keeps a bad slip; old sticks 29–40 stay as ใบเก่า', () => {
    expect(levelOf(2)).toBe('bad')
    expect(addToHistory([d('2026-11-01', 1)], d('2026-11-02', 2))).toEqual([d('2026-11-01', 1)])
    expect(addToHistory([d('2026-11-01', 35), d('2026-10-30', 5)], d('2026-11-02', 3))).toEqual([d('2026-11-02', 3), d('2026-11-01', 35)])
  })
})

describe('nextDrawAt', () => {
  it('is the coming midnight in Bangkok', () => {
    expect(nextDrawAt(new Date('2026-11-22T01:55:00+07:00')).toISOString()).toBe('2026-11-22T17:00:00.000Z')
    expect(nextDrawAt(new Date('2026-11-22T23:59:00+07:00')).toISOString()).toBe('2026-11-22T17:00:00.000Z')
    expect(nextDrawAt(new Date('2026-11-23T00:00:00+07:00')).toISOString()).toBe('2026-11-23T17:00:00.000Z')
  })
})
