import { describe, expect, it } from 'vitest'
import { ANNOY_TAPS, CALM_MS, initialTaps, tap, type TapState } from './taps'

describe('pet taps', () => {
  it('reacts to a calm tap, ignores taps while a reaction plays', () => {
    let s: TapState = initialTaps
    let r = tap(s, 0, false)
    expect(r.outcome).toBe('react')
    s = r.state
    r = tap(s, 300, true)
    expect(r.outcome).toBe('ignore')
  })
  it('gets annoyed after a burst of taps, then ignores taps for a moment', () => {
    let s: TapState = initialTaps
    const outcomes = []
    for (let i = 0; i < ANNOY_TAPS; i++) {
      const r = tap(s, i * 200, i % 2 === 1)
      s = r.state
      outcomes.push(r.outcome)
    }
    expect(outcomes[outcomes.length - 1]).toBe('annoyed')
    expect(tap(s, ANNOY_TAPS * 200 + 100, false).outcome).toBe('ignore')
    expect(tap(s, ANNOY_TAPS * 200 + CALM_MS, false).outcome).toBe('react')
  })
  it('slow taps never annoy it', () => {
    let s: TapState = initialTaps
    for (let i = 0; i < 10; i++) {
      const r = tap(s, i * 3000, false)
      expect(r.outcome).toBe('react')
      s = r.state
    }
  })
})
