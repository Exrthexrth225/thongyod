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
  draftRandomRest,
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

/** p1..p4 with fixed investors and hands; marker on space 3 (red+blue, 2 teams, x3). */
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
  s.markerSpace = 3
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
  assert.equal(s.seats.every((x) => x.investors.length === 1 && x.hand.length === 5 && x.portrait === x.investors[0]), true)
  assert.equal(s.availableInvestors.length, 1)
  const first = s.seats.findIndex((x) => x.id === s.firstPlayerId)
  assert.equal(s.markerChooserId, s.seats[(first + 4) % 5].id)
  const three = createBossGame(['a', 'b', 'c'], {}, board, zero, 0)
  assert.equal(three.seats.every((x) => x.investors.length === 2), true)
  const threeOne = createBossGame(['a', 'b', 'c'], { investorsEach: 1 }, board, zero, 0)
  assert.equal(threeOne.seats.every((x) => x.investors.length === 1), true)
  assert.equal(threeOne.availableInvestors.length, 3)
  // four players cannot hold two each (only six investors): falls back to one
  assert.equal(createBossGame(['a', 'b', 'c', 'd'], { investorsEach: 2 }, board, zero, 0).seats[0].investors.length, 1)
  assert.throws(() => createBossGame(['a', 'b'], {}, board, zero, 0))
})

test('snake draft: first player picks first, order snakes back, host can finish at random', () => {
  let s = createBossGame(['a', 'b', 'c'], { draft: 'snake', investorsEach: 2 }, board, (n) => (n === 3 ? 1 : 0), 0)
  assert.equal(s.phase, 'draft')
  assert.equal(s.firstPlayerId, 'b')
  assert.deepEqual(s.draftOrder, ['b', 'c', 'a', 'a', 'c', 'b'])
  assert.equal(s.seats.every((x) => x.investors.length === 0), true)
  fails(s, 'a', { type: 'draft_pick', team: 'red' }, 'NOT_YOUR_TURN')
  s = ok(s, 'b', { type: 'draft_pick', team: 'red' })
  fails(s, 'c', { type: 'draft_pick', team: 'red' }, 'INVESTOR_TAKEN')
  s = ok(s, 'c', { type: 'draft_pick', team: 'blue' })
  assert.equal(projectBossView(s, 'a', board).draft.actorId, 'a')
  const done = draftRandomRest(s, zero, 0)
  assert.equal(done.ok, true)
  assert.equal(done.state.phase, 'pick_start')
  assert.equal(done.state.seats.every((x) => x.investors.length === 2), true)
  assert.equal(done.state.seats.find((x) => x.id === 'b').portrait, 'red')
})

test('slots start empty and are filled only by the boss; a bribe outside the contract must be confirmed too', () => {
  let s = table()
  s = ok(s, 'p1', { type: 'open_deal' })
  assert.equal(s.deal.totalValue, 3 * 2_000_000)
  assert.deepEqual(s.deal.slots.map((x) => x.source), [null, null], 'never auto-filled')
  fails(s, 'p2', { type: 'set_slot', slot: 1, source: { kind: 'placard', team: 'blue' } }, 'NOT_BOSS')
  fails(s, 'p1', { type: 'set_slot', slot: 0, source: { kind: 'placard', team: 'blue' } }, 'TEAM_NOT_IN_SLOT')
  s = ok(s, 'p1', { type: 'set_slot', slot: 0, source: { kind: 'placard', team: 'red' } })
  s = ok(s, 'p1', { type: 'set_slot', slot: 1, source: { kind: 'placard', team: 'blue' } })
  fails(s, 'p1', { type: 'start_closing' }, 'NO_OFFER')
  // p3 (green, not in the deal) gets 1M to stay quiet; p2 brings blue
  s = ok(s, 'p1', { type: 'submit_offer', allocation: { p1: 3_000_000, p2: 2_000_000, p3: 1_000_000 } })
  let v = projectBossView(s, 'p4', board).deal
  assert.deepEqual(v.requiredIds.sort(), ['p2', 'p3'])
  fails(s, 'p1', { type: 'start_closing' }, 'NOT_CONFIRMED')
  fails(s, 'p4', { type: 'accept_offer', version: 1 }, 'NOT_IN_OFFER')
  s = ok(s, 'p2', { type: 'accept_offer', version: v.terms.p2 })
  s = ok(s, 'p3', { type: 'accept_offer', version: v.terms.p3 })
  s = ok(s, 'p1', { type: 'start_closing' }, 2000)
  assert.equal(s.phase, 'closing')
  assert.equal(bossDeadline(s), new Date(2000 + 5000).toISOString())
  assert.equal(resolveBossDeadlines(s, board, zero, 6999).changed, false)
  s = resolveBossDeadlines(s, board, zero, 7000).state
  assert.equal(s.phase, 'turn_choice')
  assert.equal(s.turnPlayerId, 'p2')
  assert.deepEqual(s.seats.map((x) => x.cash), [3_000_000, 2_000_000, 1_000_000, 0])
  assert.deepEqual(s.lastSettlement.payouts, { p1: 3_000_000, p2: 2_000_000, p3: 1_000_000 })
  assert.equal(s.spaces[3].closedByDeal, 1)
  assert.equal(s.markerSpace, 4)
  assert.deepEqual(s.stats.p1, { deals: 1, biggest: 6_000_000, bribesPaid: 1_000_000, travels: 0, stops: 0 })
})

test('two players offer the same colour: the boss picks one, the other card is discarded anyway on close', () => {
  let s = table({ p3: [{ kind: 'team', team: 'red' }], p4: [{ kind: 'team', team: 'blue' }] })
  s = ok(s, 'p1', { type: 'open_deal' })
  s = ok(s, 'p3', { type: 'play_team', cardId: 'p3-0' })
  s = ok(s, 'p4', { type: 'play_team', cardId: 'p4-0' })
  // red from p3's card (not p1's own placard); blue from p2's placard, not p4's card
  s = ok(s, 'p1', { type: 'set_slot', slot: 0, source: { kind: 'card', cardId: 'p3-0' } })
  fails(s, 'p1', { type: 'set_slot', slot: 1, source: { kind: 'card', cardId: 'p3-0' } }, 'TEAM_NOT_IN_SLOT')
  s = ok(s, 'p1', { type: 'set_slot', slot: 1, source: { kind: 'placard', team: 'blue' } })
  // switching a slot to the other blue offer and back is fine; only one blue can be in
  s = ok(s, 'p1', { type: 'set_slot', slot: 1, source: { kind: 'card', cardId: 'p4-0' } })
  s = ok(s, 'p1', { type: 'set_slot', slot: 1, source: { kind: 'placard', team: 'blue' } })
  s = ok(s, 'p1', { type: 'submit_offer', allocation: { p1: 2_000_000, p2: 2_000_000, p3: 2_000_000 } })
  const t = projectBossView(s, 'p1', board).deal.terms
  s = ok(s, 'p2', { type: 'accept_offer', version: t.p2 })
  s = ok(s, 'p3', { type: 'accept_offer', version: t.p3 })
  s = ok(s, 'p1', { type: 'start_closing' })
  s = resolveBossDeadlines(s, board, zero, 60_000).state
  assert.equal(s.seats[3].hand.length, 0, 'the unselected blue card is discarded too')
  assert.ok(s.discard.some((c) => c.id === 'p4-0') && s.discard.some((c) => c.id === 'p3-0'))
})

test('the same colour cannot fill two slots', () => {
  let s = table({ p3: [{ kind: 'team', team: 'yellow' }] })
  s.markerSpace = 0 // yellow+purple pick 2, red/green/blue/orange pick 3
  s = ok(s, 'p1', { type: 'open_deal' })
  s = ok(s, 'p3', { type: 'play_team', cardId: 'p3-0' })
  s = ok(s, 'p1', { type: 'set_slot', slot: 0, source: { kind: 'placard', team: 'yellow' } })
  fails(s, 'p1', { type: 'set_slot', slot: 1, source: { kind: 'card', cardId: 'p3-0' } }, 'TEAM_ALREADY_IN')
})

test('one player, two colours, one payout and one confirmation; stale accepts are refused', () => {
  let s = table({ p2: [{ kind: 'team', team: 'red' }] })
  s = ok(s, 'p1', { type: 'open_deal' })
  s = ok(s, 'p2', { type: 'play_team', cardId: 'p2-0' })
  s = ok(s, 'p1', { type: 'set_slot', slot: 0, source: { kind: 'card', cardId: 'p2-0' } })
  s = ok(s, 'p1', { type: 'set_slot', slot: 1, source: { kind: 'placard', team: 'blue' } })
  s = ok(s, 'p1', { type: 'submit_offer', allocation: { p1: 2_000_000, p2: 3_000_000, p4: 1_000_000 } })
  let v = projectBossView(s, 'p2', board).deal
  assert.deepEqual(v.requiredIds.sort(), ['p2', 'p4'])
  const oldP2 = v.terms.p2
  s = ok(s, 'p2', { type: 'accept_offer', version: oldP2 })
  // the boss moves 1M from p4 to himself: p2's terms are unchanged and stay accepted, p4 must look again
  const before = v.terms.p4
  s = ok(s, 'p1', { type: 'submit_offer', allocation: { p1: 3_000_000, p2: 3_000_000 } })
  v = projectBossView(s, 'p2', board).deal
  assert.deepEqual(v.requiredIds, ['p2'])
  assert.deepEqual(v.acceptedIds, ['p2'])
  assert.equal(v.terms.p4, undefined)
  assert.ok(before)
  // now p2's payout changes: the old version is stale
  s = ok(s, 'p1', { type: 'submit_offer', allocation: { p1: 4_000_000, p2: 2_000_000 } })
  v = projectBossView(s, 'p2', board).deal
  assert.deepEqual(v.acceptedIds, [])
  fails(s, 'p2', { type: 'accept_offer', version: oldP2 }, 'STALE_OFFER')
  s = ok(s, 'p2', { type: 'accept_offer', version: v.terms.p2 })
  assert.equal(projectBossView(s, 'p4', board).deal.canClose, true)
})

test('declining keeps the offer; the boss edits and submits again; closing can be held', () => {
  let s = table()
  s = ok(s, 'p1', { type: 'open_deal' })
  s = ok(s, 'p1', { type: 'set_slot', slot: 0, source: { kind: 'placard', team: 'red' } })
  s = ok(s, 'p1', { type: 'set_slot', slot: 1, source: { kind: 'placard', team: 'blue' } })
  s = ok(s, 'p1', { type: 'submit_offer', allocation: { p1: 5_000_000, p2: 1_000_000 } })
  let v = projectBossView(s, 'p2', board).deal
  s = ok(s, 'p2', { type: 'decline_offer', version: v.terms.p2 })
  v = projectBossView(s, 'p2', board).deal
  assert.deepEqual(v.declinedIds, ['p2'])
  assert.equal(s.deal.offered, true)
  s = ok(s, 'p1', { type: 'submit_offer', allocation: { p1: 3_000_000, p2: 3_000_000 } })
  v = projectBossView(s, 'p2', board).deal
  assert.deepEqual(v.declinedIds, [])
  s = ok(s, 'p2', { type: 'accept_offer', version: v.terms.p2 })
  s = ok(s, 'p1', { type: 'start_closing' })
  s = ok(s, 'p4', { type: 'hold' })
  assert.equal(s.phase, 'negotiating')
  assert.equal(s.deal.closingDeadlineAt, null)
})

test('a failed deal returns face-up Team cards to their owners', () => {
  let s = table({ p3: [{ kind: 'team', team: 'red' }] })
  s = ok(s, 'p1', { type: 'open_deal' })
  s = ok(s, 'p3', { type: 'play_team', cardId: 'p3-0' })
  assert.equal(s.seats[2].hand.length, 0)
  s = ok(s, 'p1', { type: 'fail_deal' })
  assert.equal(s.seats[2].hand.length, 1)
})

test('travel cannot send your own investor away', () => {
  let s = table({ p2: [{ kind: 'travel', team: 'any' }] })
  s = ok(s, 'p1', { type: 'open_deal' })
  fails(s, 'p2', { type: 'play_travel', cardId: 'p2-0', targetTeam: 'blue' }, 'OWN_TEAM')
  assert.equal(s.seats.find((x) => x.id === 'p2').hand.length, 1)
  s = ok(s, 'p2', { type: 'play_travel', cardId: 'p2-0', targetTeam: 'red' })
  assert.equal(s.interrupt.targetId, 'p1')
})

test('an interrupt that removes a selected source reopens the slot and says whose it was', () => {
  let s = table({ p3: [{ kind: 'travel', team: 'blue' }, { kind: 'travel', team: 'red' }], p4: [{ kind: 'team', team: 'red' }] })
  s = ok(s, 'p1', { type: 'open_deal' })
  s = ok(s, 'p4', { type: 'play_team', cardId: 'p4-0' })
  s = ok(s, 'p1', { type: 'set_slot', slot: 0, source: { kind: 'card', cardId: 'p4-0' } })
  s = ok(s, 'p1', { type: 'set_slot', slot: 1, source: { kind: 'placard', team: 'blue' } })
  s = ok(s, 'p1', { type: 'submit_offer', allocation: { p1: 2_000_000, p2: 2_000_000, p4: 2_000_000 } })
  const t = projectBossView(s, 'p1', board).deal.terms
  s = ok(s, 'p2', { type: 'accept_offer', version: t.p2 })
  s = ok(s, 'p3', { type: 'play_travel', cardId: 'p3-0', targetTeam: 'blue' }, 1000)
  s = resolveBossDeadlines(s, board, zero, 6000).state
  assert.equal(s.deal.slots[1].source, null)
  assert.deepEqual(s.deal.slots[1].lost, { team: 'blue', ownerId: 'p2', kind: 'placard' })
  assert.equal(s.deal.slots[0].source.ownerId, 'p4', 'the other slot is untouched')
  // p2 is still paid, so still asked; their terms changed (no slot any more) and need a new look
  const v = projectBossView(s, 'p1', board).deal
  assert.deepEqual(v.acceptedIds, [])
  // travel on the selected red card
  s = ok(s, 'p3', { type: 'play_travel', cardId: 'p3-1', targetTeam: 'red', targetCardId: 'p4-0' }, 7000)
  s = resolveBossDeadlines(s, board, zero, 12_000).state
  assert.deepEqual(s.deal.slots[0].lost, { team: 'red', ownerId: 'p4', kind: 'card' })
  assert.equal(s.deal.tableCards.length, 0)
})

test('Stop is bound to its interrupt: first Stop cancels, a late or misaimed Stop keeps its card', () => {
  const hands = { p3: [{ kind: 'travel', team: 'blue' }, { kind: 'travel', team: 'any' }], p2: [{ kind: 'stop' }], p4: [{ kind: 'stop' }] }
  let s = table(hands)
  s = ok(s, 'p1', { type: 'open_deal' })
  s = ok(s, 'p3', { type: 'play_travel', cardId: 'p3-0', targetTeam: 'blue' }, 1000)
  assert.equal(s.phase, 'interrupt')
  const first = s.interrupt.id
  fails(s, 'p2', { type: 'play_stop', cardId: 'p2-0', interruptId: 'i-old' }, 'INTERRUPT_OVER')
  s = ok(s, 'p2', { type: 'play_stop', cardId: 'p2-0', interruptId: first }, 1500)
  assert.equal(s.phase, 'negotiating')
  assert.deepEqual(s.deal.blockedTeams, [])
  fails(s, 'p4', { type: 'play_stop', cardId: 'p4-0', interruptId: first }, 'INTERRUPT_OVER')
  assert.equal(s.seats.find((x) => x.id === 'p4').hand.length, 1)

  s = ok(s, 'p3', { type: 'play_travel', cardId: 'p3-1', targetTeam: 'blue' }, 2000)
  const second = s.interrupt.id
  assert.notEqual(second, first)
  assert.equal(resolveBossDeadlines(s, board, zero, 6999).changed, false)
  // arrives after the window: refused, card kept
  const late = applyBossAction(s, 'p4', { action: { type: 'play_stop', cardId: 'p4-0', interruptId: second } }, board, zero, 7000)
  assert.equal(late.ok, false)
  assert.equal(late.code, 'INTERRUPT_OVER')
  assert.equal(late.ok || s.seats.find((x) => x.id === 'p4').hand.length, 1)
  s = resolveBossDeadlines(s, board, zero, 7000).state
  assert.deepEqual(s.deal.blockedTeams, ['blue'])
  assert.equal(s.events.at(-1).cancelled, false)
})

test('Boss card takes over the deal: slots stay, the offer is the new boss\'s to make', () => {
  let s = table({ p2: [{ kind: 'boss' }] })
  s = ok(s, 'p1', { type: 'open_deal' })
  s = ok(s, 'p1', { type: 'set_slot', slot: 0, source: { kind: 'placard', team: 'red' } })
  s = ok(s, 'p1', { type: 'set_slot', slot: 1, source: { kind: 'placard', team: 'blue' } })
  s = ok(s, 'p1', { type: 'submit_offer', allocation: { p1: 4_000_000, p2: 2_000_000 } })
  s = ok(s, 'p2', { type: 'play_boss', cardId: 'p2-0' }, 1000)
  s = resolveBossDeadlines(s, board, zero, 6000).state
  assert.equal(s.deal.bossId, 'p2')
  assert.equal(s.deal.offered, false)
  assert.equal(s.deal.slots[0].source.ownerId, 'p1')
  s = ok(s, 'p2', { type: 'submit_offer', allocation: { p1: 2_000_000, p2: 4_000_000 } })
  s = ok(s, 'p1', { type: 'accept_offer', version: projectBossView(s, 'p1', board).deal.terms.p1 })
  s = ok(s, 'p2', { type: 'start_closing' }, 7000)
  s = resolveBossDeadlines(s, board, zero, 13_000).state
  assert.equal(s.turnPlayerId, 'p3', 'next turn follows the final boss')
})

test('Recruit needs three cards, takes an unowned investor first and keeps the portrait', () => {
  const r = [{ kind: 'recruit' }, { kind: 'recruit' }, { kind: 'recruit' }]
  let s = table({ p3: r })
  s.seats[2].portrait = 'green'
  s = ok(s, 'p1', { type: 'open_deal' })
  fails(s, 'p3', { type: 'play_recruit', cardIds: ['p3-0', 'p3-1', 'p3-2'], targetTeam: 'blue' }, 'RECRUIT_UNOWNED_FIRST')
  s = ok(s, 'p3', { type: 'play_recruit', cardIds: ['p3-0', 'p3-1', 'p3-2'], targetTeam: 'orange' })
  s = resolveBossDeadlines(s, board, zero, 10_000).state
  assert.deepEqual(s.seats.find((x) => x.id === 'p3').investors, ['green', 'orange'])
  assert.equal(projectBossView(s, 'p1', board).seats[2].portrait, 'green')
  assert.deepEqual(s.availableInvestors, ['purple'])
})

/** Fills space 3 with p1 red + p2 blue, pays `allocation`, confirms and closes at 60 s. */
function closeDeal(s, allocation) {
  s = ok(s, 'p1', { type: 'open_deal' })
  s = ok(s, 'p1', { type: 'set_slot', slot: 0, source: { kind: 'placard', team: 'red' } })
  s = ok(s, 'p1', { type: 'set_slot', slot: 1, source: { kind: 'placard', team: 'blue' } })
  s = ok(s, 'p1', { type: 'submit_offer', allocation })
  for (const [pid, version] of Object.entries(projectBossView(s, 'p1', board).deal.terms)) s = ok(s, pid, { type: 'accept_offer', version })
  s = ok(s, 'p1', { type: 'start_closing' })
  return resolveBossDeadlines(s, board, zero, 60_000).state
}

test('end roll from deal 10, short game skips #3 #6 #9 and the last placard ends the game; ties win together', () => {
  let s = table()
  s.dealIndex = 9 // placard 10, faces [1]; zero() rolls a 1
  s.seats[2].cash = 15_000_000
  s = closeDeal(s, { p1: 15_000_000 })
  assert.deepEqual(s.lastEndRoll, { roll: 1, ended: true, dealNumber: 10, faces: [1] })
  assert.equal(s.phase, 'game_over')
  assert.deepEqual(s.winnerIds, ['p1', 'p3'])
  const short = createBossGame(['a', 'b', 'c'], { short: true }, board, zero, 0)
  assert.deepEqual(short.placards, [1, 2, 4, 5, 7, 8, 10, 11, 12, 13, 14, 15])
})

test('dice: the roll carries every step, closed spaces included', () => {
  let s = table()
  s.spaces[4].closedByDeal = 1
  s = ok(s, 'p1', { type: 'roll_die' })
  assert.equal(s.lastRoll, 1)
  assert.deepEqual(s.events.at(-1).path, [4, 5])
  assert.equal(s.markerSpace, 5)
})

test('drawing past twelve cards forces a discard; it can be skipped at random', () => {
  let s = table({ p1: Array.from({ length: 11 }, () => ({ kind: 'recruit' })) })
  s = ok(s, 'p1', { type: 'roll_die' })
  s = ok(s, 'p1', { type: 'draw_cards' })
  assert.equal(s.phase, 'discard_limit')
  assert.deepEqual(blockingIds(s), ['p1'])
  const skipped = skipBossPlayer(s, 'p1', zero, 2000)
  assert.equal(skipped.ok, true)
  assert.equal(skipped.state.seats[0].hand.length, 12)
  assert.equal(skipped.state.turnPlayerId, 'p2')
})

test('skip and kick: boss away fails the deal, a supplier is taken out (slot reopened, payout to boss), kicked cash leaves', () => {
  let s = table({ p2: [{ kind: 'team', team: 'red' }] })
  s = ok(s, 'p1', { type: 'open_deal' })
  s = ok(s, 'p2', { type: 'play_team', cardId: 'p2-0' })
  s = ok(s, 'p1', { type: 'set_slot', slot: 0, source: { kind: 'card', cardId: 'p2-0' } })
  s = ok(s, 'p1', { type: 'set_slot', slot: 1, source: { kind: 'placard', team: 'blue' } })
  s = ok(s, 'p1', { type: 'submit_offer', allocation: { p1: 2_000_000, p2: 4_000_000 } })
  assert.deepEqual(blockingIds(s).sort(), ['p1', 'p2'])
  const out = skipBossPlayer(s, 'p2', zero, 2000)
  assert.equal(out.ok, true)
  assert.deepEqual(out.state.deal.blockedTeams, ['blue'])
  assert.equal(out.state.seats[1].hand.length, 1, 'team card back in hand')
  assert.deepEqual(out.state.deal.slots.map((x) => x.source), [null, null])
  assert.deepEqual(out.state.deal.allocation, { p1: 6_000_000 })
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

test('views hide other hands and wallets until the end; duplicates are ignored', () => {
  let s = table({ p2: [{ kind: 'stop' }] })
  s.seats[1].cash = 7_000_000
  const v = projectBossView(s, 'p1', board)
  assert.equal(v.myHand.length, 0)
  assert.equal(v.seats[1].exactCash, null)
  assert.equal(v.seats[1].cashTier, null)
  assert.equal(v.seats[1].handCount, 1)
  const r1 = applyBossAction(s, 'p1', { actionId: 'same', action: { type: 'roll_die' } }, board, zero, 1)
  const r2 = applyBossAction(r1.state, 'p1', { actionId: 'same', action: { type: 'roll_die' } }, board, zero, 2)
  assert.equal(r2.duplicate, true)
  assert.equal(r2.state.revision, r1.state.revision)
})
