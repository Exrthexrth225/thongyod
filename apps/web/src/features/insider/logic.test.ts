import { describe, expect, it } from 'vitest'
import { clampPlayers, dealInsider, roleOf, talkSeconds } from './logic'
import { fixInsiderSettings, insiderPool } from './settings'

const seq = (values: number[]) => {
  let i = 0
  return (max: number) => values[i++ % values.length] % max
}

describe('คนวงใน', () => {
  it('master and insider are always two different players', () => {
    for (let players = 4; players <= 12; players++) {
      for (let m = 0; m < players; m++) {
        for (let o = 0; o < players - 1; o++) {
          const r = dealInsider({ players, word: 'แมว' }, seq([m, o]))
          expect(r.master).toBe(m)
          expect(r.insider).not.toBe(r.master)
          expect(r.insider).toBeGreaterThanOrEqual(0)
          expect(r.insider).toBeLessThan(players)
        }
      }
    }
  })

  it('every non-master player can be the insider (no one is skipped)', () => {
    const seen = new Set<number>()
    for (let o = 0; o < 5; o++) seen.add(dealInsider({ players: 6, word: 'x' }, seq([2, o])).insider)
    expect([...seen].sort()).toEqual([0, 1, 3, 4, 5])
  })

  it('gives each player one role', () => {
    const r = { word: 'x', master: 1, insider: 3 }
    expect([0, 1, 2, 3].map((p) => roleOf(r, p))).toEqual(['common', 'master', 'common', 'insider'])
  })

  it('talk time = guessing time, at least 30 s and at most 5 min', () => {
    expect(talkSeconds(12)).toBe(30)
    expect(talkSeconds(95.4)).toBe(95)
    expect(talkSeconds(900)).toBe(300)
  })

  it('keeps settings sane', () => {
    expect(clampPlayers(2)).toBe(4)
    expect(clampPlayers(40)).toBe(12)
    expect(fixInsiderSettings({ players: 3, minutes: 4 as 5, packs: ['nope'] })).toEqual({ players: 4, minutes: 5, packs: ['food', 'animals', 'things', 'places', 'jobs'] })
    expect(insiderPool(['animals']).length).toBeGreaterThanOrEqual(80)
  })
})
