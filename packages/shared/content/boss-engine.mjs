/**
 * Authoritative I'm the Boss! state machine, shared by apps/api and the apps/web demo mocks.
 * Pure: no I/O, no clock, no Math.random. Pass randomIndex(upperBound) and nowMs.
 * Rules agreed with Earth on 2026-11-27 (docs/IM_THE_BOSS.md, DECISIONS #138):
 * - a deal starts with empty contract slots; the boss fills each one by hand with a source:
 *   an investor placard (its owner) or one face-up Team card. Nothing is ever auto-filled;
 * - the boss pays per person (bribes to anyone allowed); every supplier and every paid player confirms
 *   the exact terms they were shown (terms carry a version; a stale accept is refused);
 *   when the boss changes something only the people whose own terms changed confirm again;
 * - Travel, Boss and Recruit wait 5 s for a Stop bound to that interrupt; the first Stop cancels them;
 *   a source taken away reopens its slot and records whose contribution was lost;
 * - the boss closes; the table then has 5 s to object or interrupt; any change sends it back to talks;
 * - a failed deal returns face-up Team cards to their owners; a closed deal discards all of them;
 * - investors per player and random/snake-draft assignment are lobby settings;
 * - an offline player holding the game up can be skipped by anyone seated; the host can remove a player.
 */

export const TEAMS = /** @type {const} */ (['red', 'orange', 'yellow', 'green', 'blue', 'purple'])
export const HAND_LIMIT = 12
export const START_HAND = 5
export const STOP_WINDOW_MS = 5_000
export const CLOSING_MS = 5_000
const SHORT_SKIP = new Set([3, 6, 9])

/** @param {number} cash */
export function cashTierOf(cash) {
  if (cash <= 0) return 'empty'
  if (cash < 10_000_000) return 'low'
  if (cash < 25_000_000) return 'mid'
  if (cash < 50_000_000) return 'high'
  return 'rich'
}

/** Valid investors-per-player counts for a table size (six unique investors). */
export function investorChoices(players) {
  return Array.from({ length: Math.max(1, Math.floor(TEAMS.length / players)) }, (_, i) => i + 1)
}
/** Two each for three players, one each for four to six. */
export function defaultInvestorsEach(players) {
  return players === 3 ? 2 : 1
}

function shuffled(items, randomIndex) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** 98 influence cards: 4 team + 3 travel per team, 3 wild travel, 33 recruit, 10 boss, 10 stop. */
export function buildDeck() {
  const deck = []
  let seq = 1
  const push = (card) => deck.push({ id: `c${seq++}`, ...card })
  for (const team of TEAMS) {
    for (let i = 0; i < 4; i++) push({ kind: 'team', team })
    for (let i = 0; i < 3; i++) push({ kind: 'travel', team })
  }
  for (let i = 0; i < 3; i++) push({ kind: 'travel', team: 'any' })
  for (let i = 0; i < 33; i++) push({ kind: 'recruit' })
  for (let i = 0; i < 10; i++) {
    push({ kind: 'boss' })
    push({ kind: 'stop' })
  }
  return deck
}

const iso = (ms) => new Date(ms).toISOString()
const seatOf = (state, id) => state.seats.find((s) => s.id === id)
/** Every team printed on a space (all its columns). */
export const spaceTeams = (space) => space.groups.flatMap((g) => g.teams)

function nextSeatId(state, fromId) {
  const idx = state.seats.findIndex((s) => s.id === fromId)
  if (idx === -1) return state.seats[0]?.id ?? fromId
  return state.seats[(idx + 1) % state.seats.length].id
}

function closedSetOf(state) {
  return new Set(state.spaces.filter((s) => s.closedByDeal !== null).map((s) => s.index))
}

function advanceMarker(position, steps, closed) {
  if (closed.size >= 16) return position
  let pos = position
  for (let left = steps; left > 0;) {
    pos = (pos + 1) % 16
    if (!closed.has(pos)) left--
  }
  return pos
}

function drawFromDeck(state, count, randomIndex) {
  const drawn = []
  for (let i = 0; i < count; i++) {
    if (state.deck.length === 0) {
      if (state.discard.length === 0) break
      state.deck = shuffled(state.discard, randomIndex)
      state.discard = []
    }
    drawn.push(state.deck.shift())
  }
  return drawn
}

function addEvent(state, kind, actorId, nowMs, extra = {}) {
  state.revision += 1
  state.events.push({ id: `e${state.revision}`, revision: state.revision, kind, actorId, createdAt: iso(nowMs), ...extra })
  if (state.events.length > 24) state.events = state.events.slice(-24)
}

function computeWinners(seats) {
  if (!seats.length) return []
  const best = Math.max(...seats.map((s) => s.cash))
  return seats.filter((s) => s.cash === best).map((s) => s.id)
}

function placardOf(board, number) {
  return board.dealPlacards.find((p) => p.number === number) ?? null
}

/** Team -> seat IDs who could supply it now (placard owner unless sent away, plus face-up Team cards). */
export function activeTeamProviders(state) {
  const deal = state.deal
  const providers = {}
  if (!deal) return providers
  const space = state.spaces[deal.spaceIndex]
  const blocked = new Set(deal.blockedTeams)
  for (const team of spaceTeams(space)) {
    const ids = new Set()
    if (!blocked.has(team)) {
      const owner = state.seats.find((s) => s.investors.includes(team))
      if (owner) ids.add(owner.id)
    }
    for (const tc of deal.tableCards) if (tc.team === team) ids.add(tc.ownerId)
    if (ids.size) providers[team] = [...ids]
  }
  return providers
}

/** Empty slots for a space: one per investor the space needs, grouped by column. */
function emptySlots(space) {
  return space.groups.flatMap((g, group) => Array.from({ length: g.pick }, () => ({ group, source: null, lost: null })))
}

/** Seats supplying a selected slot. */
function supplierIds(deal) {
  return [...new Set(deal.slots.filter((x) => x.source).map((x) => x.source.ownerId))]
}

/** The boss plus everyone supplying a slot. */
export function contributorIds(state) {
  if (!state.deal) return []
  return [...new Set([state.deal.bossId, ...supplierIds(state.deal)])]
}

/** Who must confirm the current offer: every supplier and every paid player, except the boss. */
export function requiredIds(state) {
  const deal = state.deal
  if (!deal?.offered) return []
  const ids = new Set(supplierIds(deal))
  for (const [id, amount] of Object.entries(deal.allocation)) if (amount > 0) ids.add(id)
  ids.delete(deal.bossId)
  return [...ids]
}

/** What one person is asked to agree to: their payout and the sources they supply. */
function termsKey(deal, id) {
  const sources = deal.slots.filter((x) => x.source?.ownerId === id).map((x) => `${x.source.kind}:${x.source.team}:${x.source.cardId ?? ''}`).sort()
  return JSON.stringify([deal.allocation[id] ?? 0, sources])
}

/** Re-versions the terms of everyone whose own terms changed; their old confirmation no longer counts. */
function refreshTerms(state) {
  const deal = state.deal
  if (!deal) return
  const need = new Set(requiredIds(state))
  for (const id of Object.keys(deal.terms)) if (!need.has(id)) { delete deal.terms[id]; delete deal.accepted[id]; delete deal.declined[id] }
  for (const id of need) {
    const key = termsKey(deal, id)
    if (deal.terms[id]?.key !== key) {
      deal.version += 1
      deal.terms[id] = { key, version: deal.version }
      delete deal.accepted[id]
      delete deal.declined[id]
    }
  }
}

const acceptedNow = (deal, id) => deal.terms[id] !== undefined && deal.accepted[id] === deal.terms[id].version
const declinedNow = (deal, id) => deal.terms[id] !== undefined && deal.declined[id] === deal.terms[id].version

export function canCloseDeal(state) {
  const deal = state.deal
  if (!deal) return { ok: false, reason: 'NO_DEAL' }
  const amounts = Object.values(deal.allocation)
  if (!deal.offered || amounts.reduce((a, b) => a + b, 0) !== deal.totalValue) return { ok: false, reason: 'NO_OFFER' }
  for (const id of Object.keys(deal.allocation)) if (!seatOf(state, id)) return { ok: false, reason: 'BAD_RECIPIENT' }
  if (deal.slots.some((x) => !x.source)) return { ok: false, reason: 'EMPTY_SLOTS' }
  if (requiredIds(state).some((id) => !acceptedNow(deal, id))) return { ok: false, reason: 'NOT_CONFIRMED' }
  return { ok: true }
}

function backToTalks(state) {
  if (!state.deal) return
  state.deal.closingDeadlineAt = null
  if (state.phase === 'closing') state.phase = 'negotiating'
}

/** Empties the slots a removed source filled, noting whose contribution was lost. */
function reopenSlots(deal, test) {
  for (const slot of deal.slots) {
    if (slot.source && test(slot.source)) {
      slot.lost = { team: slot.source.team, ownerId: slot.source.ownerId, kind: slot.source.kind }
      slot.source = null
    }
  }
}

function returnTableCards(state, onlyOwnerId) {
  const deal = state.deal
  if (onlyOwnerId) reopenSlots(deal, (src) => src.kind === 'card' && src.ownerId === onlyOwnerId)
  const keep = []
  for (const tc of deal.tableCards) {
    if (onlyOwnerId && tc.ownerId !== onlyOwnerId) { keep.push(tc); continue }
    const owner = seatOf(state, tc.ownerId)
    if (owner) owner.hand.push({ id: tc.id, kind: 'team', team: tc.team })
    else state.discard.push({ id: tc.id, kind: 'team', team: tc.team })
  }
  deal.tableCards = keep
}

function endTurn(state, actorId, nextTurn) {
  const seat = seatOf(state, actorId)
  if (seat && seat.hand.length > HAND_LIMIT) {
    state.phase = 'discard_limit'
    state.discardActorId = actorId
    state.discardNextTurnId = nextTurn
  } else {
    state.turnPlayerId = nextTurn
    state.phase = 'turn_choice'
  }
}

function failDeal(state, nowMs) {
  const bossId = state.deal.bossId
  returnTableCards(state)
  const dealNumber = state.deal.dealNumber
  state.deal = null
  state.interrupt = null
  addEvent(state, 'deal_failed', bossId, nowMs, { dealNumber })
  endTurn(state, bossId, nextSeatId(state, bossId))
}

function finish(state, actorId, nowMs, dealNumber) {
  state.phase = 'game_over'
  state.deal = null
  state.interrupt = null
  state.winnerIds = computeWinners(state.seats)
  addEvent(state, 'game_ended', actorId, nowMs, { dealNumber })
}

function settleDeal(state, board, randomIndex, nowMs) {
  const deal = state.deal
  const payouts = {}
  for (const [id, amount] of Object.entries(deal.allocation)) {
    const seat = seatOf(state, id)
    if (seat && amount > 0) { seat.cash += amount; payouts[id] = amount }
  }
  for (const tc of deal.tableCards) state.discard.push({ id: tc.id, kind: 'team', team: tc.team })
  const space = state.spaces[deal.spaceIndex]
  space.closedByDeal = deal.dealNumber
  space.closedByBossId = deal.bossId
  space.closedValue = deal.totalValue
  const { bossId, dealNumber, totalValue, spaceIndex } = deal
  // Fun facts for the end screen.
  const contributors = new Set(contributorIds(state))
  const suppliers = supplierIds(deal)
  const st = (id) => (state.stats[id] ??= { deals: 0, biggest: 0, bribesPaid: 0, travels: 0, stops: 0 })
  st(bossId).deals += 1
  st(bossId).biggest = Math.max(st(bossId).biggest, totalValue)
  for (const [id, amount] of Object.entries(payouts)) if (id !== bossId && !contributors.has(id)) st(bossId).bribesPaid += amount
  state.deal = null
  state.lastSettlement = { dealNumber, spaceIndex, bossId, totalValue, payouts, suppliers }
  addEvent(state, 'deal_settled', bossId, nowMs, { dealNumber, amount: totalValue, spaceIndex, ids: suppliers })

  state.dealIndex += 1
  const isLast = state.dealIndex >= state.placards.length
  if (!isLast) {
    const faces = placardOf(board, dealNumber)?.endRollFaces ?? []
    if (faces.length) {
      const roll = randomIndex(6) + 1
      const ended = faces.includes(roll)
      state.lastEndRoll = { roll, ended, dealNumber, faces }
      addEvent(state, 'end_roll', bossId, nowMs, { roll, dealNumber, cancelled: !ended })
      if (ended) return finish(state, bossId, nowMs, dealNumber)
    }
  }
  if (isLast) return finish(state, bossId, nowMs, dealNumber)
  const closed = closedSetOf(state)
  if (state.markerSpace !== null) state.markerSpace = advanceMarker(state.markerSpace, 1, closed)
  state.turnPlayerId = nextSeatId(state, bossId)
  state.phase = 'turn_choice'
}

function resolveInterrupt(state, nowMs) {
  const intr = state.interrupt
  const deal = state.deal
  state.interrupt = null
  if (!intr || !deal) return
  state.phase = 'negotiating'
  deal.closingDeadlineAt = null
  if (!intr.stoppedBy) {
    if (intr.kind === 'boss') {
      // The new boss makes their own offer; the slots on the table stay as they are.
      deal.bossId = intr.actorId
      deal.allocation = {}
      deal.offered = false
    } else if (intr.kind === 'travel') {
      const cardIdx = deal.tableCards.findIndex((c) => c.team === intr.targetTeam && (!intr.targetCardId || c.id === intr.targetCardId))
      if (intr.targetCardId && cardIdx !== -1) {
        const [removed] = deal.tableCards.splice(cardIdx, 1)
        state.discard.push({ id: removed.id, kind: 'team', team: removed.team })
        reopenSlots(deal, (src) => src.cardId === removed.id)
      } else if (!deal.blockedTeams.includes(intr.targetTeam)) {
        deal.blockedTeams.push(intr.targetTeam)
        reopenSlots(deal, (src) => src.kind === 'placard' && src.team === intr.targetTeam)
      }
    } else if (intr.kind === 'recruit') {
      const avail = state.availableInvestors.indexOf(intr.targetTeam)
      if (avail !== -1) state.availableInvestors.splice(avail, 1)
      else for (const s of state.seats) {
        const i = s.investors.indexOf(intr.targetTeam)
        if (i !== -1) s.investors.splice(i, 1)
      }
      const actor = seatOf(state, intr.actorId)
      if (actor && !actor.investors.includes(intr.targetTeam)) actor.investors.push(intr.targetTeam)
      // The placard changed hands: whoever offered it no longer can.
      reopenSlots(deal, (src) => src.kind === 'placard' && src.team === intr.targetTeam && src.ownerId !== intr.actorId)
    }
    refreshTerms(state)
  }
  addEvent(state, 'interrupt_resolved', intr.actorId, nowMs, { team: intr.targetTeam, cancelled: Boolean(intr.stoppedBy), targetId: intr.stoppedBy ?? undefined })
}

/** Snake order: first player clockwise, then back, `rounds` times. */
function snakeOrder(seatIds, firstIndex, rounds) {
  const clockwise = seatIds.map((_, i) => seatIds[(firstIndex + i) % seatIds.length])
  const order = []
  for (let r = 0; r < rounds; r++) order.push(...(r % 2 ? [...clockwise].reverse() : clockwise))
  return order
}

/**
 * @param {readonly string[]} seatIds turn order
 * @param {{short?: boolean, investorsEach?: number, draft?: 'random' | 'snake'}} [rawSettings]
 */
export function createBossGame(seatIds, rawSettings, board, randomIndex, nowMs = Date.now()) {
  if (seatIds.length < 3 || seatIds.length > 6 || new Set(seatIds).size !== seatIds.length) {
    throw new RangeError('Expected three to six distinct seats')
  }
  const short = rawSettings?.short === true
  const each = investorChoices(seatIds.length).includes(rawSettings?.investorsEach) ? rawSettings.investorsEach : defaultInvestorsEach(seatIds.length)
  const draft = rawSettings?.draft === 'snake' ? 'snake' : 'random'
  const availableInvestors = shuffled([...TEAMS], randomIndex)
  const deck = shuffled(buildDeck(), randomIndex)
  const seats = seatIds.map((id) => {
    const investors = draft === 'random' ? availableInvestors.splice(0, each) : []
    return { id, investors, portrait: investors[0] ?? null, cash: 0, hand: deck.splice(0, START_HAND) }
  })
  const first = randomIndex(seats.length)
  const firstPlayerId = seats[first].id
  // The player on the starting player's right (the one before them in turn order) picks the start space.
  const markerChooserId = seats[(first + seats.length - 1) % seats.length].id
  return {
    revision: 1,
    phase: draft === 'snake' ? 'draft' : 'pick_start',
    settings: { short, investorsEach: each, draft },
    draftOrder: draft === 'snake' ? snakeOrder(seatIds, first, each) : [],
    draftIndex: 0,
    placards: board.dealPlacards.map((p) => p.number).filter((n) => !short || !SHORT_SKIP.has(n)),
    dealIndex: 0,
    firstPlayerId,
    turnPlayerId: firstPlayerId,
    markerChooserId,
    markerSpace: null,
    lastRoll: null,
    deck,
    discard: [],
    availableInvestors,
    spaces: board.spaces.map((s) => ({ ...s, closedByDeal: null, closedByBossId: null, closedValue: null })),
    seats,
    deal: null,
    interrupt: null,
    lastEndRoll: null,
    lastSettlement: null,
    stats: {},
    discardActorId: null,
    discardNextTurnId: null,
    processedActionIds: [],
    winnerIds: [],
    events: [{ id: 'e1', revision: 1, kind: 'game_started', actorId: firstPlayerId, targetId: markerChooserId, createdAt: iso(nowMs) }],
  }
}

/** One draft pick (the drafter's own choice, or a random one for a skipped player or "random the rest"). */
function draftPick(state, team, nowMs) {
  const actorId = state.draftOrder[state.draftIndex]
  const seat = seatOf(state, actorId)
  state.availableInvestors.splice(state.availableInvestors.indexOf(team), 1)
  if (seat) {
    seat.investors.push(team)
    seat.portrait ??= team
  }
  state.draftIndex += 1
  addEvent(state, 'investor_drafted', actorId, nowMs, { team })
  if (state.draftIndex >= state.draftOrder.length) state.phase = 'pick_start'
}

/** Host: finish the draft at random. */
export function draftRandomRest(inputState, randomIndex, nowMs = Date.now()) {
  const state = structuredClone(inputState)
  if (state.phase !== 'draft') return { ok: false, status: 409, code: 'INVALID_PHASE' }
  while (state.phase === 'draft') draftPick(state, state.availableInvestors[randomIndex(state.availableInvestors.length)], nowMs)
  return { ok: true, state }
}

/** Earliest moment the state changes on its own, or null. */
export function bossDeadline(state) {
  if (state.phase === 'interrupt' && state.interrupt) return state.interrupt.deadlineAt
  if (state.phase === 'closing' && state.deal?.closingDeadlineAt) return state.deal.closingDeadlineAt
  return null
}

export function resolveBossDeadlines(inputState, board, randomIndex, nowMs = Date.now()) {
  const state = structuredClone(inputState)
  state.stats ??= {} // games started before stats existed
  let changed = false
  if (state.phase === 'interrupt' && state.interrupt && nowMs >= Date.parse(state.interrupt.deadlineAt)) {
    resolveInterrupt(state, nowMs)
    changed = true
  }
  if (state.phase === 'closing' && state.deal?.closingDeadlineAt && nowMs >= Date.parse(state.deal.closingDeadlineAt)) {
    if (canCloseDeal(state).ok) settleDeal(state, board, randomIndex, nowMs)
    else backToTalks(state)
    changed = true
  }
  return { state, changed }
}

const err = (status, code) => ({ ok: false, status, code })
const isMoney = (n) => Number.isInteger(n) && n >= 0 && n <= 1_000_000_000

function openInterrupt(state, kind, actorId, nowMs, extra) {
  state.phase = 'interrupt'
  state.deal.closingDeadlineAt = null
  state.interrupt = { id: `i${state.revision + 1}`, kind, actorId, stoppedBy: null, deadlineAt: iso(nowMs + STOP_WINDOW_MS), ...extra }
}

export function applyBossAction(inputState, actorId, request, board, randomIndex, nowMs = Date.now()) {
  const { state } = resolveBossDeadlines(inputState, board, randomIndex, nowMs)
  const actionId = typeof request?.actionId === 'string' && request.actionId.length <= 64 ? request.actionId : undefined
  if (actionId && state.processedActionIds.includes(actionId)) return { ok: true, state, duplicate: true }
  const seat = seatOf(state, actorId)
  if (!seat) return err(403, 'NOT_IN_GAME')
  if (state.phase === 'game_over') return err(409, 'GAME_OVER')
  const a = request?.action
  if (!a || typeof a !== 'object' || typeof a.type !== 'string') return err(400, 'INVALID_REQUEST')
  const result = act(state, seat, a, board, randomIndex, nowMs)
  if (result) return result
  if (actionId) {
    state.processedActionIds.push(actionId)
    if (state.processedActionIds.length > 64) state.processedActionIds = state.processedActionIds.slice(-64)
  }
  return { ok: true, state }
}

/** Mutates state; returns an error object or undefined on success. */
function act(state, seat, a, board, randomIndex, nowMs) {
  const actorId = seat.id
  const deal = state.deal
  const talking = (state.phase === 'negotiating' || state.phase === 'closing') && deal

  switch (a.type) {
    case 'draft_pick': {
      if (state.phase !== 'draft') return err(409, 'INVALID_PHASE')
      if (actorId !== state.draftOrder[state.draftIndex]) return err(403, 'NOT_YOUR_TURN')
      if (!state.availableInvestors.includes(a.team)) return err(400, 'INVESTOR_TAKEN')
      draftPick(state, a.team, nowMs)
      return
    }
    case 'pick_start': {
      if (state.phase !== 'pick_start') return err(409, 'INVALID_PHASE')
      if (actorId !== state.markerChooserId) return err(403, 'NOT_YOUR_TURN')
      if (!Number.isInteger(a.spaceIndex) || a.spaceIndex < 0 || a.spaceIndex > 15) return err(400, 'INVALID_REQUEST')
      state.markerSpace = a.spaceIndex
      state.phase = 'turn_choice'
      state.turnPlayerId = state.firstPlayerId
      addEvent(state, 'marker_placed', actorId, nowMs, { spaceIndex: a.spaceIndex })
      return
    }
    case 'roll_die': {
      if (state.phase !== 'turn_choice') return err(409, 'INVALID_PHASE')
      if (actorId !== state.turnPlayerId) return err(403, 'NOT_YOUR_TURN')
      const roll = randomIndex(6) + 1
      const from = state.markerSpace ?? 0
      state.lastRoll = roll
      const closed = closedSetOf(state)
      const path = []
      for (let pos = from, left = roll; left > 0 && closed.size < 16;) {
        pos = (pos + 1) % 16
        path.push(pos)
        if (!closed.has(pos)) left--
      }
      state.markerSpace = advanceMarker(from, roll, closed)
      state.phase = 'rolled_choice'
      addEvent(state, 'dice_rolled', actorId, nowMs, { roll, spaceIndex: state.markerSpace, fromSpace: from, path })
      return
    }
    case 'draw_cards': {
      if (state.phase !== 'rolled_choice') return err(409, 'INVALID_PHASE')
      if (actorId !== state.turnPlayerId) return err(403, 'NOT_YOUR_TURN')
      const drawn = drawFromDeck(state, 3, randomIndex)
      seat.hand.push(...drawn)
      addEvent(state, 'drew_cards', actorId, nowMs, { amount: drawn.length })
      endTurn(state, actorId, nextSeatId(state, actorId))
      return
    }
    case 'open_deal': {
      if (state.phase !== 'turn_choice' && state.phase !== 'rolled_choice') return err(409, 'INVALID_PHASE')
      if (actorId !== state.turnPlayerId) return err(403, 'NOT_YOUR_TURN')
      const spaceIndex = state.markerSpace ?? 0
      const space = state.spaces[spaceIndex]
      const dealNumber = state.placards[state.dealIndex]
      const placard = placardOf(board, dealNumber)
      if (!space || space.closedByDeal !== null || !placard) return err(409, 'SPACE_CLOSED')
      state.deal = {
        id: `d${dealNumber}-${state.revision + 1}`,
        spaceIndex,
        dealNumber,
        totalValue: space.dividends * placard.shareValue,
        bossId: actorId,
        blockedTeams: [],
        tableCards: [],
        slots: emptySlots(space),
        allocation: {},
        offered: false,
        version: 0,
        terms: {},
        accepted: {},
        declined: {},
        closingDeadlineAt: null,
      }
      state.phase = 'negotiating'
      addEvent(state, 'deal_opened', actorId, nowMs, { dealNumber, spaceIndex, amount: state.deal.totalValue })
      return
    }
    case 'set_slot': {
      if (!talking) return err(409, 'INVALID_PHASE')
      if (actorId !== deal.bossId) return err(403, 'NOT_BOSS')
      const slot = Number.isInteger(a.slot) ? deal.slots[a.slot] : undefined
      if (!slot) return err(400, 'INVALID_REQUEST')
      const src = a.source
      if (src === null) {
        slot.source = null
      } else {
        if (!src || typeof src !== 'object') return err(400, 'INVALID_REQUEST')
        const group = state.spaces[deal.spaceIndex].groups[slot.group]
        let next
        if (src.kind === 'placard') {
          if (!group.teams.includes(src.team)) return err(400, 'TEAM_NOT_IN_SLOT')
          const owner = state.seats.find((x) => x.investors.includes(src.team))
          if (!owner || deal.blockedTeams.includes(src.team)) return err(400, 'TARGET_NOT_ACTIVE')
          next = { kind: 'placard', team: src.team, ownerId: owner.id }
        } else if (src.kind === 'card') {
          const tc = deal.tableCards.find((c) => c.id === src.cardId)
          if (!tc) return err(400, 'TARGET_NOT_ACTIVE')
          if (!group.teams.includes(tc.team)) return err(400, 'TEAM_NOT_IN_SLOT')
          next = { kind: 'card', team: tc.team, ownerId: tc.ownerId, cardId: tc.id }
        } else return err(400, 'INVALID_REQUEST')
        // Each investor colour counts once in a deal.
        if (deal.slots.some((x) => x !== slot && x.source?.team === next.team)) return err(409, 'TEAM_ALREADY_IN')
        slot.source = next
      }
      slot.lost = null
      refreshTerms(state)
      backToTalks(state)
      addEvent(state, 'slot_set', actorId, nowMs, { team: slot.source?.team, targetId: slot.source?.ownerId, slot: a.slot })
      return
    }
    case 'submit_offer': {
      if (!talking) return err(409, 'INVALID_PHASE')
      if (actorId !== deal.bossId) return err(403, 'NOT_BOSS')
      if (!a.allocation || typeof a.allocation !== 'object' || Array.isArray(a.allocation)) return err(400, 'INVALID_REQUEST')
      const next = {}
      let sum = 0
      for (const [id, amount] of Object.entries(a.allocation)) {
        if (!seatOf(state, id) || !isMoney(amount)) return err(400, 'INVALID_ALLOCATION')
        if (amount > 0) next[id] = amount
        sum += amount
      }
      if (sum !== deal.totalValue) return err(400, 'INVALID_ALLOCATION_TOTAL')
      deal.allocation = next
      deal.offered = true
      refreshTerms(state)
      backToTalks(state)
      addEvent(state, 'offer_updated', actorId, nowMs, { amount: deal.totalValue })
      return
    }
    case 'accept_offer':
    case 'decline_offer': {
      if (!talking) return err(409, 'INVALID_PHASE')
      if (!deal.offered) return err(409, 'NO_OFFER')
      if (actorId === deal.bossId) return err(400, 'ALREADY_BOSS')
      const terms = deal.terms[actorId]
      if (!terms) return err(403, 'NOT_IN_OFFER')
      // Bound to the exact terms the player saw: a change in between must be read again.
      if (a.version !== terms.version) return err(409, 'STALE_OFFER')
      const accept = a.type === 'accept_offer'
      delete deal.accepted[actorId]
      delete deal.declined[actorId]
      ;(accept ? deal.accepted : deal.declined)[actorId] = terms.version
      if (!accept) backToTalks(state)
      addEvent(state, accept ? 'offer_accepted' : 'offer_declined', actorId, nowMs)
      return
    }
    case 'start_closing': {
      if (state.phase !== 'negotiating' || !deal) return err(409, 'INVALID_PHASE')
      if (actorId !== deal.bossId) return err(403, 'NOT_BOSS')
      const check = canCloseDeal(state)
      if (!check.ok) return err(409, check.reason)
      state.phase = 'closing'
      deal.closingDeadlineAt = iso(nowMs + CLOSING_MS)
      addEvent(state, 'deal_closing', actorId, nowMs, { dealNumber: deal.dealNumber })
      return
    }
    case 'hold': {
      if (state.phase !== 'closing' || !deal) return err(409, 'INVALID_PHASE')
      backToTalks(state)
      addEvent(state, 'deal_held', actorId, nowMs)
      return
    }
    case 'fail_deal': {
      if (!talking) return err(409, 'INVALID_PHASE')
      if (actorId !== deal.bossId) return err(403, 'NOT_BOSS')
      failDeal(state, nowMs)
      return
    }
    case 'play_team': {
      if (!talking) return err(409, 'INVALID_PHASE')
      const idx = seat.hand.findIndex((c) => c.id === a.cardId && c.kind === 'team')
      if (idx === -1) return err(400, 'CARD_NOT_FOUND')
      const card = seat.hand[idx]
      const space = state.spaces[deal.spaceIndex]
      if (!spaceTeams(space).includes(card.team)) return err(400, 'TEAM_NOT_IN_DEAL')
      seat.hand.splice(idx, 1)
      deal.tableCards.push({ id: card.id, ownerId: actorId, team: card.team })
      backToTalks(state)
      addEvent(state, 'team_played', actorId, nowMs, { team: card.team })
      return
    }
    case 'play_boss': {
      if (!talking) return err(409, 'INVALID_PHASE')
      if (actorId === deal.bossId) return err(400, 'ALREADY_BOSS')
      const idx = seat.hand.findIndex((c) => c.id === a.cardId && c.kind === 'boss')
      if (idx === -1) return err(400, 'CARD_NOT_FOUND')
      state.discard.push(...seat.hand.splice(idx, 1))
      openInterrupt(state, 'boss', actorId, nowMs, { targetId: deal.bossId })
      addEvent(state, 'boss_played', actorId, nowMs, { targetId: deal.bossId })
      return
    }
    case 'play_travel': {
      if (!talking) return err(409, 'INVALID_PHASE')
      if (!TEAMS.includes(a.targetTeam)) return err(400, 'INVALID_REQUEST')
      const idx = seat.hand.findIndex((c) => c.id === a.cardId && c.kind === 'travel')
      if (idx === -1) return err(400, 'CARD_NOT_FOUND')
      const card = seat.hand[idx]
      if (card.team !== 'any' && card.team !== a.targetTeam) return err(400, 'WRONG_TEAM')
      const space = state.spaces[deal.spaceIndex]
      if (!spaceTeams(space).includes(a.targetTeam)) return err(400, 'TEAM_NOT_IN_DEAL')
      let targetCardId = null
      if (a.targetCardId !== undefined) {
        const tc = deal.tableCards.find((c) => c.id === a.targetCardId && c.team === a.targetTeam)
        if (!tc) return err(400, 'TARGET_NOT_ACTIVE')
        targetCardId = tc.id
      } else {
        const placardActive = !deal.blockedTeams.includes(a.targetTeam) && state.seats.some((s) => s.investors.includes(a.targetTeam))
        if (!placardActive) return err(400, 'TARGET_NOT_ACTIVE')
      }
      const owner = targetCardId ? deal.tableCards.find((c) => c.id === targetCardId).ownerId : state.seats.find((s) => s.investors.includes(a.targetTeam))?.id
      // You can't send your own investor (or your own team card) away.
      if (owner === actorId) return err(400, 'OWN_TEAM')
      state.discard.push(...seat.hand.splice(idx, 1))
      openInterrupt(state, 'travel', actorId, nowMs, { targetTeam: a.targetTeam, targetCardId, targetId: owner ?? null })
      ;(state.stats[actorId] ??= { deals: 0, biggest: 0, bribesPaid: 0, travels: 0, stops: 0 }).travels += 1
      addEvent(state, 'travel_played', actorId, nowMs, { team: a.targetTeam, targetId: owner })
      return
    }
    case 'play_recruit': {
      if (!talking) return err(409, 'INVALID_PHASE')
      if (!Array.isArray(a.cardIds) || a.cardIds.length !== 3 || new Set(a.cardIds).size !== 3) return err(400, 'NEED_THREE_RECRUIT')
      if (!TEAMS.includes(a.targetTeam)) return err(400, 'INVALID_REQUEST')
      if (a.cardIds.some((id) => !seat.hand.some((c) => c.id === id && c.kind === 'recruit'))) return err(400, 'CARD_NOT_FOUND')
      const unowned = state.availableInvestors.includes(a.targetTeam)
      if (state.availableInvestors.length > 0 && !unowned) return err(400, 'RECRUIT_UNOWNED_FIRST')
      const owner = state.seats.find((s) => s.investors.includes(a.targetTeam))
      if (!unowned && (!owner || owner.id === actorId)) return err(400, 'INVALID_TARGET')
      const picked = new Set(a.cardIds)
      state.discard.push(...seat.hand.filter((c) => picked.has(c.id)))
      seat.hand = seat.hand.filter((c) => !picked.has(c.id))
      openInterrupt(state, 'recruit', actorId, nowMs, { targetTeam: a.targetTeam, targetId: owner?.id ?? null })
      addEvent(state, 'recruit_played', actorId, nowMs, { team: a.targetTeam, targetId: owner?.id })
      return
    }
    case 'play_stop': {
      // Bound to one interrupt: too late or aimed at another one, the Stop stays in the hand.
      if (state.phase !== 'interrupt' || !state.interrupt) return err(409, 'INTERRUPT_OVER')
      if (a.interruptId !== state.interrupt.id) return err(409, 'INTERRUPT_OVER')
      if (state.interrupt.stoppedBy) return err(409, 'ALREADY_STOPPED')
      if (actorId === state.interrupt.actorId) return err(400, 'CANNOT_STOP_SELF')
      const idx = seat.hand.findIndex((c) => c.id === a.cardId && c.kind === 'stop')
      if (idx === -1) return err(400, 'CARD_NOT_FOUND')
      state.discard.push(...seat.hand.splice(idx, 1))
      state.interrupt.stoppedBy = actorId
      ;(state.stats[actorId] ??= { deals: 0, biggest: 0, bribesPaid: 0, travels: 0, stops: 0 }).stops += 1
      addEvent(state, 'stop_played', actorId, nowMs, { targetId: state.interrupt.actorId })
      resolveInterrupt(state, nowMs)
      return
    }
    case 'discard_cards': {
      if (state.phase !== 'discard_limit' || actorId !== state.discardActorId) return err(409, 'INVALID_PHASE')
      if (!Array.isArray(a.cardIds) || new Set(a.cardIds).size !== a.cardIds.length) return err(400, 'INVALID_REQUEST')
      if (seat.hand.length - a.cardIds.length !== HAND_LIMIT) return err(400, 'MUST_KEEP_TWELVE')
      const drop = new Set(a.cardIds)
      if (seat.hand.filter((c) => drop.has(c.id)).length !== a.cardIds.length) return err(400, 'CARD_NOT_FOUND')
      discardTo(state, seat, drop)
      addEvent(state, 'cards_discarded', actorId, nowMs, { amount: a.cardIds.length })
      return
    }
    default:
      return err(400, 'INVALID_REQUEST')
  }
}

function discardTo(state, seat, dropIds) {
  state.discard.push(...seat.hand.filter((c) => dropIds.has(c.id)))
  seat.hand = seat.hand.filter((c) => !dropIds.has(c.id))
  state.turnPlayerId = state.discardNextTurnId ?? nextSeatId(state, seat.id)
  state.discardActorId = null
  state.discardNextTurnId = null
  state.phase = 'turn_choice'
}

/** Who the game is waiting on right now (for the host's "skip" decision). */
export function blockingIds(state) {
  const ids = new Set()
  if (state.phase === 'pick_start') ids.add(state.markerChooserId)
  if (state.phase === 'turn_choice' || state.phase === 'rolled_choice') ids.add(state.turnPlayerId)
  if (state.phase === 'discard_limit' && state.discardActorId) ids.add(state.discardActorId)
  if (state.phase === 'draft') ids.add(state.draftOrder[state.draftIndex])
  if (state.deal && state.phase !== 'game_over') {
    ids.add(state.deal.bossId)
    for (const id of requiredIds(state)) if (!acceptedNow(state.deal, id)) ids.add(id)
  }
  return [...ids]
}

/** Takes a seat out of the current deal: their cards go back, their slots reopen, their payout goes to the boss. */
function takeOutOfDeal(state, targetId) {
  const deal = state.deal
  returnTableCards(state, targetId)
  const seat = seatOf(state, targetId)
  for (const t of seat?.investors ?? []) if (!deal.blockedTeams.includes(t)) deal.blockedTeams.push(t)
  reopenSlots(deal, (src) => src.ownerId === targetId)
  if (deal.allocation[targetId]) {
    deal.allocation[deal.bossId] = (deal.allocation[deal.bossId] ?? 0) + deal.allocation[targetId]
    delete deal.allocation[targetId]
  }
  refreshTerms(state)
  backToTalks(state)
}

/** Host decision "carry on without them": pass their turn, fail their deal or take their teams out of it. */
export function skipBossPlayer(inputState, targetId, randomIndex, nowMs = Date.now()) {
  const state = structuredClone(inputState)
  const seat = seatOf(state, targetId)
  if (!seat || state.phase === 'game_over') return { ok: false, status: 409, code: 'NOTHING_TO_SKIP' }
  if (state.phase === 'interrupt') return { ok: false, status: 409, code: 'INVALID_PHASE' }
  let done = false
  if (state.phase === 'draft' && state.draftOrder[state.draftIndex] === targetId) {
    draftPick(state, state.availableInvestors[randomIndex(state.availableInvestors.length)], nowMs)
    done = true
  } else if (state.phase === 'pick_start' && state.markerChooserId === targetId) {
    const space = randomIndex(16)
    state.markerSpace = space
    state.phase = 'turn_choice'
    state.turnPlayerId = state.firstPlayerId
    addEvent(state, 'marker_placed', targetId, nowMs, { spaceIndex: space })
    done = true
  } else if (state.phase === 'discard_limit' && state.discardActorId === targetId) {
    const extra = seat.hand.length - HAND_LIMIT
    const drop = new Set(shuffled(seat.hand, randomIndex).slice(0, extra).map((c) => c.id))
    discardTo(state, seat, drop)
    done = true
  } else if (state.deal && state.deal.bossId === targetId) {
    failDeal(state, nowMs)
    done = true
  } else if (state.deal) {
    const providers = activeTeamProviders(state)
    const involved = Object.values(providers).some((ids) => ids.includes(targetId)) || requiredIds(state).includes(targetId)
    if (involved) {
      takeOutOfDeal(state, targetId)
      done = true
    }
  } else if ((state.phase === 'turn_choice' || state.phase === 'rolled_choice') && state.turnPlayerId === targetId) {
    state.turnPlayerId = nextSeatId(state, targetId)
    state.phase = 'turn_choice'
    done = true
  }
  if (!done) return { ok: false, status: 409, code: 'NOTHING_TO_SKIP' }
  addEvent(state, 'player_skipped', targetId, nowMs)
  return { ok: true, state }
}

/** Remove a seat for good (left the room or kicked). Their cash leaves with them. */
export function removeBossPlayer(inputState, leavingId, randomIndex, nowMs = Date.now()) {
  let state = structuredClone(inputState)
  if (!seatOf(state, leavingId) || state.phase === 'game_over') return state
  if (state.deal?.bossId === leavingId) failDeal(state, nowMs)
  const nextTurn = nextSeatId(state, leavingId)
  const idx = state.seats.findIndex((s) => s.id === leavingId)
  const [removed] = state.seats.splice(idx, 1)
  state.availableInvestors.push(...removed.investors)
  state.discard.push(...removed.hand)
  if (state.deal) takeOutOfDeal(state, leavingId)
  if (state.phase === 'draft') {
    // their remaining picks go back to the pool order without them
    state.draftOrder = [...state.draftOrder.slice(0, state.draftIndex), ...state.draftOrder.slice(state.draftIndex).filter((id) => id !== leavingId)]
    if (state.draftIndex >= state.draftOrder.length) state.phase = 'pick_start'
  }
  if (state.interrupt?.actorId === leavingId) state.interrupt.deadlineAt = iso(nowMs)
  if (state.turnPlayerId === leavingId) state.turnPlayerId = nextTurn
  if (state.markerChooserId === leavingId) state.markerChooserId = nextTurn
  if (state.firstPlayerId === leavingId) state.firstPlayerId = nextTurn
  if (state.discardActorId === leavingId) {
    state.discardActorId = null
    state.turnPlayerId = state.discardNextTurnId ?? nextTurn
    state.phase = 'turn_choice'
  }
  if (state.phase === 'pick_start' && state.markerChooserId === state.firstPlayerId && state.seats.length) {
    // keep the "player on the right picks" rule when the chooser left
    const i = state.seats.findIndex((s) => s.id === state.firstPlayerId)
    state.markerChooserId = state.seats[(i + state.seats.length - 1) % state.seats.length].id
  }
  if (state.seats.length < 3) finish(state, leavingId, nowMs, undefined)
  else addEvent(state, 'player_removed', leavingId, nowMs)
  if (state.phase === 'interrupt') state = resolveBossDeadlines(state, { dealPlacards: [] }, randomIndex, nowMs).state
  return state
}

function dealView(state) {
  const { terms, accepted, declined, version, ...deal } = state.deal
  const required = requiredIds(state)
  return {
    ...deal,
    terms: Object.fromEntries(Object.entries(terms).map(([id, t]) => [id, t.version])),
    providers: activeTeamProviders(state),
    contributorIds: contributorIds(state),
    requiredIds: required,
    acceptedIds: required.filter((id) => acceptedNow(state.deal, id)),
    declinedIds: required.filter((id) => declinedNow(state.deal, id)),
    canClose: canCloseDeal(state).ok,
  }
}

export function projectBossView(state, viewerId, board) {
  const dealNumber = state.placards[Math.min(state.dealIndex, state.placards.length - 1)]
  const placard = placardOf(board, dealNumber)
  const reveal = state.phase === 'game_over'
  const me = seatOf(state, viewerId)
  return {
    revision: state.revision,
    phase: state.phase,
    short: state.settings.short,
    turnPlayerId: state.turnPlayerId,
    markerChooserId: state.markerChooserId,
    markerSpace: state.markerSpace,
    lastRoll: state.lastRoll,
    currentDealNumber: dealNumber,
    dealsDone: state.dealIndex,
    dealsTotal: state.placards.length,
    currentShareValue: placard?.shareValue ?? 0,
    currentEndRollFaces: placard?.endRollFaces ?? [],
    deckCount: state.deck.length,
    discardCount: state.discard.length,
    availableInvestors: [...state.availableInvestors],
    spaces: state.spaces,
    seats: state.seats.map((s) => ({
      userId: s.id,
      investors: [...s.investors],
      portrait: s.portrait ?? s.investors[0] ?? null,
      handCount: s.hand.length,
      // Wallets stay private until the end.
      cashTier: s.id === viewerId || reveal ? cashTierOf(s.cash) : null,
      exactCash: s.id === viewerId || reveal ? s.cash : null,
    })),
    investorsEach: state.settings.investorsEach ?? defaultInvestorsEach(state.seats.length),
    draft: state.phase === 'draft' ? { order: state.draftOrder, index: state.draftIndex, actorId: state.draftOrder[state.draftIndex] } : null,
    deal: state.deal ? dealView(state) : null,
    interrupt: state.interrupt,
    lastEndRoll: state.lastEndRoll,
    lastSettlement: state.lastSettlement,
    myHand: me ? [...me.hand] : [],
    discardPendingCount: state.phase === 'discard_limit' && state.discardActorId === viewerId && me ? Math.max(0, me.hand.length - HAND_LIMIT) : 0,
    blockingIds: blockingIds(state),
    stats: state.stats ?? {},
    events: state.events.slice(-12),
    winnerIds: state.winnerIds,
  }
}
