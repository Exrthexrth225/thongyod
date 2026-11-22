// The games list remembers what this phone plays (#123): the last few games opened and the ones pinned. The list itself
// never reorders (people find games by where they are); instead one "ของวงเรา" row on top shows pins, then recents.
import { localStore } from '@/lib/localStore'

const isIds = (raw: unknown): raw is string[] => Array.isArray(raw) && raw.every((x) => typeof x === 'string')

export const recentStore = localStore<string[]>('thongyod-games-recent', () => [], isIds)
export const pinStore = localStore<string[]>('thongyod-games-pins', () => [], isIds)

export const RECENT_MAX = 4
export const TOP_MAX = 6

/** Opened `id`: it goes first, no duplicates, at most RECENT_MAX. */
export const pushRecent = (list: readonly string[], id: string) => [id, ...list.filter((x) => x !== id)].slice(0, RECENT_MAX)

export const togglePin = (list: readonly string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

/** The top row: pinned first (in pin order), then recent ones not pinned; unknown ids dropped. */
export function topRow(pins: readonly string[], recent: readonly string[], known: (id: string) => boolean) {
  const out: { id: string; pinned: boolean }[] = []
  for (const id of pins) if (known(id)) out.push({ id, pinned: true })
  for (const id of recent) if (known(id) && !pins.includes(id)) out.push({ id, pinned: false })
  return out.slice(0, TOP_MAX)
}

/** Does a game for [min, max] players fit a group of `n`? null = no filter. */
export const fitsGroup = ([min, max]: readonly [number, number], n: number | null) => n === null || (min <= n && n <= max)

export const noteOpened = (id: string) => recentStore.set(pushRecent(recentStore.get(), id))
