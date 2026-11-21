// ทีมคำใบ้ (Codenames-style on one phone; our own name and words — decision #91). Pure logic, tested in logic.test.ts.
// 20 words in a 4×5 grid: the starting team owns 7, the other 6, 6 are nobody's, 1 is the bomb.
import { secureRandomInt, shuffle } from '@/lib/random'

export type Team = 'a' | 'b'
export type Owner = Team | 'neutral' | 'bomb'
export type CodeCard = { word: string; owner: Owner; revealed: boolean }
export type CodeGame = { cards: CodeCard[]; turn: Team; start: Team; winner: Team | null; /** Why the game ended. */ end: 'cleared' | 'bomb' | null }

export const BOARD_SIZE = 20
export const COUNTS = { first: 7, second: 6, neutral: 6, bomb: 1 } as const
/** Longest word (in user-perceived characters) that still fits a grid cell on a small phone. */
export const MAX_WORD_LENGTH = 8

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null
export const visibleLength = (word: string) => (segmenter ? [...segmenter.segment(word)].length : [...word].length)

export const other = (team: Team): Team => (team === 'a' ? 'b' : 'a')

/** Deal a board from at least 20 candidate words (already in random order); short words only. */
export function dealBoard(words: readonly string[], random: (max: number) => number = secureRandomInt): CodeGame {
  const picked = [...new Set(words.filter((w) => visibleLength(w) <= MAX_WORD_LENGTH))].slice(0, BOARD_SIZE)
  if (picked.length < BOARD_SIZE) throw new Error(`need ${BOARD_SIZE} short words, got ${picked.length}`)
  const start: Team = random(2) === 0 ? 'a' : 'b'
  const owners: Owner[] = [
    ...Array<Owner>(COUNTS.first).fill(start),
    ...Array<Owner>(COUNTS.second).fill(other(start)),
    ...Array<Owner>(COUNTS.neutral).fill('neutral'),
    'bomb',
  ]
  const shuffled = shuffle(owners, random)
  return { cards: picked.map((word, i) => ({ word, owner: shuffled[i], revealed: false })), turn: start, start, winner: null, end: null }
}

/** Cards a team still has to find. */
export const left = (game: CodeGame, team: Team) => game.cards.filter((c) => c.owner === team && !c.revealed).length

/**
 * The team on turn opens card `index`. Own card: keep guessing. Neutral or the other team's card: turn passes.
 * Bomb: the team on turn loses at once. A team wins as soon as all its cards are open (even if the other team opened the last one).
 */
export function openCard(game: CodeGame, index: number): CodeGame {
  const card = game.cards[index]
  if (game.winner || !card || card.revealed) return game
  const cards = game.cards.map((c, i) => (i === index ? { ...c, revealed: true } : c))
  const next = { ...game, cards }
  if (card.owner === 'bomb') return { ...next, winner: other(game.turn), end: 'bomb' }
  for (const team of [game.turn, other(game.turn)] as const) if (left(next, team) === 0) return { ...next, winner: team, end: 'cleared' }
  return card.owner === game.turn ? next : { ...next, turn: other(game.turn) }
}

export const endTurn = (game: CodeGame): CodeGame => (game.winner ? game : { ...game, turn: other(game.turn) })
