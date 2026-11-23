// สัตว์วิ่งแข่ง (DECISIONS #103). Pure logic: no React, no DOM.
// Fair: the finishing order is shuffled with secure random the moment the race starts; every racer has the same odds.
// Exciting: the paths to that order are made up so the lead changes hands and the winner does not lead all the way.
import { secureRandomInt, shuffle } from '@/lib/random'

export const RACER_IDS = ['cat', 'shiba', 'bunny', 'duck', 'frog', 'penguin', 'panda', 'koala'] as const
export type RacerId = (typeof RACER_IDS)[number]
/** Order new runners get their animal in: the most different-looking first (cat and shiba are both orange, QA BUG-009). */
export const PICK_ORDER: readonly RacerId[] = ['cat', 'frog', 'penguin', 'duck', 'bunny', 'panda', 'shiba', 'koala']
export const MIN_RUNNERS = 2
export const MAX_RUNNERS = RACER_IDS.length

/** Things that happen during a race (#114). Only a show: they never change the finishing order. */
export const EVENT_KINDS = ['trip', 'banana', 'prank', 'nap', 'bee', 'wrongWay'] as const
export type EventKind = (typeof EVENT_KINDS)[number]

/**
 * One event bends a runner's own clock: from race time `a` for `d` it runs at `rate` (0 = stopped, 2.2 = a bee
 * behind it, negative = running the wrong way), then it runs at whatever steady speed still gets it to the line at
 * exactly its planned finish time. So the order and finish times never change; only the drama does.
 */
export type Warp = { kind: EventKind; a: number; d: number; rate: number }

/** One runner's path: position 0..1 (1 = finish line) at race time t (0..finish). */
export type Path = { finish: number; bumps: [number, number, number]; warp?: Warp }

/** Speed of the runner's own clock during each event. */
const EVENT_RATE: Record<EventKind, number> = { trip: 0, banana: 0.3, prank: 0.3, nap: 0, bee: 2.2, wrongWay: -0.5 }
/** How long each event lasts (race time; 1 = the winner's run ≈ 7 s on screen). */
const EVENT_DUR: Record<EventKind, number> = { trip: 0.15, banana: 0.12, prank: 0.12, nap: 0.19, bee: 0.1, wrongWay: 0.13 }
/** Catching up after an event may not look like a rocket, nor a crawl. */
const MAX_CATCH_UP = 1.75
const MIN_CATCH_UP = 0.55

/** The runner's own clock at race time t (equals t when nothing happened to it). */
export function ownTime(path: Path, t: number): number {
  const w = path.warp
  if (!w || t <= w.a) return t
  if (t < w.a + w.d) return w.a + w.rate * (t - w.a)
  const s1 = w.a + w.rate * w.d
  const k = (path.finish - s1) / (path.finish - w.a - w.d)
  return Math.min(path.finish, s1 + (t - w.a - w.d) * k)
}

function basePosition(path: Path, s: number): number {
  const u = s / path.finish
  const [a, b, c] = path.bumps
  return u + a * Math.sin(Math.PI * u) + b * Math.sin(2 * Math.PI * u) + c * Math.sin(3 * Math.PI * u)
}

export function positionAt(path: Path, t: number): number {
  if (t >= path.finish) return 1
  if (t <= 0) return 0
  return Math.max(0, basePosition(path, ownTime(path, t)))
}

/** The event happening to this runner at race time t, if any. */
export function eventAt(path: Path, t: number): EventKind | null {
  const w = path.warp
  return w && t >= w.a && t < w.a + w.d ? w.kind : null
}

/** Steepest a bump set may be and still never run backwards: d/du ≥ 1 − π(|a| + 2|b| + 3|c|) > 0. */
const MAX_SLOPE_USE = 0.85

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

export type RaceEvent = { runner: number; kind: EventKind; at: number; dur: number; /** prank: who threw the peel */ by?: number }

export type Race = {
  /** Runner indexes from first to last. */
  order: number[]
  paths: Path[]
  /** In time order. */
  events: RaceEvent[]
}

/** How many events a race of `count` runners gets. */
export function eventCount(count: number, random: (max: number) => number): number {
  if (count <= 2) return 1 + random(2)
  if (count <= 4) return 2 + random(2)
  return 2 + random(3)
}

const pickWeighted = <T extends string>(weights: Record<T, number>, random: (max: number) => number): T => {
  const entries = Object.entries(weights) as [T, number][]
  const total = entries.reduce((n, [, w]) => n + w, 0)
  let r = random(total)
  for (const [k, w] of entries) {
    if (r < w) return k
    r -= w
  }
  return entries[0][0]
}

/** Put events on the paths (mutates them) and return the list. Half the time it hits whoever is in front. */
export function addEvents(paths: Path[], random: (max: number) => number): RaceEvent[] {
  const first = Math.min(...paths.map((p) => p.finish))
  const want = eventCount(paths.length, random)
  const events: RaceEvent[] = []
  const times: number[] = []
  for (let tries = 0; events.length < want && tries < 60; tries++) {
    const at = first * (0.14 + 0.56 * rand01(random))
    if (times.some((x) => Math.abs(x - at) < 0.1)) continue
    const free = paths.map((_, i) => i).filter((i) => !paths[i].warp)
    if (!free.length) break
    const lead = leaderAt(paths, at)
    const runner = random(2) === 0 && free.includes(lead) ? lead : free[random(free.length)]
    let kind = pickWeighted<EventKind>({ trip: 6, banana: 4, prank: 4, nap: at < first * 0.5 ? 3 : 0, bee: 4, wrongWay: 2 }, random)
    let by: number | undefined
    if (kind === 'prank') {
      // A neighbour (lane above or below) who is ahead at that moment throws the peel back.
      const me = positionAt(paths[runner], at)
      const near = [runner - 1, runner + 1].filter((i) => i >= 0 && i < paths.length && positionAt(paths[i], at) > me + 0.02)
      if (near.length) by = near[random(near.length)]
      else kind = 'banana'
    }
    const p = paths[runner]
    const w: Warp = { kind, a: at, d: EVENT_DUR[kind], rate: EVENT_RATE[kind] }
    const k = (p.finish - (w.a + w.rate * w.d)) / (p.finish - w.a - w.d)
    if (!(k <= MAX_CATCH_UP && k >= MIN_CATCH_UP)) continue
    p.warp = w
    times.push(at)
    events.push({ runner, kind, at, dur: w.d, ...(by !== undefined ? { by } : {}) })
  }
  return events.sort((x, y) => x.at - y.at)
}

/**
 * Build a race for `count` runners. The order is a fair shuffle. Finish gaps: first to second is sometimes a photo
 * finish, the rest spread out. How it unfolds is random too (#114): about a third of races the winner is in front at
 * half way and has to hold on, otherwise someone else is and gets caught; then a few events shake it up.
 * Nothing about the first half tells you the winner.
 */
export function makeRace(count: number, random: (max: number) => number = secureRandomInt, tries = 40): Race {
  if (count < MIN_RUNNERS || count > MAX_RUNNERS) throw new Error(`runners must be ${MIN_RUNNERS}–${MAX_RUNNERS}`)
  const order = shuffle(
    Array.from({ length: count }, (_, i) => i),
    random,
  )
  const winnerLeadsMidway = random(100) < 35
  let best: Path[] | null = null
  let bestScore = -1
  for (let attempt = 0; attempt < tries; attempt++) {
    const photo = random(10) < 4
    const finish: number[] = new Array(count)
    let time = 1
    order.forEach((runner, place) => {
      if (place > 0) time += place === 1 && photo ? 0.004 + rand01(random) * 0.011 : 0.02 + rand01(random) * 0.05
      finish[runner] = time
    })
    const paths: Path[] = finish.map((f) => ({ finish: f, bumps: bumpsFor(random, rand01(random) * 2 - 1) }))
    const fits = (leaderAt(paths, 0.5) === order[0]) === winnerLeadsMidway
    const score = Math.min(leadChanges(paths), 3) + (fits ? 10 : 0)
    if (score > bestScore) {
      best = paths
      bestScore = score
    }
    if (fits && score >= 12) break
  }
  const paths = best!
  return { order, paths, events: addEvents(paths, random) }
}
