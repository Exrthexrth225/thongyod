// Rapid taps on the pet (Earth, 2026-11-22; DECISIONS #104). Pure logic.
// A reaction is never cut off by the next tap; poking 5 times in 2.5 s makes the pet shy away and
// ignore taps for a moment ("stop poking me"), so tapping fast reads as a joke instead of a glitch.
export const TAP_WINDOW_MS = 2500
export const ANNOY_TAPS = 5
export const CALM_MS = 3000

export type TapState = { times: number[]; calmUntil: number }
export type TapOutcome = 'react' | 'annoyed' | 'ignore'

export const initialTaps: TapState = { times: [], calmUntil: 0 }

export function tap(state: TapState, now: number, busy: boolean): { state: TapState; outcome: TapOutcome } {
  if (now < state.calmUntil) return { state, outcome: 'ignore' }
  const times = [...state.times.filter((t) => now - t < TAP_WINDOW_MS), now]
  if (times.length >= ANNOY_TAPS) return { state: { times: [], calmUntil: now + CALM_MS }, outcome: 'annoyed' }
  return { state: { ...state, times }, outcome: busy ? 'ignore' : 'react' }
}
