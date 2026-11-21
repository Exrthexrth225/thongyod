import { describe, expect, it } from 'vitest'
import { bangkokDayKey } from '@/features/fortune/logic'
import { introDue } from './intro'

describe('introDue', () => {
  const now = new Date('2026-11-22T02:00:00+07:00')
  it('plays on the first visit of the day', () => {
    expect(introDue(null, now)).toBe(true)
    expect(introDue('2026-11-21', now)).toBe(true)
  })
  it('does not play again the same (Bangkok) day', () => {
    expect(introDue(bangkokDayKey(now), now)).toBe(false)
  })
})
