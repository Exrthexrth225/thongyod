import { describe, expect, it } from 'vitest'
import { leadChanges, leaderAt, makeRace, positionAt } from './logic'

function seeded(seed: number) {
  let s = seed
  return (max: number) => {
    s = (s * 16807) % 2147483647
    return s % max
  }
}

describe('makeRace', () => {
  for (const count of [2, 3, 5, 8]) {
    it(`${count} runners: finish order is the decided order, nobody runs backwards`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const race = makeRace(count, seeded(seed))
        const byFinish = race.paths.map((p, i) => ({ i, f: p.finish })).sort((a, b) => a.f - b.f).map((x) => x.i)
        expect(byFinish).toEqual(race.order)
        for (const p of race.paths) {
          let prev = 0
          for (let k = 0; k <= 100; k++) {
            const x = positionAt(p, (p.finish * k) / 100)
            expect(x).toBeGreaterThanOrEqual(prev - 1e-9)
            prev = x
          }
          expect(positionAt(p, p.finish)).toBe(1)
        }
      }
    })
  }

  it('with 3+ runners the lead changes at least twice in most races, and the winner is not in front early', () => {
    let good = 0
    for (let seed = 1; seed <= 40; seed++) {
      const race = makeRace(5, seeded(seed))
      if (leadChanges(race.paths) >= 2) good++
      expect(leaderAt(race.paths, race.paths[race.order[0]].finish * 0.25)).not.toBe(race.order[0])
    }
    expect(good).toBeGreaterThanOrEqual(34)
  })

  it('every runner can win (fair order)', () => {
    const wins = new Array(4).fill(0)
    for (let seed = 1; seed <= 400; seed++) wins[makeRace(4, seeded(seed)).order[0]]++
    for (const w of wins) expect(w).toBeGreaterThan(60)
  })
})
