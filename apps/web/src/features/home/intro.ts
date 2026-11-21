import { bangkokDayKey } from '@/features/fortune/logic'

// Home's opening sequence (motion plan #6, DECISIONS #98) plays on the first visit of the day only,
// so coming back to Home later never makes you wait for it again.
const KEY = 'thongyod-home-intro'

export function introDue(lastDay: string | null, now: Date): boolean {
  return lastDay !== bangkokDayKey(now)
}

/** True once per Bangkok day; remembers that it was shown. Reduce Motion: never. */
export function takeHomeIntro(now: Date = new Date()): boolean {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  try {
    if (!introDue(localStorage.getItem(KEY), now)) return false
    localStorage.setItem(KEY, bangkokDayKey(now))
    return true
  } catch {
    return false
  }
}
