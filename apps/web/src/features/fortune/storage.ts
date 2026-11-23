// Today's fortune stick + a short history, kept on this device (one draw per day).
import { addToHistory, isStickNo, keepsInHistory, type Draw } from './logic'

const KEY = 'thongyod-fortune'
const HISTORY_KEY = 'thongyod-fortune-history'

export function loadDraw(): Draw | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Draw
    // A stick from the old 40-stick set (29–40) is not a reading any more: today can be drawn again.
    return typeof d?.day === 'string' && isStickNo(d.stick) ? { day: d.day, stick: d.stick, ...(d.torn ? { torn: true } : {}) } : null
  } catch {
    return null
  }
}

/** Past draws, newest first (includes today's once drawn). Older devices only had today's draw: it is included. */
export function loadHistory(): Draw[] {
  let list: Draw[] = []
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    if (Array.isArray(parsed)) list = parsed.filter((d): d is Draw => typeof d?.day === 'string' && typeof d?.stick === 'number' && keepsInHistory(d.stick))
  } catch {
    list = []
  }
  const today = loadDraw()
  return today ? addToHistory(list, today) : list
}

export function saveDraw(draw: Draw): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(draw))
    localStorage.setItem(HISTORY_KEY, JSON.stringify(addToHistory(loadHistory(), draw)))
  } catch {
    // Storage blocked: the fortune still shows, it just is not kept for the day.
  }
}

/** The bad slip of today was torn and left at the shrine. */
export function markTorn(): void {
  const today = loadDraw()
  if (!today) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...today, torn: true }))
  } catch {
    // ignore
  }
}

/** TEMPORARY (Earth's testing, 2026-11-22): forget today's stick so it can be drawn again. Remove with the test button. */
export function forgetTodayForTesting(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
