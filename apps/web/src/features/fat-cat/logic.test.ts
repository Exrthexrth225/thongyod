import { describe, expect, it } from 'vitest'
import { STANDARD_SET } from '@/config/games/fatCat'
import {
  addKingRule,
  addPlayer,
  allAway,
  canDraw,
  cardsLeft,
  copySet,
  current,
  deckEmpty,
  deckOf,
  draw,
  faceUp,
  isRuleSet,
  isTable,
  newTable,
  next,
  nextSeat,
  removePlayer,
  reshuffle,
  reverse,
  setAway,
  shuffled,
  skip,
  undoLast,
  type Memento,
  type Table,
} from './logic'

const S = STANDARD_SET
const names = ['ต้น', 'เอิร์ธ', 'ฝน', 'บี']
const noShuffle = () => 0
const start = (opts = {}) => shuffled(newTable('standard', names, opts, noShuffle))

/** Draw and pass the turn on, `n` times. */
function play(t: Table, n: number, undo: Memento[] = []) {
  for (let i = 0; i < n; i++) {
    const r = draw(t, undo, S, 1000 + i)
    t = next(r.table)
    undo = r.undo
  }
  return { t, undo }
}

describe('แมวอ้วง deck', () => {
  it('1 deck = 52 different cards, 2 decks = 104 with each card exactly twice', () => {
    expect(new Set(deckOf(1).map((c) => c.rank + c.suit)).size).toBe(52)
    const two = deckOf(2)
    expect(two).toHaveLength(104)
    const count = new Map<string, number>()
    for (const c of two) count.set(c.rank + c.suit, (count.get(c.rank + c.suit) ?? 0) + 1)
    expect([...count.values()].every((n) => n === 2)).toBe(true)
    expect(new Set(two.map((c) => c.rank + c.suit + c.deck)).size).toBe(104)
  })
})

describe('แมวอ้วง state machine', () => {
  it('shuffling → down → up → down for the next player', () => {
    const t0 = newTable('standard', names, {}, noShuffle)
    expect(t0.phase).toBe('shuffling')
    expect(canDraw(t0)).toBe(false)
    const t1 = shuffled(t0)
    expect(t1.phase).toBe('down')
    const { table: t2, undo } = draw(t1, [], S, 5)
    expect(t2.phase).toBe('up')
    expect(faceUp(t2)).toEqual(t1.deck[0])
    expect(t2.history[0]).toMatchObject({ turn: 1, player: 'ต้น', at: 5, title: S.rules[t1.deck[0].rank].title })
    expect(undo).toHaveLength(1)
    expect(draw(t2, undo, S, 6).table).toBe(t2) // no drawing while a card is up
    const t3 = next(t2)
    expect(t3.phase).toBe('down')
    expect(current(t3)?.name).toBe('เอิร์ธ')
  })
  it('goes the other way after reverse', () => {
    const t = play(reverse(start()), 1).t
    expect(current(t)?.name).toBe('บี')
  })
  it('runs out, then reshuffles keeping players, turn, queen, rules and history', () => {
    let { t } = play(start(), 52)
    expect(deckEmpty(t)).toBe(true)
    expect(canDraw(t)).toBe(false)
    t = { ...addKingRule(t, 'ร้องเหมียว'), queen: 'ฝน' }
    const again = shuffled(reshuffle(t))
    expect(cardsLeft(again)).toBe(52)
    expect(again.seat).toBe(t.seat)
    expect(again.queen).toBe('ฝน')
    expect(again.kRules).toEqual(['ร้องเหมียว'])
    expect(again.history).toHaveLength(52)
  })
  it('2 decks last 104 cards', () => {
    expect(cardsLeft(start({ decks: 2 }))).toBe(104)
  })
})

describe('แมวอ้วง card effects', () => {
  const deckWith = (rank: string) => ({ ...start(), deck: [{ rank, suit: 'heart', deck: 0 }, ...deckOf(1).slice(1)] }) as Table
  it('Q makes the opener queen, replacing the old one', () => {
    const t = draw({ ...deckWith('Q'), queen: 'บี' }, [], S, 0).table
    expect(t.queen).toBe('ต้น')
  })
  it('K rules replace by default, or stack', () => {
    let t = addKingRule(addKingRule(start(), 'ก'), 'ข')
    expect(t.kRules).toEqual(['ข'])
    t = addKingRule(addKingRule(start({ kMode: 'stack' }), 'ก'), '  ข  ')
    expect(t.kRules).toEqual(['ก', 'ข'])
    expect(addKingRule(t, '   ').kRules).toEqual(['ก', 'ข'])
  })
})

describe('แมวอ้วง players', () => {
  it('skips a turn without drawing', () => {
    const { table, undo } = skip(start(), [])
    expect(current(table)?.name).toBe('เอิร์ธ')
    expect(table.drawn).toBe(0)
    expect(undo).toHaveLength(1)
  })
  it('passes over AFK players, and stops when everyone is away', () => {
    let t = setAway(start(), 'เอิร์ธ', true)
    t = play(t, 1).t
    expect(current(t)?.name).toBe('ฝน')
    for (const n of names) t = setAway(t, n, true)
    expect(allAway(t)).toBe(true)
    expect(canDraw(t)).toBe(false)
    expect(skip(t, []).table).toBe(t)
    expect(nextSeat(t.players, 1, 1)).toBe(1) // no endless loop
  })
  it('the current player going AFK passes the turn on', () => {
    expect(current(setAway(start(), 'ต้น', true))?.name).toBe('เอิร์ธ')
  })
  it('removing the current player gives the turn to the next one', () => {
    const t = removePlayer(play(start(), 2).t, 'ฝน') // ฝน's turn
    expect(current(t)?.name).toBe('บี')
    const back = removePlayer(reverse(play(start(), 2).t), 'ฝน')
    expect(current(back)?.name).toBe('เอิร์ธ')
    const last = removePlayer({ ...start(), seat: 3 }, 'บี')
    expect(current(last)?.name).toBe('ต้น')
  })
  it('removing someone before the current player keeps the same turn; the deck is untouched', () => {
    const t0 = play(start(), 2).t
    const t = removePlayer(t0, 'ต้น')
    expect(current(t)?.name).toBe('ฝน')
    expect(t.deck).toBe(t0.deck)
    expect(t.drawn).toBe(t0.drawn)
  })
  it('a new player joins just before the current one (comes round last)', () => {
    const t = addPlayer(play(start(), 1).t, 'แก้ม')
    expect(current(t)?.name).toBe('เอิร์ธ')
    expect(t.players.map((p) => p.name)).toEqual(['ต้น', 'แก้ม', 'เอิร์ธ', 'ฝน', 'บี'])
    expect(addPlayer(t, 'แก้ม').players).toHaveLength(5)
  })
  it('the removed queen stops being queen', () => {
    expect(removePlayer({ ...start(), queen: 'ฝน' }, 'ฝน').queen).toBeNull()
  })
})

describe('แมวอ้วง undo', () => {
  it('steps back through several draws and skips, then stops at the start', () => {
    const t0 = start()
    let { t, undo } = play(t0, 3)
    const s = skip(t, undo)
    t = s.table
    undo = s.undo
    expect(undo).toHaveLength(4)
    for (let i = 0; i < 4; i++) ({ table: t, undo } = undoLast(t, undo))
    expect(t.drawn).toBe(0)
    expect(t.history).toHaveLength(0)
    expect(current(t)?.name).toBe('ต้น')
    expect(t.phase).toBe('down')
    expect(undoLast(t, undo).table).toBe(t) // empty stack: nothing happens
  })
  it('puts the card back on top, and the queen back', () => {
    const base = { ...start(), queen: 'บี', deck: [{ rank: 'Q', suit: 'club', deck: 0 }, ...deckOf(1).slice(1)] } as Table
    const r = draw(base, [], S, 0)
    expect(r.table.queen).toBe('ต้น')
    const u = undoLast(r.table, r.undo).table
    expect(u.queen).toBe('บี')
    expect(u.drawn).toBe(0)
    expect(u.deck[0]).toEqual(base.deck[0])
  })
  it('keeps who is playing as it is now', () => {
    const { t, undo } = play(start(), 2)
    const later = addPlayer(removePlayer(t, 'บี'), 'แก้ม')
    const u = undoLast(later, undo).table
    expect(u.players.map((p) => p.name)).toEqual(later.players.map((p) => p.name))
    expect(current(u)?.name).toBe('เอิร์ธ')
  })
})

describe('แมวอ้วง saved data', () => {
  it('accepts sets (old ones with penalty / who too), rejects broken ones', () => {
    expect(isRuleSet(S)).toBe(true)
    expect(isRuleSet(copySet(S, 'x', 'ของแก๊ง'))).toBe(true)
    expect(isRuleSet({ ...S, penalty: 'ดื่ม', rules: { ...S.rules, A: { title: 'a', text: 'b', who: 'self' } } })).toBe(true)
    expect(isRuleSet({ ...S, rules: { ...S.rules, Q: { title: 'x' } } })).toBe(false)
  })
  it('accepts a saved table, rejects junk', () => {
    expect(isTable(start({ decks: 2 }))).toBe(true)
    expect(isTable({ ...start(), deck: [] })).toBe(false)
    expect(isTable(null)).toBe(false)
  })
  it('works without names', () => {
    const t = shuffled(newTable('standard', [], {}, noShuffle))
    expect(current(t)).toBeNull()
    expect(draw(t, [], S, 0).table.history[0].player).toBeNull()
  })
})
