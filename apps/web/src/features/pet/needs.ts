// Looking after the pet for real (#119): three needs that drop with real time, filled by feeding, playing and
// bathing. Gentle on purpose (Earth, 2026-11-22): a neglected pet only looks sad and goes out more; it never gets
// ill, runs away or dies. Night (23:00–07:00 Bangkok) it sleeps and gets hungry / bored at half speed.
import { useSyncExternalStore } from 'react'

export type NeedId = 'food' | 'fun' | 'clean'
export const NEED_IDS: NeedId[] = ['food', 'fun', 'clean']
export type Needs = Record<NeedId, number>
/** Values (0–100) as of `at` (ISO time). */
export type NeedsState = Needs & { at: string }

/** Points lost per hour awake: food empties in ~10 h, fun in ~1 day, clean in ~2 days. */
export const DECAY_PER_HOUR: Needs = { food: 10, fun: 100 / 24, clean: 100 / 48 }
/** Below this a need shows (speech bubble, sad face). */
export const LOW = 30
/** A care action counts as a "care day" for growing up when every need is at least this afterwards. */
export const CARE_OK = 40
/** Feeding when food is at least this: the pet is full and refuses. */
export const FULL = 90

const HOUR = 3_600_000
const clamp = (n: number) => Math.max(0, Math.min(100, n))

/** Bangkok hour (UTC+7, no daylight saving). */
export const bangkokHour = (d: Date) => (d.getUTCHours() + 7) % 24
export const isNightAt = (d: Date) => {
  const h = bangkokHour(d)
  return h >= 23 || h < 7
}

/** Hours between two times, with night hours counted half (sleeping pets get hungry slower). */
export function awakeHours(from: Date, to: Date): number {
  if (to <= from) return 0
  let total = 0
  // Walk hour by hour (at most 30 days, so a long absence costs nothing much and the loop stays small).
  let t = Math.max(from.getTime(), to.getTime() - 30 * 24 * HOUR)
  while (t < to.getTime()) {
    const step = Math.min(HOUR, to.getTime() - t)
    total += (step / HOUR) * (isNightAt(new Date(t)) ? 0.5 : 1)
    t += step
  }
  return total
}

/** The needs at `now`. Clean drops at the same rate day and night (sleeping does not wash you). */
export function needsAt(s: NeedsState, now: Date): Needs {
  const from = new Date(s.at)
  const awake = awakeHours(from, now)
  const all = Math.max(0, (now.getTime() - from.getTime()) / HOUR)
  return { food: clamp(s.food - DECAY_PER_HOUR.food * awake), fun: clamp(s.fun - DECAY_PER_HOUR.fun * awake), clean: clamp(s.clean - DECAY_PER_HOUR.clean * all) }
}

export type Mood = 'happy' | 'ok' | 'sad'
export function moodOf(n: Needs): Mood {
  const low = Math.min(n.food, n.fun, n.clean)
  return low >= 60 ? 'happy' : low >= LOW ? 'ok' : 'sad'
}

/** The need to complain about (the lowest one under LOW), or null. */
export function wantOf(n: Needs): NeedId | null {
  const low = NEED_IDS.filter((id) => n[id] < LOW).sort((a, b) => n[a] - n[b])
  return low[0] ?? null
}

/** Add to some needs at `now` (capped at 100). */
export function applyCare(s: NeedsState, now: Date, add: Partial<Needs>): NeedsState {
  const n = needsAt(s, now)
  return { food: clamp(n.food + (add.food ?? 0)), fun: clamp(n.fun + (add.fun ?? 0)), clean: clamp(n.clean + (add.clean ?? 0)), at: now.toISOString() }
}

export const isCareDay = (n: Needs) => NEED_IDS.every((id) => n[id] >= CARE_OK)

// ---------- store (localStorage; one pet per device for now, backend later) ----------

const KEY = 'thongyod-pet-needs'
/** A new pet starts content but a little hungry, so the first feed matters. */
export const fresh = (now: Date): NeedsState => ({ food: 55, fun: 80, clean: 100, at: now.toISOString() })

let current: NeedsState | null = null
const listeners = new Set<() => void>()

function load(): NeedsState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as NeedsState | null
    if (raw && typeof raw.at === 'string' && NEED_IDS.every((id) => typeof raw[id] === 'number')) return raw
  } catch {
    // fall through
  }
  return fresh(new Date())
}
const get = () => (current ??= load())

export function getNeedsState(): NeedsState {
  return get()
}

export function setNeedsState(next: NeedsState): void {
  current = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage blocked: this visit only.
  }
  listeners.forEach((l) => l())
}

/** New egg: start over. */
export function resetNeeds(now: Date = new Date()): void {
  setNeedsState(fresh(now))
}

export function useNeedsState(): NeedsState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    get,
    get,
  )
}
