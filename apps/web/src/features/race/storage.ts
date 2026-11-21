// Remembers who raced last time on this device (a convenience; losing it is harmless).
import { MAX_RUNNERS, MIN_RUNNERS, RACER_IDS, type RacerId } from './logic'

export type Runner = { name: string; racer: RacerId }
const KEY = 'thongyod-race'

export function loadRunners(): Runner[] | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!Array.isArray(parsed)) return null
    const list = parsed.filter(
      (r): r is Runner => typeof r?.name === 'string' && (RACER_IDS as readonly string[]).includes(r?.racer),
    )
    return list.length >= MIN_RUNNERS ? list.slice(0, MAX_RUNNERS) : null
  } catch {
    return null
  }
}

export function saveRunners(runners: Runner[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(runners))
  } catch {
    // Storage blocked: the race still works.
  }
}
