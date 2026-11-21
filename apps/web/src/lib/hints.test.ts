import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hintSeenCount, markHintShown, shouldShowHint } from './hints'

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) })
})

describe('first-times hints', () => {
  it('shows a hint the first 3 times, then never', () => {
    const shown = [1, 2, 3, 4, 5].map(() => {
      const show = shouldShowHint('swipe')
      if (show) markHintShown('swipe')
      return show
    })
    expect(shown).toEqual([true, true, true, false, false])
    expect(hintSeenCount('swipe')).toBe(3)
  })

  it('hints are counted separately', () => {
    markHintShown('a')
    expect(hintSeenCount('a')).toBe(1)
    expect(hintSeenCount('b')).toBe(0)
  })
})
