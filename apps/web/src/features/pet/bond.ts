// ความสนิท (#121): how close you and your pet are. Grows with care, touch, wishes and tricks; never goes down.
// Levels unlock tricks (and later shop items). Touch points are capped per day so stroking forever is not the way.
import { localStore } from '@/lib/localStore'

/** Points needed to reach each level (index = level). */
export const BOND_LEVELS = [0, 20, 60, 120, 200, 320, 480, 700, 1000] as const
export const BOND_POINTS = { care: 3, touch: 1, wish: 12, trick: 4, trickLearned: 15, game: 2 } as const
/** Most touch points per Bangkok day. */
export const TOUCH_DAILY_CAP = 15

export type Bond = { points: number; touchDay: string | null; touchToday: number }

export function levelOf(points: number): number {
  let lv = 0
  BOND_LEVELS.forEach((need, i) => {
    if (points >= need) lv = i
  })
  return lv
}

/** Progress inside the current level, 0–1 (1 at the top level). */
export function levelProgress(points: number): number {
  const lv = levelOf(points)
  const next = BOND_LEVELS[lv + 1]
  if (next === undefined) return 1
  return (points - BOND_LEVELS[lv]) / (next - BOND_LEVELS[lv])
}

/** Add points; touch points stop at the daily cap. Returns the new bond and the level reached, if it went up. */
export function addBond(b: Bond, kind: keyof typeof BOND_POINTS, day: string): { bond: Bond; levelUp: number | null } {
  let gain: number = BOND_POINTS[kind]
  let touchToday = b.touchDay === day ? b.touchToday : 0
  if (kind === 'touch') {
    gain = Math.max(0, Math.min(gain, TOUCH_DAILY_CAP - touchToday))
    touchToday += gain
  }
  const points = b.points + gain
  const before = levelOf(b.points)
  const after = levelOf(points)
  return { bond: { points, touchDay: day, touchToday }, levelUp: after > before ? after : null }
}

const isBond = (x: unknown): x is Bond => !!x && typeof (x as Bond).points === 'number'
export const bondStore = localStore<Bond>('thongyod-pet-bond', () => ({ points: 0, touchDay: null, touchToday: 0 }), isBond)
export const BOND_UP_EVENT = 'thongyod:bond-up'

export function gainBond(kind: keyof typeof BOND_POINTS, day: string): void {
  const r = addBond(bondStore.get(), kind, day)
  bondStore.set(r.bond)
  if (r.levelUp !== null && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(BOND_UP_EVENT, { detail: r.levelUp }))
}
