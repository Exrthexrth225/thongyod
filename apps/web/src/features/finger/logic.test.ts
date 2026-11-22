import { describe, expect, it } from 'vitest'
import { decide, labelSpot } from './logic'

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

describe('labelSpot', () => {
  it('puts the label above the finger, or beside it near the top', () => {
    expect(labelSpot(100, 300, 360)).toBe('above')
    expect(labelSpot(300, 60, 360)).toBe('left')
    expect(labelSpot(60, 60, 360)).toBe('right')
  })
})
