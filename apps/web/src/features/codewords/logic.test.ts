import { describe, expect, it } from 'vitest'
import { WORD_PACKS } from '@/config/wordPacks'
import { BOARD_SIZE, COUNTS, MAX_WORD_LENGTH, dealBoard, endTurn, left, openCard, visibleLength, type CodeGame } from './logic'

const words = Array.from({ length: 30 }, (_, i) => `คำ${i}`)
const seq = (values: number[]) => {
  let i = 0
  return (max: number) => values[i++ % values.length] % max
}
/** Index of the nth still-closed card of this owner. */
const indexOf = (g: CodeGame, owner: string, nth = 0) => g.cards.map((c, i) => (c.owner === owner && !c.revealed ? i : -1)).filter((i) => i >= 0)[nth]

describe('ทีมคำใบ้', () => {
  it('deals 20 cards: 7 for the starting team, 6, 6 neutral, 1 bomb', () => {
    for (const first of [0, 1]) {
      const g = dealBoard(words, seq([first, 3, 1, 4]))
      expect(g.cards).toHaveLength(BOARD_SIZE)
      const count = (o: string) => g.cards.filter((c) => c.owner === o).length
      expect(count(g.start)).toBe(COUNTS.first)
      expect(count(g.start === 'a' ? 'b' : 'a')).toBe(COUNTS.second)
      expect(count('neutral')).toBe(COUNTS.neutral)
      expect(count('bomb')).toBe(1)
      expect(g.turn).toBe(g.start)
      expect(new Set(g.cards.map((c) => c.word)).size).toBe(BOARD_SIZE)
    }
  })

  it('skips long words and refuses to deal without enough short ones', () => {
    const long = 'คำที่ยาวมากเกินไปจริงๆ'
    expect(visibleLength(long)).toBeGreaterThan(MAX_WORD_LENGTH)
    expect(dealBoard([long, ...words]).cards.some((c) => c.word === long)).toBe(false)
    expect(() => dealBoard(words.slice(0, 10))).toThrow()
  })

  it('does not count Thai tone marks as extra characters', () => {
    expect(visibleLength('ก่')).toBe(1)
    expect(visibleLength('แมว')).toBe(3)
  })

  it('own card keeps the turn, a miss passes it', () => {
    let g = dealBoard(words, seq([0, 5, 2]))
    const team = g.turn
    g = openCard(g, indexOf(g, team))
    expect(g.turn).toBe(team)
    g = openCard(g, indexOf(g, 'neutral'))
    expect(g.turn).not.toBe(team)
    const before = left(g, team)
    g = openCard(g, indexOf(g, team)) // other team opens our card: helps us, ends their turn
    expect(left(g, team)).toBe(before - 1)
    expect(g.turn).toBe(team)
  })

  it('the bomb loses at once; opening twice does nothing', () => {
    let g = dealBoard(words, seq([1, 7]))
    const team = g.turn
    const bomb = indexOf(g, 'bomb')
    g = openCard(g, bomb)
    expect(g.winner).not.toBe(team)
    expect(g.end).toBe('bomb')
    expect(openCard(g, 0)).toBe(g)
  })

  it('a team wins when all its cards are open, even on the other team’s turn', () => {
    let g = dealBoard(words, seq([0, 2, 9]))
    const second = g.start === 'a' ? 'b' : 'a'
    g = endTurn(g) // second team plays…
    for (let n = 0; n < COUNTS.second; n++) g = openCard(g, indexOf(g, second))
    expect(g.winner).toBe(second)
    expect(g.end).toBe('cleared')
  })

  it('the word packs give plenty of short words', () => {
    const short = WORD_PACKS.flatMap((p) => p.words).filter((w) => visibleLength(w) <= MAX_WORD_LENGTH)
    expect(short.length).toBeGreaterThan(400)
  })
})
