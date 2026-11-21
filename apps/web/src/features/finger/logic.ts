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

/** One step of the knockout show: light a finger, or knock one out (indexes into the finger list). */
export type Beat = { at: number; lit: number } | { at: number; out: number }

/**
 * "one" mode with 3+ fingers (#111): the light runs round and every time it stops, that finger is knocked out,
 * until two are left; then it flicks between those two, slowing, rests on the loser a moment (near miss) and
 * lands on the winner. Only a show: `winnerIndex` is already decided; the knock-out order is shuffled for variety.
 */
export function knockout(count: number, winnerIndex: number, random: (max: number) => number = secureRandomInt): Beat[] {
  if (count < 2 || winnerIndex < 0 || winnerIndex >= count) throw new Error('bad knockout input')
  const losers = shuffle(
    Array.from({ length: count }, (_, i) => i).filter((i) => i !== winnerIndex),
    random,
  )
  const left = Array.from({ length: count }, (_, i) => i)
  const beats: Beat[] = []
  let at = 0
  let pos = 0 // index into `left` where the light is
  // Many fingers: shorter rounds so the whole show stays under ~8 s.
  const many = count > 6
  const fast = many ? 50 : 70
  const slow = many ? 200 : 300
  while (left.length > 2) {
    const target = losers.shift()!
    const to = left.indexOf(target)
    // Many fingers: the light only makes its last few hops, starting a few fingers before the target.
    // At least 3 hops (go round once more if the target is right next to the light).
    let steps = ((to - pos + left.length) % left.length) + 1
    if (steps < 3) steps += left.length
    steps = Math.min(steps, many ? 5 : Infinity)
    pos = (to - steps + 1 + left.length * 2) % left.length
    for (let k = 0; k < steps; k++) {
      if (k > 0) pos = (pos + 1) % left.length
      beats.push({ at: Math.round(at), lit: left[pos] })
      const p = steps > 1 ? k / (steps - 1) : 1
      at += fast + (slow - fast) * p * p
    }
    at += many ? 150 : 250 // hold on the unlucky one
    beats.push({ at: Math.round(at), out: target })
    at += many ? 300 : 450
    left.splice(to, 1)
    pos = pos % left.length
  }
  // Final duel: flick between the last two, slowing; the last two beats are loser (long rest) → winner.
  const loser = left.find((i) => i !== winnerIndex)!
  const gaps = [90, 100, 115, 135, 160, 195, 240, 300, 380, 700]
  let who = gaps.length % 2 === 0 ? winnerIndex : loser // so the beat before the last is the loser
  for (const gap of gaps) {
    beats.push({ at: Math.round(at), lit: who })
    at += gap
    who = who === winnerIndex ? loser : winnerIndex
  }
  beats.push({ at: Math.round(at), lit: winnerIndex })
  return beats
}
