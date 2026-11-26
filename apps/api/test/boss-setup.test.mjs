import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceMarker, prepareTable } from '../dist/games/boss/setup.js'

for (const players of [3, 4, 5, 6]) {
  test('initial deal for ' + players + ' players conserves all components', () => {
    const ids = Array.from({ length: players }, (_, i) => 'seat-' + i)
    const table = prepareTable(ids, () => 0)
    assert.equal(table.firstPlayer, ids[0])
    assert.equal(table.markerChooser, ids.at(-1))
    const investors = table.seats.flatMap(seat => seat.investors).concat(table.available)
    assert.equal(investors.length, 6)
    assert.equal(new Set(investors).size, 6)
    for (const seat of table.seats) {
      assert.equal(seat.hand.length, 5)
      assert.equal(seat.investors.length, players === 3 ? 2 : 1)
      assert.equal(seat.cash, 0)
    }
    const cards = table.deck.concat(table.seats.flatMap(seat => seat.hand))
    const counts = Object.fromEntries(Object.entries(Object.groupBy(cards, card => card.kind))
      .map(([kind, group]) => [kind, group.length]))
    assert.deepEqual(counts, { team: 24, travel: 21, recruit: 33, boss: 10, stop: 10 })
    assert.equal(cards.filter(card => card.team === 'any').length, 3)
  })
}

test('marker crosses the start and counts only remaining deals', () => {
  assert.equal(advanceMarker(14, 2, new Set([15, 0, 2])), 3)
  assert.equal(advanceMarker(8, 6, new Set(Array.from({ length: 15 }, (_, i) => i))), 15)
})

test('reject invalid tables and a board without an open deal', () => {
  for (const ids of [['a', 'b'], ['a', 'a', 'b'], Array.from('abcdefg')]) {
    assert.throws(() => prepareTable(ids), RangeError)
  }
  assert.throws(() => advanceMarker(0, 1, new Set(Array.from({ length: 16 }, (_, i) => i))), RangeError)
})
