import { describe, expect, it } from 'vitest'
import { confettiParticles } from './confetti'

describe('confettiParticles', () => {
  it('makes the asked number of pieces, all thrown upward, using every slab colour', () => {
    let seed = 1
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const ps = confettiParticles(25, rnd)
    expect(ps).toHaveLength(25)
    expect(ps.every((p) => p.dy < 0)).toBe(true)
    expect(new Set(ps.map((p) => p.color)).size).toBe(5)
    expect(ps.every((p) => p.ms >= 900 && p.ms <= 1400)).toBe(true)
  })
})
