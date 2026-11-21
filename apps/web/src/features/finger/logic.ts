// วางนิ้วสุ่ม (finger chooser, DECISIONS #102). Pure logic: no React, no DOM.
// Everyone puts a finger on the screen; the result is decided fairly the moment the countdown ends,
// then a highlight hops from finger to finger, slowing down, and stops on that result.
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

export type Hop = { index: number; at: number }

/**
 * The highlight's path for "one" mode: it goes round the fingers `rounds` times, slowing down
 * (gaps grow from `fastMs` to `slowMs`), and its last hop is on `winnerIndex`.
 */
export function hops(count: number, winnerIndex: number, rounds = 3, fastMs = 70, slowMs = 420): Hop[] {
  if (count < 1 || winnerIndex < 0 || winnerIndex >= count) throw new Error('bad hop input')
  const total = rounds * count + winnerIndex + 1
  const out: Hop[] = []
  let at = 0
  for (let k = 0; k < total; k++) {
    out.push({ index: k % count, at: Math.round(at) })
    const p = total > 1 ? k / (total - 1) : 1
    at += fastMs + (slowMs - fastMs) * p * p // ease-in on the gaps = slowing down
  }
  return out
}

/** Colours given to fingers in touch order (slab colours; matched in the component). */
export const FINGER_COLORS = 8
