import { describe, expect, it } from 'vitest'
import { decide, hops } from './logic'

const seq = (...values: number[]) => {
  let i = 0
  return (max: number) => values[i++ % values.length] % max
}

describe('decide', () => {
  it('one: picks one of the fingers', () => {
    const r = decide([7, 9, 12], 'one', 2, seq(1))
    expect(r).toEqual({ mode: 'one', winner: 9 })
  })
  it('teams: even split, every finger in a team', () => {
    const r = decide([1, 2, 3, 4, 5], 'teams', 2)
    if (r.mode !== 'teams') throw new Error()
    const sizes = [0, 1].map((t) => Object.values(r.team).filter((x) => x === t).length)
    expect(sizes.sort()).toEqual([2, 3])
    expect(Object.keys(r.team)).toHaveLength(5)
  })
  it('teams: never more teams than fingers', () => {
    const r = decide([1, 2], 'teams', 4)
    if (r.mode !== 'teams') throw new Error()
    expect(new Set(Object.values(r.team)).size).toBe(2)
  })
  it('order: ranks 1..n, each once', () => {
    const r = decide([3, 4, 5, 6], 'order')
    if (r.mode !== 'order') throw new Error()
    expect(Object.values(r.rank).sort()).toEqual([1, 2, 3, 4])
  })
  it('refuses fewer than 2 fingers', () => {
    expect(() => decide([1], 'one')).toThrow()
  })
})

describe('hops', () => {
  it('goes round, ends on the winner and slows down', () => {
    const h = hops(4, 2, 3)
    expect(h[h.length - 1].index).toBe(2)
    expect(h.length).toBe(3 * 4 + 3)
    const gaps = h.slice(1).map((x, i) => x.at - h[i].at)
    expect(gaps[gaps.length - 1]).toBeGreaterThan(gaps[0] * 3)
    expect(gaps.every((g, i) => i === 0 || g >= gaps[i - 1])).toBe(true)
  })
})
