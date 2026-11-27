import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import {
  applyBossAction,
  blockingIds,
  bossDeadline,
  buildDeck,
  createBossGame,
  projectBossView,
  removeBossPlayer,
  resolveBossDeadlines,
  skipBossPlayer,
} from '@thongyod/shared/content/boss-engine.mjs'

const require = createRequire(import.meta.url)
const board = JSON.parse(readFileSync(require.resolve('@thongyod/shared/content/boss-board.json'), 'utf8'))
const zero = () => 0
let n = 0
const id = () => `a${++n}`

/** p1..p4 with fixed investors and hands; marker on space 0 (red+blue, 2 teams, x3). */
function table(hands = {}) {
  const s = createBossGame(['p1', 'p2', 'p3', 'p4'], {}, board, zero, 0)
  const investors = { p1: ['red'], p2: ['blue'], p3: ['green'], p4: ['yellow'] }
  for (const seat of s.seats) {
    seat.investors = investors[seat.id]
    seat.hand = (hands[seat.id] ?? []).map((c, i) => ({ id: `${seat.id}-${i}`, ...c }))
  }
  s.availableInvestors = ['orange', 'purple']
  s.firstPlayerId = s.turnPlayerId = 'p1'
  s.markerChooserId = 'p4'
  s.phase = 'turn_choice'
  s.markerSpace = 0
  return s
}

function ok(state, actor, action, now = 1000) {
  const r = applyBossAction(state, actor, { actionId: id(), action }, board, zero, now)
  assert.equal(r.ok, true, `${actor} ${action.type}: ${r.code}`)
  return r.state
}
function fails(state, actor, action, code, now = 1000) {
  const r = applyBossAction(state, actor, { actionId: id(), action }, board, zero, now)
  assert.equal(r.ok, false)
  assert.equal(r.code, code)
}

test('deck and board match the agreed edition', () => {
  const deck = buildDeck()
  assert.equal(deck.length, 98)
  assert.equal(deck.filter((c) => c.kind === 'travel').length, 21)
  assert.equal(board.spaces.length, 16)
  for (const s of board.spaces) {
    assert.ok(s.teamCount >= 2 && s.teamCount <= 5 && s.dividends >= 3 && s.dividends <= 6)
    assert.equal(s.teamCount, s.groups.reduce((a, g) => a + g.pick, 0))
    for (const g of s.groups) assert.ok(g.pick >= 1 && g.pick <= g.teams.length)
  }
  assert.deepEqual(board.dealPlacards.map((p) => p.shareValue / 1e6), [2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 5, 5])
  assert.deepEqual(board.dealPlacards[10].endRollFaces, [1, 2])
})

test('setup deals investors, five cards and lets the player on the right pick the start', () => {
  const s = createBossGame(['a', 'b', 'c', 'd', 'e'], {}, board, zero, 0)
  assert.equal(s.seats.every((x) => x.investors.length === 1 && x.hand.length === 5), true)
  assert.equal(s.availableInvestors.length, 1)
  const first = s.seats.findIndex((x) => x.id === s.firstPlayerId)
  assert.equal(s.markerChooserId, s.seats[(first + 4) % 5].id)
  const three = createBossGame(['a', 'b', 'c'], {}, board, zero, 0)
  assert.equal(three.seats.every((x) => x.investors.length === 2), true)
  assert.throws(() => createBossGame(['a', 'b'], {}, board, zero, 0))
})

test('a deal pays a bribe to someone outside it and only contributors must accept', () => {
  let s = table()
  s = ok(s, 'p1', { type: 'open_deal' })
  assert.equal(s.deal.totalValue, 3 * 2_000_000)
  fails(s, 'p1', { type: 'start_closing' }, 'NO_OFFER')
  // p3 (green, not needed) gets 1M to stay quiet; p2 brings blue
  s = ok(s, 'p1', { type: 'set_allocation', allocation: { p1: 3_000_000, p2: 2_000_000, p3: 1_000_000 } })
  fails(s, 'p1', { type: 'start_closing' }, 'NOT_ENOUGH_TEAMS')
  s = ok(s, 'p2', { type: 'accept_offer' })
  s = ok(s, 'p1', { type: 'start_closing' }, 2000)
  assert.equal(s.phase, 'closing')
  assert.equal(bossDeadline(s), new Date(2000 + 6000).toISOString())
  const early = resolveBossDeadlines(s, board, zero, 7999)
  assert.equal(early.changed, false)
  s = resolveBossDeadlines(s, board, zero, 8000).state
  assert.equal(s.phase, 'turn_choice')
  assert.equal(s.turnPlayerId, 'p2')
  assert.deepEqual(s.seats.map((x) => x.cash), [3_000_000, 2_000_000, 1_000_000, 0])
  assert.deepEqual(s.lastSettlement.payouts, { p1: 3_000_000, p2: 2_000_000, p3: 1_000_000 })
  assert.equal(s.spaces[0].closedByDeal, 1)
  assert.equal(s.markerSpace, 1)
  assert.equal(s.dealIndex, 1)
  assert.deepEqual(s.stats.p1, { deals: 1, biggest: 6_000_000, bribesPaid: 1_000_000, travels: 0, stops: 0 })
})

test('asks are public and auto-accept when the offer meets them; any change stops the count', () => {
  let s = table({ p3: [{ kind: 'team', team: 'blue' }] })
  s = ok(s, 'p1', { type: 'open_deal' })
  s = ok(s, 'p2', { type: 'set_ask', amount: 3_000_000 })
  s = ok(s, 'p1', { type: 'set_allocation', allocation: { p1: 3_000_000, p2: 3_000_000 } })
  assert.deepEqual(s.deal.acceptedIds, ['p2'])
  s = ok(s, 'p1', { type: 'start_closing' })
  s = ok(s, 'p4', { type: 'hold' })
  assert.equal(s.phase, 'negotiating')
  assert.equal(s.deal.closingDeadlineAt, null)
  s = ok(s, 'p1', { type: 'start_closing' })
  // a second blue offer arrives while closing: back to talks, offer and acceptances stay
  s = ok(s, 'p3', { type: 'play_team', cardId: 'p3-0' })
  assert.equal(s.phase, 'negotiating')
  assert.deepEqual(s.deal.acceptedIds, ['p2'])
  s = ok(s, 'p2', { type: 'decline_offer' })
  assert.deepEqual(s.deal.declinedIds, ['p2'])
  s = ok(s, 'p3', { type: 'accept_offer' })
  assert.equal(projectBossView(s, 'p4', board).deal.canClose, true)
})

test('stop window: first Stop cancels at once, a late Stop keeps its card, no Stop lets the card work after 5 s', () => {
  const hands = { p3: [{ kind: 'travel', team: 'blue' }, { kind: 'travel', team: 'any' }], p2: [{ kind: 'stop' }], p4: [{ kind: 'stop' }] }
  let s = table(hands)
  s = ok(s, 'p1', { type: 'open_deal' })
  s = ok(s, 'p3', { type: 'play_travel', cardId: 'p3-0', targetTeam: 'blue' }, 1000)
  assert.equal(s.phase, 'interrupt')
  assert.equal(s.interrupt.targetId, 'p2')
  fails(s, 'p3', { type: 'play_team', cardId: 'x' }, 'INVALID_PHASE')
  s = ok(s, 'p2', { type: 'play_stop', cardId: 'p2-0' }, 1500)
  assert.equal(s.phase, 'negotiating')
  assert.deepEqual(s.deal.blockedTeams, [])
  fails(s, 'p4', { type: 'play_stop', cardId: 'p4-0' }, 'INVALID_PHASE')
  assert.equal(s.seats.find((x) => x.id === 'p4').hand.length, 1)

  s = ok(s, 'p3', { type: 'play_travel', cardId: 'p3-1', targetTeam: 'blue' }, 2000)
  assert.equal(resolveBossDeadlines(s, board, zero, 6999).changed, false)
  s = resolveBossDeadlines(s, board, zero, 7000).state
  assert.deepEqual(s.deal.blockedTeams, ['blue'])
  assert.equal(s.events.at(-1).cancelled, false)
})

test('Boss card takes over the deal, keeps the draft offer and needs fresh acceptance', () => {
  let s = table({ p2: [{ kind: 'boss' }] })
  s = ok(s, 'p1', { type: 'open_deal' })
  s = ok(s, 'p1', { type: 'set_allocation', allocation: { p1: 4_000_000, p2: 2_000_000 } })
  s = ok(s, 'p2', { type: 'accept_offer' })
  s = ok(s, 'p2', { type: 'play_boss', cardId: 'p2-0' }, 1000)
  s = resolveBossDeadlines(s, board, zero, 6000).state
  assert.equal(s.deal.bossId, 'p2')
  assert.deepEqual(s.deal.allocation, { p1: 4_000_000, p2: 2_000_000 })
  assert.deepEqual(s.deal.acceptedIds, [])
  s = ok(s, 'p1', { type: 'accept_offer' })
  s = ok(s, 'p2', { type: 'start_closing' }, 7000)
  s = resolveBossDeadlines(s, board, zero, 13_000).state
  assert.equal(s.turnPlayerId, 'p3', 'next turn follows the final boss')
})

test('Recruit needs three cards and takes an unowned investor first', () => {
  const r = [{ kind: 'recruit' }, { kind: 'recruit' }, { kind: 'recruit' }]
  let s = table({ p3: r })
  s = ok(s, 'p1', { type: 'open_deal' })
  fails(s, 'p3', { type: 'play_recruit', cardIds: ['p3-0', 'p3-1', 'p3-2'], targetTeam: 'blue' }, 'RECRUIT_UNOWNED_FIRST')
  s = ok(s, 'p3', { type: 'play_recruit', cardIds: ['p3-0', 'p3-1', 'p3-2'], targetTeam: 'orange' })
  s = resolveBossDeadlines(s, board, zero, 10_000).state
  assert.deepEqual(s.seats.find((x) => x.id === 'p3').investors, ['green', 'orange'])
  assert.deepEqual(s.availableInvestors, ['purple'])
})

test('end roll from deal 10, short game skips #3 #6 #9 and the last placard ends the game', () => {
  let s = table()
  s.dealIndex = 9 // placard 10, faces [1]; zero() rolls a 1
  s = ok(s, 'p1', { type: 'open_deal' })
  s = ok(s, 'p1', { type: 'set_allocation', allocation: { p1: 15_000_000 } })
  s = ok(s, 'p2', { type: 'accept_offer' })
  s = ok(s, 'p1', { type: 'start_closing' })
  s = resolveBossDeadlines(s, board, zero, 60_000).state
  assert.deepEqual(s.lastEndRoll, { roll: 1, ended: true, dealNumber: 10, faces: [1] })
  assert.equal(s.phase, 'game_over')
  assert.deepEqual(s.winnerIds, ['p1'])
  const short = createBossGame(['a', 'b', 'c'], { short: true }, board, zero, 0)
  assert.deepEqual(short.placards, [1, 2, 4, 5, 7, 8, 10, 11, 12, 13, 14, 15])
})

test('drawing past twelve cards forces a discard; the host can skip it at random', () => {
  let s = table({ p1: Array.from({ length: 11 }, () => ({ kind: 'recruit' })) })
  s = ok(s, 'p1', { type: 'roll_die' })
  assert.equal(s.lastRoll, 1)
  s = ok(s, 'p1', { type: 'draw_cards' })
  assert.equal(s.phase, 'discard_limit')
  assert.deepEqual(blockingIds(s), ['p1'])
  const skipped = skipBossPlayer(s, 'p1', zero, 2000)
  assert.equal(skipped.ok, true)
  assert.equal(skipped.state.seats[0].hand.length, 12)
  assert.equal(skipped.state.turnPlayerId, 'p2')
})

test('host skip and kick: boss away fails the deal, a needed investor is taken out, kicked cash leaves', () => {
  let s = table({ p2: [{ kind: 'team', team: 'red' }] })
  s = ok(s, 'p1', { type: 'open_deal' })
  s = ok(s, 'p2', { type: 'play_team', cardId: 'p2-0' })
  assert.deepEqual(blockingIds(s).sort(), ['p1', 'p2'])
  const out = skipBossPlayer(s, 'p2', zero, 2000)
  assert.equal(out.ok, true)
  assert.deepEqual(out.state.deal.blockedTeams, ['blue'])
  assert.equal(out.state.seats[1].hand.length, 1, 'team card back in hand')
  const failed = skipBossPlayer(s, 'p1', zero, 2000).state
  assert.equal(failed.deal, null)
  assert.equal(failed.turnPlayerId, 'p2')

  s.seats[3].cash = 9
  const kicked = removeBossPlayer(s, 'p4', zero, 3000)
  assert.equal(kicked.seats.length, 3)
  assert.ok(kicked.availableInvestors.includes('yellow'))
  const twoLeft = removeBossPlayer(kicked, 'p3', zero, 3000)
  assert.equal(twoLeft.phase, 'game_over')
})

test('views hide other hands and exact cash until the end; duplicates are ignored', () => {
  let s = table({ p2: [{ kind: 'stop' }] })
  s.seats[1].cash = 7_000_000
  const v = projectBossView(s, 'p1', board)
  assert.equal(v.myHand.length, 0)
  assert.equal(v.seats[1].exactCash, null)
  assert.equal(v.seats[1].cashTier, 'low')
  assert.equal(v.seats[1].handCount, 1)
  const r1 = applyBossAction(s, 'p1', { actionId: 'same', action: { type: 'roll_die' } }, board, zero, 1)
  const r2 = applyBossAction(r1.state, 'p1', { actionId: 'same', action: { type: 'roll_die' } }, board, zero, 2)
  assert.equal(r2.duplicate, true)
  assert.equal(r2.state.revision, r1.state.revision)
})
