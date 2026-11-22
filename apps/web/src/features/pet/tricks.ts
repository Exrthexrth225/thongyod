// Teaching tricks (#121, like Nintendogs): pick a trick, make its gesture on the pet; it gets it right more often
// the more you practise, and after enough good tries it has learned it for good. A few tries a day.
import type { TrickId } from './behavior'
import { localStore } from '@/lib/localStore'

export type Gesture = 'down' | 'up' | 'circle' | 'doubleTap' | 'sideways'
export type TrickDef = { id: TrickId; gesture: Gesture; unlock: number }

/** In teaching order; `unlock` = ความสนิท level needed. */
export const TRICK_DEFS: TrickDef[] = [
  { id: 'trickSit', gesture: 'down', unlock: 1 },
  { id: 'trickFive', gesture: 'doubleTap', unlock: 2 },
  { id: 'trickSpin', gesture: 'circle', unlock: 3 },
  { id: 'trickJump', gesture: 'up', unlock: 4 },
  { id: 'trickDead', gesture: 'sideways', unlock: 5 },
]
/** Good tries to learn a trick. */
export const LEARN_AFTER = 5
/** Teaching tries per Bangkok day (all tricks together). */
export const TRIES_PER_DAY = 12

export type TrickProgress = { good: Partial<Record<TrickId, number>>; day: string | null; triesToday: number }

/** Chance (0–1) the pet gets it right on this try: 35 % at first, +12 % per good try so far. */
export const successChance = (good: number) => Math.min(0.95, 0.35 + 0.12 * good)

export const isLearned = (p: TrickProgress, id: TrickId) => (p.good[id] ?? 0) >= LEARN_AFTER
export const triesLeft = (p: TrickProgress, day: string) => (p.day === day ? Math.max(0, TRIES_PER_DAY - p.triesToday) : TRIES_PER_DAY)

export type TryResult = 'good' | 'miss' | 'learned' | 'tired'

/** One teaching try. `roll` is 0–1 (random). */
export function practise(p: TrickProgress, id: TrickId, day: string, roll: number): { progress: TrickProgress; result: TryResult } {
  if (triesLeft(p, day) === 0) return { progress: p, result: 'tired' }
  const good = p.good[id] ?? 0
  const triesToday = (p.day === day ? p.triesToday : 0) + 1
  if (roll >= successChance(good)) return { progress: { ...p, day, triesToday }, result: 'miss' }
  const next = { ...p, day, triesToday, good: { ...p.good, [id]: good + 1 } }
  return { progress: next, result: good + 1 === LEARN_AFTER ? 'learned' : 'good' }
}

/** Read a finger path (points in px) as a gesture; taps are counted by the caller. */
export function readGesture(points: { x: number; y: number }[]): Gesture | null {
  if (points.length < 3) return null
  const first = points[0]
  const last = points[points.length - 1]
  const dx = last.x - first.x
  const dy = last.y - first.y
  let path = 0
  let turn = 0
  for (let i = 1; i < points.length; i++) {
    path += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    if (i > 1) {
      const a1 = Math.atan2(points[i - 1].y - points[i - 2].y, points[i - 1].x - points[i - 2].x)
      const a2 = Math.atan2(points[i].y - points[i - 1].y, points[i].x - points[i - 1].x)
      let d = a2 - a1
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      turn += d
    }
  }
  if (path < 60) return null
  // A loop: lots of turning, ends near where it started.
  if (Math.abs(turn) > 4.5 && Math.hypot(dx, dy) < path * 0.4) return 'circle'
  if (Math.abs(dy) > Math.abs(dx) * 1.5) return dy > 0 ? 'down' : 'up'
  if (Math.abs(dx) > Math.abs(dy) * 1.5) return 'sideways'
  return null
}

const isProgress = (x: unknown): x is TrickProgress => !!x && typeof (x as TrickProgress).good === 'object'
export const trickStore = localStore<TrickProgress>('thongyod-pet-tricks', () => ({ good: {}, day: null, triesToday: 0 }), isProgress)
