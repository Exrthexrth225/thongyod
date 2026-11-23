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
    // Two runners never share an animal (QA BUG-009): a repeat gets the next free one.
    const used = new Set<RacerId>()
    const unique = list.slice(0, MAX_RUNNERS).map((r) => {
      const racer = used.has(r.racer) ? RACER_IDS.find((id) => !used.has(id) && !list.some((o) => o.racer === id))! : r.racer
      used.add(racer)
      return { ...r, racer }
    })
    return unique.length >= MIN_RUNNERS ? unique : null
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
