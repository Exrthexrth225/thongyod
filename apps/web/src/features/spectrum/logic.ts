// คลื่นความคิด (Wavelength-style, co-op). Pure logic, tested in logic.test.ts.
// The scale runs 0 (left end) … 100 (right end). A hidden target sits somewhere on it; the team turns the needle.
import { secureRandomInt } from '@/lib/random'

/** Half-widths of the scoring bands around the target, outermost first: 2, 3 and 4 points. */
export const BANDS = [
  { half: 12.5, points: 2 },
  { half: 7.5, points: 3 },
  { half: 2.5, points: 4 },
] as const

export const MAX_POINTS = 4
export const ROUNDS = [5, 7, 10] as const
export type SpectrumRounds = (typeof ROUNDS)[number]

/** Target centre, kept far enough from the ends that the whole 2-point band fits on the scale. */
export function pickTarget(random: (max: number) => number = secureRandomInt): number {
  const min = Math.ceil(BANDS[0].half)
  return min + random(101 - 2 * min)
}

/** Points for a needle at `guess` when the target is at `target`. */
export function scoreGuess(target: number, guess: number): number {
  const d = Math.abs(target - guess)
  let points = 0
  for (const band of BANDS) if (d <= band.half) points = band.points
  return points
}

/** How well the group did, from the total and the most they could have got. */
export function rating(total: number, rounds: number): 'low' | 'ok' | 'good' | 'great' {
  const share = total / (rounds * MAX_POINTS)
  return share >= 0.75 ? 'great' : share >= 0.55 ? 'good' : share >= 0.35 ? 'ok' : 'low'
}

/** Needle value (0–100) from a point relative to the dial centre; points below the centre line clamp to the ends. */
export function valueFromPoint(dx: number, dy: number): number {
  const angle = Math.atan2(Math.max(0, -dy), dx) // 0 = right end, π = left end
  return Math.round(Math.min(100, Math.max(0, 100 * (1 - angle / Math.PI))) * 10) / 10
}

/** Who gives the clue in round `round` (0-based) with `players` players. */
export const clueGiver = (round: number, players: number) => round % Math.max(1, players)
