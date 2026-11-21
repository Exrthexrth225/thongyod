// สัตว์วิ่งแข่ง (DECISIONS #103). Pure logic: no React, no DOM.
// Fair: the finishing order is shuffled with secure random the moment the race starts; every racer has the same odds.
// Exciting: the paths to that order are made up so the lead changes hands and the winner does not lead all the way.
import { secureRandomInt, shuffle } from '@/lib/random'

export const RACER_IDS = ['cat', 'shiba', 'bunny', 'duck', 'frog', 'penguin', 'panda', 'koala'] as const
export type RacerId = (typeof RACER_IDS)[number]
export const MIN_RUNNERS = 2
export const MAX_RUNNERS = RACER_IDS.length

/** One runner's path: position 0..1 (1 = finish line) at race time t (0..finish). */
export type Path = { finish: number; bumps: [number, number, number] }

export function positionAt(path: Path, t: number): number {
  if (t >= path.finish) return 1
  if (t <= 0) return 0
  const u = t / path.finish
  const [a, b, c] = path.bumps
  return u + a * Math.sin(Math.PI * u) + b * Math.sin(2 * Math.PI * u) + c * Math.sin(3 * Math.PI * u)
}

/** Steepest a bump set may be and still never run backwards: d/du ≥ 1 − π(|a| + 2|b| + 3|c|) > 0. */
const MAX_SLOPE_USE = 0.85

export type Race = {
  /** Runner indexes from first to last. */
  order: number[]
  paths: Path[]
}

/** Who is in front at time t (index), or -1 when nobody has started. */
export function leaderAt(paths: Path[], t: number): number {
  let best = -1
  let pos = -1
  paths.forEach((p, i) => {
    const x = positionAt(p, t)
    if (x > pos + 1e-9) {
      pos = x
      best = i
    }
  })
  return t <= 0 ? -1 : best
}

/** How many times the leader changes between 5 % and 98 % of the winner's time. */
export function leadChanges(paths: Path[], samples = 200): number {
  const end = Math.min(...paths.map((p) => p.finish))
  let last = -1
  let changes = 0
  for (let k = 0; k <= samples; k++) {
    const t = end * (0.05 + 0.93 * (k / samples))
    const lead = leaderAt(paths, t)
    if (last !== -1 && lead !== last) changes++
    last = lead
  }
  return changes
}

const rand01 = (random: (max: number) => number) => random(10_000) / 10_000

function bumpsFor(random: (max: number) => number, early: number): [number, number, number] {
  // `early` > 0 = fast start then fades; < 0 = slow start then a late surge.
  const budget = (MAX_SLOPE_USE / Math.PI) * (0.6 + 0.4 * rand01(random))
  const a = early * budget * 0.5
  const left = budget - Math.abs(a)
  const b = (rand01(random) - 0.3) * left * 0.35
  const c = (rand01(random) - 0.5) * (left - 2 * Math.abs(b)) * 0.3
  return [a, b, c]
}

/**
 * Build a race for `count` runners. The order is a fair shuffle. Finish gaps: first to second is sometimes a photo
 * finish (≤ 1.5 % of the time), the rest spread out. The winner always starts slow and someone else leads early.
 */
export function makeRace(count: number, random: (max: number) => number = secureRandomInt, tries = 40): Race {
  if (count < MIN_RUNNERS || count > MAX_RUNNERS) throw new Error(`runners must be ${MIN_RUNNERS}–${MAX_RUNNERS}`)
  const order = shuffle(
    Array.from({ length: count }, (_, i) => i),
    random,
  )
  let best: Race | null = null
  let bestChanges = -1
  for (let attempt = 0; attempt < tries; attempt++) {
    const photo = random(10) < 4
    const finish: number[] = new Array(count)
    let time = 1
    order.forEach((runner, place) => {
      if (place > 0) time += place === 1 && photo ? 0.004 + rand01(random) * 0.011 : 0.02 + rand01(random) * 0.05
      finish[runner] = time
    })
    // An early leader that is not the winner (when there are others), the winner coming from behind.
    const early = order.length > 1 ? order[1 + random(order.length - 1)] : -1
    const paths: Path[] = finish.map((f, runner) => ({
      finish: f,
      bumps: bumpsFor(random, runner === order[0] ? -1 : runner === early ? 1 : rand01(random) * 1.4 - 0.7),
    }))
    const changes = leadChanges(paths)
    if (changes > bestChanges) {
      best = { order, paths }
      bestChanges = changes
    }
    if (changes >= 2) break
  }
  return best!
}
