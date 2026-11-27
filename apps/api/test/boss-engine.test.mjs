import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import {
  applyBossAction,
  cashTierOf,
  createBossGame,
  projectBossView,
  removeBossPlayer,
  resolveBossDeadlines,
} from '@thongyod/shared/content/boss-engine.mjs'

const require = createRequire(import.meta.url)
const board = JSON.parse(readFileSync(require.resolve('@thongyod/shared/content/boss-board.json'), 'utf8'))

const seats = ['p1', 'p2', 'p3', 'p4']

test('boss engine enforces setup, marker pick, uneven split, closing deadline and cash privacy', () => {
  let state = createBossGame(seats, { closingSeconds: 10 }, board, () => 0, 1000)
  assert.equal(state.phase, 'pick_start')
  assert.equal(state.markerChooserId, 'p4')
  assert.equal(state.turnPlayerId, 'p1')
  assert.equal(state.availableInvestors.length, 2)

  // Non-chooser cannot pick start
  const badPick = applyBossAction(state, 'p1', { action: { type: 'pick_start', spaceIndex: 0 } }, board, () => 0, 1100)
  assert.equal(badPick.ok, false)
  assert.equal(badPick.code, 'NOT_YOUR_TURN')

  const picked = applyBossAction(state, 'p4', { actionId: 'a1', action: { type: 'pick_start', spaceIndex: 0 } }, board, () => 0, 1200)
  assert.equal(picked.ok, true)
  state = picked.state
  assert.equal(state.phase, 'turn_choice')
  assert.equal(state.markerSpace, 0)

  // Duplicate actionId returns same state without advancing revision
  const dup = applyBossAction(state, 'p4', { actionId: 'a1', action: { type: 'pick_start', spaceIndex: 5 } }, board, () => 0, 1300)
  assert.equal(dup.ok, true)
  assert.equal(dup.duplicate, true)
  assert.equal(dup.state.markerSpace, 0)

  // Stale expectedRevision returns 409
  const stale = applyBossAction(state, 'p1', { expectedRevision: 0, action: { type: 'roll_die' } }, board, () => 0, 1350)
  assert.equal(stale.ok, false)
  assert.equal(stale.status, 409)
  assert.equal(stale.code, 'REVISION_CONFLICT')

  // p1 opens deal on space 0 (requires red, orange; optional yellow, green; 3 teams, 3 dividends * $1M = $3M)
  // Force seat investors for deterministic deal test
  state.seats[0].investors = ['red']
  state.seats[1].investors = ['orange']
  state.seats[2].investors = ['yellow']
  state.seats[3].investors = ['green']
  state.availableInvestors = ['blue', 'purple']

  const opened = applyBossAction(state, 'p1', { action: { type: 'open_deal' } }, board, () => 0, 1400)
  assert.equal(opened.ok, true)
  state = opened.state
  assert.equal(state.phase, 'negotiating')
  assert.equal(state.deal.totalValue, 3_000_000)

  // Uneven split smaller than $1M dividend ($500k + $1.5M + $1M = $3M)
  const alloc = { p1: 500_000, p2: 1_500_000, p3: 1_000_000 }
  const setRes = applyBossAction(state, 'p1', { action: { type: 'set_allocation', allocation: alloc } }, board, () => 0, 1500)
  assert.equal(setRes.ok, true)
  state = setRes.state

  // Cannot lock before required investors accept
  const earlyClose = applyBossAction(state, 'p1', { action: { type: 'start_closing' } }, board, () => 0, 1550)
  assert.equal(earlyClose.ok, false)

  state = applyBossAction(state, 'p2', { action: { type: 'accept_offer' } }, board, () => 0, 1600).state
  state = applyBossAction(state, 'p3', { action: { type: 'accept_offer' } }, board, () => 0, 1650).state

  const closing = applyBossAction(state, 'p1', { action: { type: 'start_closing' } }, board, () => 0, 1700)
  assert.equal(closing.ok, true)
  state = closing.state
  assert.equal(state.phase, 'closing')

  // Before deadline: does not settle
  const before = resolveBossDeadlines(state, board, () => 0, 11_000)
  assert.equal(before.changed, false)

  // At deadline (1700 + 10_000 = 11_700): settles atomically once
  const settled = resolveBossDeadlines(state, board, () => 0, 11_700)
  assert.equal(settled.changed, true)
  state = settled.state
  assert.equal(state.seats[0].cash, 500_000)
  assert.equal(state.seats[1].cash, 1_500_000)
  assert.equal(state.seats[2].cash, 1_000_000)
  assert.equal(state.spaces[0].closedByDeal, 1)
  assert.equal(state.currentDealNumber, 2)
  assert.equal(state.turnPlayerId, 'p2')

  // Privacy view hides opponent exact cash and hand before game_over
  const p2View = projectBossView(state, 'p2', board)
  assert.equal(p2View.seats[0].exactCash, null)
  assert.equal(p2View.seats[0].cashTier, 'low')
  assert.equal(p2View.seats[1].exactCash, 1_500_000)
  assert.equal(p2View.myHand.length, state.seats[1].hand.length)
})

test('interrupt chains: Boss + Stop + Stop, Travel removes exposed Team card first, Recruit takes unowned first', () => {
  let state = createBossGame(seats, { closingSeconds: 10 }, board, () => 0, 1000)
  state = applyBossAction(state, 'p4', { action: { type: 'pick_start', spaceIndex: 0 } }, board, () => 0, 1100).state
  state.seats[0].investors = ['red']
  state.seats[1].investors = ['orange']
  state.seats[2].investors = ['yellow']
  state.seats[3].investors = ['green']
  state.availableInvestors = ['blue', 'purple']

  state.seats[1].hand.push({ id: 't-green', kind: 'team', team: 'green' })
  state.seats[1].hand.push({ id: 'b-p2', kind: 'boss' })
  state.seats[2].hand.push({ id: 's-p3', kind: 'stop' })
  state.seats[3].hand.push({ id: 's-p4', kind: 'stop' })
  state.seats[2].hand.push({ id: 'tr-green', kind: 'travel', team: 'green' })
  state.seats[3].hand.push(
    { id: 'r1', kind: 'recruit' },
    { id: 'r2', kind: 'recruit' },
    { id: 'r3', kind: 'recruit' },
  )

  state = applyBossAction(state, 'p1', { action: { type: 'open_deal' } }, board, () => 0, 1200).state

  // p2 plays Boss -> p3 Stops -> p4 Stops the Stop -> Boss succeeds!
  state = applyBossAction(state, 'p2', { action: { type: 'play_boss', cardId: 'b-p2' } }, board, () => 0, 1300).state
  assert.equal(state.phase, 'interrupt')
  state = applyBossAction(state, 'p3', { action: { type: 'play_stop', cardId: 's-p3' } }, board, () => 0, 1400).state
  // Same actor cannot double-stop
  const selfStop = applyBossAction(state, 'p3', { action: { type: 'play_stop', cardId: 's-p3' } }, board, () => 0, 1450)
  assert.equal(selfStop.ok, false)

  state = applyBossAction(state, 'p4', { action: { type: 'play_stop', cardId: 's-p4' } }, board, () => 0, 1500).state
  state = resolveBossDeadlines(state, board, () => 0, 20_000).state
  assert.equal(state.phase, 'negotiating')
  assert.equal(state.deal.bossId, 'p2')

  // Recruit must pick unowned placard first
  const badRecruit = applyBossAction(state, 'p4', {
    action: { type: 'play_recruit', cardIds: ['r1', 'r2', 'r3'], targetTeam: 'red' },
  }, board, () => 0, 21_000)
  assert.equal(badRecruit.ok, false)
  assert.equal(badRecruit.code, 'RECRUIT_UNOWNED_FIRST')

  state = applyBossAction(state, 'p4', {
    action: { type: 'play_recruit', cardIds: ['r1', 'r2', 'r3'], targetTeam: 'blue' },
  }, board, () => 0, 21_100).state
  state = resolveBossDeadlines(state, board, () => 0, 35_000).state
  assert.ok(state.seats[3].investors.includes('blue'))

  // Exposed team card is removed by Travel before blocking placard
  state = applyBossAction(state, 'p2', { action: { type: 'play_team', cardId: 't-green' } }, board, () => 0, 36_000).state
  assert.equal(state.deal.tableCards.length, 1)
  state = applyBossAction(state, 'p3', { action: { type: 'play_travel', cardId: 'tr-green', targetTeam: 'green' } }, board, () => 0, 36_500).state
  state = resolveBossDeadlines(state, board, () => 0, 50_000).state
  assert.equal(state.deal.tableCards.length, 0)
  assert.equal(state.deal.blockedTeams.includes('green'), false)

  // Cash tiers + player removal safety
  assert.equal(cashTierOf(0), 'empty')
  assert.equal(cashTierOf(50_000_000), 'rich')
  const trimmed = removeBossPlayer(state, 'p1', 51_000)
  assert.equal(trimmed.seats.length, 3)
  assert.equal(trimmed.phase, 'negotiating')
})

test('deal 10 end roll ends game on matching face and reveals all cash', () => {
  let state = createBossGame(seats, { closingSeconds: 10 }, board, () => 0, 1000)
  state = applyBossAction(state, 'p4', { action: { type: 'pick_start', spaceIndex: 0 } }, board, () => 0, 1100).state
  state.currentDealNumber = 10
  state.seats[0].investors = ['red']
  state.seats[1].investors = ['orange']
  state.seats[2].investors = ['yellow']
  state.seats[3].investors = ['green']

  state = applyBossAction(state, 'p1', { action: { type: 'open_deal' } }, board, () => 0, 1200).state
  state = applyBossAction(state, 'p1', { action: { type: 'set_allocation', allocation: { p1: 4_000_000, p2: 4_000_000, p3: 4_000_000 } } }, board, () => 0, 1300).state
  state = applyBossAction(state, 'p2', { action: { type: 'accept_offer' } }, board, () => 0, 1400).state
  state = applyBossAction(state, 'p3', { action: { type: 'accept_offer' } }, board, () => 0, 1500).state
  state = applyBossAction(state, 'p1', { action: { type: 'start_closing' } }, board, () => 0, 1600).state

  // randomIndex () => 0 rolls 1, which matches deal 10's endRollFaces [1]
  state = resolveBossDeadlines(state, board, () => 0, 20_000).state
  assert.equal(state.phase, 'game_over')
  assert.equal(state.lastEndRoll.roll, 1)
  assert.equal(state.lastEndRoll.ended, true)
  const view = projectBossView(state, 'p4', board)
  assert.equal(view.seats[0].exactCash, 4_000_000)
})
