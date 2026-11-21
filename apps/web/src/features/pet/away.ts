// While you are away (Earth, 2026-11-22; DECISIONS #106): the pet lives its own little life. Come back after a few
// hours and it tells you what it did, and sometimes it found a souvenir for its album. No guilt: nothing is lost
// by staying away, the pet is only ever glad to see you.
import { secureRandomInt } from '@/lib/random'

/** Order = Earth's souvenir sticker sheet (4 × 4), left to right, top to bottom. */
export const SOUVENIRS = [
  'leaf', 'pebble', 'shell', 'boat', 'ticket', 'mangoRice', 'bubbleTea', 'bell',
  'clover', 'button', 'starCandy', 'lantern', 'feather', 'keychain', 'note', 'flower',
] as const
export type SouvenirId = (typeof SOUVENIRS)[number]
export const ACTIVITIES = ['walk', 'nap', 'snack', 'explore', 'stars'] as const
export type ActivityId = (typeof ACTIVITIES)[number]

/** Away at least this long before the pet has something to tell. */
export const AWAY_MS = 3 * 3_600_000
/** Chance (of 100) of a souvenir on a day that has not had one yet. */
export const GIFT_CHANCE = 70

export type AwayEvent = { activity: ActivityId; souvenir: SouvenirId | null }

export function awayEvent(
  lastSeen: number | null,
  now: number,
  hour: number,
  found: readonly SouvenirId[],
  giftToday: boolean,
  random: (max: number) => number = secureRandomInt,
): AwayEvent | null {
  if (lastSeen === null || now - lastSeen < AWAY_MS) return null
  const pool: ActivityId[] = hour >= 19 || hour < 5 ? ['nap', 'stars', 'snack'] : ['walk', 'nap', 'snack', 'explore']
  const activity = pool[random(pool.length)]
  const fresh = SOUVENIRS.filter((s) => !found.includes(s))
  const souvenir = !giftToday && fresh.length > 0 && random(100) < GIFT_CHANCE ? fresh[random(fresh.length)] : null
  return { activity, souvenir }
}

export type AwayStore = { lastSeen: number | null; lastGiftDay: string | null; found: { id: SouvenirId; day: string }[] }
const KEY = 'thongyod-pet-away'

export function loadAway(): AwayStore {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as AwayStore | null
    if (raw && Array.isArray(raw.found)) return { ...raw, found: raw.found.filter((f) => SOUVENIRS.includes(f.id)) }
  } catch {
    // fall through
  }
  return { lastSeen: null, lastGiftDay: null, found: [] }
}

function saveAway(s: AwayStore) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Storage blocked: the album is kept for this visit only.
  }
}

let sessionEvent: AwayEvent | null | undefined

/**
 * Once per app visit: work out what happened while you were away, keep any souvenir, and mark you as here now.
 * Home and the pet page both call it and get the same answer.
 */
export function takeAwayEvent(now: Date, day: string): AwayEvent | null {
  if (sessionEvent !== undefined) return sessionEvent
  const store = loadAway()
  const event = awayEvent(store.lastSeen, now.getTime(), now.getHours(), store.found.map((f) => f.id), store.lastGiftDay === day)
  const next: AwayStore = { ...store, lastSeen: now.getTime() }
  if (event?.souvenir) {
    next.found = [...store.found, { id: event.souvenir, day }]
    next.lastGiftDay = day
  }
  saveAway(next)
  sessionEvent = event
  return event
}
