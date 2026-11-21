import { useState } from 'react'

/**
 * Motion plan #7 (DECISIONS #98): a number pops when it changes, never on first show.
 * Spread the result on the element: `<span {...usePop(count)}>`. The key re-mounts it so the CSS animation replays.
 */
export function usePop(value: unknown): { key: string; className: string } {
  const [initial] = useState(value)
  const [changed, setChanged] = useState(false)
  // Adjusting state while rendering (React docs pattern): flips once, the first time the value moves.
  if (!changed && value !== initial) setChanged(true)
  return { key: String(value), className: changed || value !== initial ? 'num-pop' : '' }
}
