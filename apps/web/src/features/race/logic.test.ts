import { describe, expect, it } from 'vitest'
import { eventAt, leadChanges, leaderAt, makeRace, positionAt } from './logic'

function seeded(seed: number) {
  let s = seed
  return (max: number) => {
    s = (s * 16807) % 2147483647
    return s % max
  }
}

describe('makeRace', () => {
  for (const count of [2, 3, 5, 8]) {
    it(`${count} runners: finish order is the decided order, positions stay on the track`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const race = makeRace(count, seeded(seed))
        const byFinish = race.paths.map((p, i) => ({ i, f: p.finish })).sort((a, b) => a.f - b.f).map((x) => x.i)
        expect(byFinish).toEqual(race.order)
        for (const p of race.paths) {
          let prev = 0
          let wrongWay = false
          for (let k = 0; k <= 200; k++) {
            const t = (p.finish * k) / 200
            const x = positionAt(p, t)
            expect(x).toBeGreaterThanOrEqual(0)
            if (t < p.finish) expect(x).toBeLessThan(1)
            // Only "running the wrong way" may go backwards (until the sample after it ends).
            const now = eventAt(p, t) === 'wrongWay'
            if (!now && !wrongWay) expect(x).toBeGreaterThanOrEqual(prev - 1e-9)
            wrongWay = now
            prev = x
          }
          expect(positionAt(p, p.finish)).toBe(1)
        }
      }
    })
  }

  it('events: some in every race, at most one per runner, in time order, before the final stretch', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const count = 2 + (seed % 7)
      const race = makeRace(count, seeded(seed))
      expect(race.events.length).toBeGreaterThanOrEqual(1)
      expect(new Set(race.events.map((e) => e.runner)).size).toBe(race.events.length)
      race.events.forEach((e, i) => {
        if (i > 0) expect(e.at).toBeGreaterThan(race.events[i - 1].at)
        expect(e.at + e.dur).toBeLessThan(0.92)
        expect(eventAt(race.paths[e.runner], e.at + e.dur / 2)).toBe(e.kind)
        if (e.kind === 'prank') {
          expect(e.by).toBeDefined()
          expect(Math.abs(e.by! - e.runner)).toBe(1)
        }
      })
    }
  })

  it('a stopped runner really stops', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const race = makeRace(4, seeded(seed))
      for (const e of race.events.filter((x) => x.kind === 'trip' || x.kind === 'nap')) {
        const p = race.paths[e.runner]
        expect(positionAt(p, e.at + e.dur * 0.9)).toBeCloseTo(positionAt(p, e.at + e.dur * 0.1), 9)
      }
    }
  })

  it('not predictable: the leader at half way wins only some of the time, and the lead changes', () => {
    let midLeaderWins = 0
    let changes = 0
    const n = 300
    for (let seed = 1; seed <= n; seed++) {
      const race = makeRace(4, seeded(seed))
      if (leaderAt(race.paths, 0.5) === race.order[0]) midLeaderWins++
      if (leadChanges(race.paths) >= 2) changes++
    }
    expect(midLeaderWins / n).toBeGreaterThan(0.2)
    expect(midLeaderWins / n).toBeLessThan(0.55)
    expect(changes / n).toBeGreaterThan(0.6)
  })

  it('every runner can win (fair order)', () => {
    const wins = new Array(4).fill(0)
    for (let seed = 1; seed <= 400; seed++) wins[makeRace(4, seeded(seed)).order[0]]++
    for (const w of wins) expect(w).toBeGreaterThan(60)
  })
})
