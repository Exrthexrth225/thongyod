// "เริ่มต้นใช้ทองหยอด" on Home (#96): three first steps for a new user. The card goes away when all are done
// or when the user hides it. Stored in this browser; never throws.

export type FirstRunStep = 'friend' | 'game' | 'gang'
export const FIRST_RUN_TO: Record<FirstRunStep, string> = { friend: '/friends/qr', game: '/games', gang: '/gangs' }

const PLAYED = 'thongyod-first-game'
const HIDDEN = 'thongyod-first-run-hidden'

const read = (k: string) => {
  try {
    return localStorage.getItem(k) === '1'
  } catch {
    return false
  }
}
const write = (k: string) => {
  try {
    localStorage.setItem(k, '1')
  } catch {
    /* storage blocked: nothing to remember */
  }
}

/** Called when any game screen opens: opening a game counts as trying one. */
export const markGameOpened = () => write(PLAYED)
export const hasOpenedGame = () => read(PLAYED)
export const hideFirstRun = () => write(HIDDEN)
export const isFirstRunHidden = () => read(HIDDEN)

export type FirstRunState = { step: FirstRunStep; done: boolean }[]

/** The three steps with their done state; null while the profile counts are unknown. */
export function firstRunSteps(stats: { friends: number; gangs: number } | null | undefined, openedGame: boolean): FirstRunState | null {
  if (!stats) return null
  return [
    { step: 'friend', done: stats.friends > 0 },
    { step: 'game', done: openedGame },
    { step: 'gang', done: stats.gangs > 0 },
  ]
}

/** Show the card while something is left to do and the user has not hidden it. */
export const showFirstRun = (steps: FirstRunState | null, hidden: boolean) => !!steps && !hidden && steps.some((s) => !s.done)
