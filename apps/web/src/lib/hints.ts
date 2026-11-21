// "Show this tip only the first few times" (UX_GUIDELINES §7, #94): e.g. the swipe hint under the invite deck.
// Counts how many times a hint was shown, in this browser. Never throws (private mode, blocked storage).
import { useEffect, useState } from 'react'

const key = (id: string) => `thongyod-hint-${id}`

export function hintSeenCount(id: string): number {
  try {
    return Number(localStorage.getItem(key(id))) || 0
  } catch {
    return 0
  }
}

/** Count one more showing. */
export function markHintShown(id: string) {
  try {
    localStorage.setItem(key(id), String(hintSeenCount(id) + 1))
  } catch {
    /* storage blocked: the hint just keeps showing */
  }
}

export const shouldShowHint = (id: string, times = 3) => hintSeenCount(id) < times

/** True while the hint has been shown fewer than `times` times; counts one showing per mount. */
export function useFirstTimesHint(id: string, times = 3): boolean {
  const [show] = useState(() => shouldShowHint(id, times))
  useEffect(() => {
    if (show) markHintShown(id)
  }, [id, show])
  return show
}
