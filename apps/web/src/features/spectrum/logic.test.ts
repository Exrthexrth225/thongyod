import { describe, expect, it } from 'vitest'
import { SPECTRUM_CARDS } from '@/config/games/spectrum'
import { BANDS, clueGiver, pickTarget, rating, scoreGuess, valueFromPoint } from './logic'

describe('คลื่นความคิด', () => {
  it('scores 4 / 3 / 2 / 0 by distance, symmetric', () => {
    expect(scoreGuess(50, 50)).toBe(4)
    expect(scoreGuess(50, 52.5)).toBe(4)
    expect(scoreGuess(50, 45)).toBe(3)
    expect(scoreGuess(50, 60)).toBe(2)
    expect(scoreGuess(50, 37.5)).toBe(2)
    expect(scoreGuess(50, 63)).toBe(0)
    expect(scoreGuess(30, 34)).toBe(scoreGuess(30, 26))
  })

  it('keeps the whole target on the scale', () => {
    expect(pickTarget(() => 0)).toBe(13)
    expect(pickTarget((max) => max - 1)).toBe(87)
    expect(87 + BANDS[0].half).toBeLessThanOrEqual(100)
  })

  it('turns a touch point into a needle value', () => {
    expect(valueFromPoint(-10, 0)).toBe(0)
    expect(valueFromPoint(10, 0)).toBe(100)
    expect(valueFromPoint(0, -10)).toBe(50)
    expect(valueFromPoint(-10, 5)).toBe(0) // below the line → nearest end
    expect(valueFromPoint(10, 5)).toBe(100)
  })

  it('rates the group result', () => {
    expect(rating(28, 7)).toBe('great')
    expect(rating(16, 7)).toBe('good')
    expect(rating(10, 7)).toBe('ok')
    expect(rating(3, 7)).toBe('low')
  })

  it('takes turns giving the clue', () => {
    expect([0, 1, 2, 3, 4].map((r) => clueGiver(r, 3))).toEqual([0, 1, 2, 0, 1])
  })

  it('has enough distinct cards with two different ends', () => {
    expect(SPECTRUM_CARDS.length).toBeGreaterThanOrEqual(140)
    expect(new Set(SPECTRUM_CARDS.map((c) => c.join('|'))).size).toBe(SPECTRUM_CARDS.length)
    for (const [a, b] of SPECTRUM_CARDS) expect(a).not.toBe(b)
  })
})
