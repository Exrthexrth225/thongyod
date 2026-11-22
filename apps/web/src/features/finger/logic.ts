// วางนิ้วสุ่ม (finger chooser, DECISIONS #102). Pure logic: no React, no DOM.
// Everyone puts a finger on the screen; the result is decided fairly the moment the countdown ends,
// and shown straight away (#125: no light hopping or knock-outs; the stage focuses on the chosen finger).
import { secureRandomInt, shuffle } from '@/lib/random'

export type FingerMode = 'one' | 'teams' | 'order'

/** Fingers have to stay still (none added or lifted) this long before the pick starts. */
export const SETTLE_MS = 1600
/** iPhone Safari reports at most 5 touches at once; Android usually 10. */
export const IPHONE_MAX_FINGERS = 5
export const MIN_FINGERS = 2

export type FingerResult =
  | { mode: 'one'; winner: number }
  | { mode: 'teams'; team: Record<number, number> }
  | { mode: 'order'; rank: Record<number, number> }

/**
 * Decide for these finger ids. teams: as even as possible (sizes differ by at most 1), team 0..teams-1.
 * order: rank 1..n.
 */
export function decide(ids: number[], mode: FingerMode, teams = 2, random: (max: number) => number = secureRandomInt): FingerResult {
  if (ids.length < MIN_FINGERS) throw new Error('need at least 2 fingers')
  if (mode === 'one') return { mode, winner: ids[random(ids.length)] }
  const mixed = shuffle(ids, random)
  if (mode === 'teams') {
    const n = Math.max(2, Math.min(teams, ids.length))
    return { mode, team: Object.fromEntries(mixed.map((id, i) => [id, i % n])) }
  }
  return { mode, rank: Object.fromEntries(mixed.map((id, i) => [id, i + 1])) }
}

/** Colours given to fingers in touch order (slab colours; matched in the component). */
export const FINGER_COLORS = 8

/** The result shows at once (Earth, #125): the stage darkens onto the chosen finger, then floods with its colour. */
export const SPOT_MS = 650

/**
 * Where a finger's label goes so the finger and hand do not cover it (#125): above the ring, unless the ring is near
 * the top of the stage, then beside it on the side with more room.
 */
export function labelSpot(x: number, y: number, width: number): 'above' | 'left' | 'right' {
  if (y >= 120) return 'above'
  return x > width / 2 ? 'left' : 'right'
}
