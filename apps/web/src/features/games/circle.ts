// The people around the table (#123), in seat order going round to the left. Optional: games work without names, but
// with them the app can say whose turn it is, who sits left / right, and count who got hit. Kept on this phone and
// shared by the circle games.
import { localStore } from '@/lib/localStore'

export const MAX_NAME = 20
export const MAX_CIRCLE = 20

const isNames = (raw: unknown): raw is string[] => Array.isArray(raw) && raw.every((x) => typeof x === 'string')
export const circleStore = localStore<string[]>('thongyod-circle', () => [], isNames)

/** Add names (trimmed, cut to MAX_NAME, no blanks, no repeats ignoring case), up to MAX_CIRCLE people. */
export function addNames(list: readonly string[], names: readonly string[]): string[] {
  const out = [...list]
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME)
    if (!name || out.length >= MAX_CIRCLE || out.some((x) => x.toLowerCase() === name.toLowerCase())) continue
    out.push(name)
  }
  return out
}

/** Move seat i one place up (-1) or down (+1); out of range = unchanged. */
export function moveSeat(list: readonly string[], i: number, by: -1 | 1): string[] {
  const j = i + by
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return [...list]
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}
