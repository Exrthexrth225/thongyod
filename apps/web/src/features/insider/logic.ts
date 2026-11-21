// คนวงใน (Insider-style; our own name, words and art). Pure logic, tested in logic.test.ts.
// One player is the open "ผู้คุมเกม" who knows the word and answers yes/no; one other player is the secret
// "คนวงใน" who also knows it and quietly steers. Everyone else asks questions to find the word, then votes
// on who the คนวงใน was.
import { secureRandomInt } from '@/lib/random'

export const MIN_PLAYERS = 4
export const MAX_PLAYERS = 12
export const MINUTES = [3, 5, 8] as const
export type InsiderMinutes = (typeof MINUTES)[number]

/** Discussion after the word is guessed lasts as long as the guessing took (fast guess = short talk), within these bounds. */
export const TALK_MIN_SECONDS = 30
export const TALK_MAX_SECONDS = 300

export type InsiderRound = {
  word: string
  /** Player index (0-based) of the open game master. */
  master: number
  /** Player index of the secret insider — never the master. */
  insider: number
}

export function dealInsider({ players, word }: { players: number; word: string }, random: (max: number) => number = secureRandomInt): InsiderRound {
  const n = clampPlayers(players)
  const master = random(n)
  const other = random(n - 1)
  return { word, master, insider: other >= master ? other + 1 : other }
}

export type InsiderRole = 'master' | 'insider' | 'common'

export function roleOf(round: InsiderRound, player: number): InsiderRole {
  return player === round.master ? 'master' : player === round.insider ? 'insider' : 'common'
}

/** Seconds to discuss after a correct guess: the time the guessing took, clamped. */
export function talkSeconds(elapsed: number): number {
  return Math.max(TALK_MIN_SECONDS, Math.min(TALK_MAX_SECONDS, Math.round(elapsed)))
}

export const clampPlayers = (n: number) => Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.round(n) || MIN_PLAYERS))
