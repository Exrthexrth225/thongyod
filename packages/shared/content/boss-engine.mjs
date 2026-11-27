/**
 * Authoritative I'm the Boss! state machine, shared by apps/api and the apps/web demo mocks.
 * Pure: no I/O, no clock, no Math.random. Pass randomIndex(upperBound) and nowMs.
 * Rules agreed with Earth on 2026-11-27 (docs/IM_THE_BOSS.md):
 * - the boss pays anyone at the table (bribes); only investors/team cards in the deal have to accept;
 * - Travel, Boss and Recruit wait 5 s for a Stop; the first Stop cancels them, a Stop cannot be stopped;
 *   the window always runs the full 5 s so nobody learns who holds a Stop;
 * - closing counts 6 s; any card, offer, ask or "wait" sends the deal back to negotiating;
 * - the host can skip or remove a player who is holding the game up.
 */

export const TEAMS = /** @type {const} */ (['red', 'orange', 'yellow', 'green', 'blue', 'purple'])
export const HAND_LIMIT = 12
export const START_HAND = 5
export const STOP_WINDOW_MS = 5_000
export const CLOSING_MS = 6_000
const SHORT_SKIP = new Set([3, 6, 9])

/** @param {number} cash */
export function cashTierOf(cash) {
  if (cash <= 0) return 'empty'
  if (cash < 10_000_000) return 'low'
  if (cash < 25_000_000) return 'mid'
  if (cash < 50_000_000) return 'high'
  return 'rich'
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

/** Team -> seat IDs offering it in the current deal (placard owner unless sent away, plus team cards). */
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

/** Seats whose agreement counts for the deal: the boss plus everyone offering a team. */
export function contributorIds(state) {
  if (!state.deal) return []
  const ids = new Set([state.deal.bossId])
  for (const list of Object.values(activeTeamProviders(state))) for (const id of list) ids.add(id)
  return [...ids]
}

/** Teams that are in: offered by the boss or by someone who accepted the current offer. */
export function agreedTeams(state) {
  const deal = state.deal
  if (!deal) return []
  const accepted = new Set([deal.bossId, ...deal.acceptedIds])
  return Object.entries(activeTeamProviders(state)).filter(([, ids]) => ids.some((id) => accepted.has(id))).map(([team]) => team)
}

export function canCloseDeal(state) {
  const deal = state.deal
  if (!deal) return { ok: false, reason: 'NO_DEAL' }
  const space = state.spaces[deal.spaceIndex]
  const amounts = Object.values(deal.allocation)
  if (!deal.offered || amounts.reduce((a, b) => a + b, 0) !== deal.totalValue) return { ok: false, reason: 'NO_OFFER' }
  for (const id of Object.keys(deal.allocation)) if (!seatOf(state, id)) return { ok: false, reason: 'BAD_RECIPIENT' }
  const teams = new Set(agreedTeams(state))
  // every column needs its own count of investors
  if (space.groups.some((g) => g.teams.filter((t) => teams.has(t)).length < g.pick)) return { ok: false, reason: 'NOT_ENOUGH_TEAMS' }
  return { ok: true }
}

function backToTalks(state) {
  if (!state.deal) return
  state.deal.closingDeadlineAt = null
  if (state.phase === 'closing') state.phase = 'negotiating'
}

function clearAgreement(deal) {
  deal.acceptedIds = []
  deal.declinedIds = []
}

/** Accept automatically when the boss offers at least what the player asked for. */
function autoAccept(state) {
  const deal = state.deal
  if (!deal?.offered) return
  for (const [id, ask] of Object.entries(deal.asks)) {
    if (id !== deal.bossId && ask !== null && (deal.allocation[id] ?? 0) >= ask && !deal.acceptedIds.includes(id) && !deal.declinedIds.includes(id)) {
      deal.acceptedIds.push(id)
    }
  }
}

function returnTableCards(state, onlyOwnerId) {
  const deal = state.deal
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
  const { bossId, dealNumber, totalValue, spaceIndex } = deal
  state.deal = null
  state.lastSettlement = { dealNumber, spaceIndex, bossId, totalValue, payouts }
  addEvent(state, 'deal_settled', bossId, nowMs, { dealNumber, amount: totalValue, spaceIndex })

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
      deal.bossId = intr.actorId
      delete deal.asks[intr.actorId]
    } else if (intr.kind === 'travel') {
      const cardIdx = deal.tableCards.findIndex((c) => c.team === intr.targetTeam && (!intr.targetCardId || c.id === intr.targetCardId))
      if (intr.targetCardId && cardIdx !== -1) {
        const [removed] = deal.tableCards.splice(cardIdx, 1)
        state.discard.push({ id: removed.id, kind: 'team', team: removed.team })
      } else if (!deal.blockedTeams.includes(intr.targetTeam)) {
        deal.blockedTeams.push(intr.targetTeam)
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
    }
    clearAgreement(deal)
    autoAccept(state)
  }
  addEvent(state, 'interrupt_resolved', intr.actorId, nowMs, { team: intr.targetTeam, cancelled: Boolean(intr.stoppedBy), targetId: intr.stoppedBy ?? undefined })
}

/**
 * @param {readonly string[]} seatIds turn order
 * @param {{short?: boolean}} [rawSettings]
 */
export function createBossGame(seatIds, rawSettings, board, randomIndex, nowMs = Date.now()) {
  if (seatIds.length < 3 || seatIds.length > 6 || new Set(seatIds).size !== seatIds.length) {
    throw new RangeError('Expected three to six distinct seats')
  }
  const short = rawSettings?.short === true
  const availableInvestors = shuffled([...TEAMS], randomIndex)
  const deck = shuffled(buildDeck(), randomIndex)
  const seats = seatIds.map((id) => ({
    id,
    investors: availableInvestors.splice(0, seatIds.length === 3 ? 2 : 1),
    cash: 0,
    hand: deck.splice(0, START_HAND),
  }))
  const first = randomIndex(seats.length)
  const firstPlayerId = seats[first].id
  const markerChooserId = seats[(first + seats.length - 1) % seats.length].id
  return {
    revision: 1,
    phase: 'pick_start',
    settings: { short },
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
    spaces: board.spaces.map((s) => ({ ...s, closedByDeal: null, closedByBossId: null })),
    seats,
    deal: null,
    interrupt: null,
    lastEndRoll: null,
    lastSettlement: null,
    discardActorId: null,
    discardNextTurnId: null,
    processedActionIds: [],
    winnerIds: [],
    events: [{ id: 'e1', revision: 1, kind: 'game_started', actorId: firstPlayerId, targetId: markerChooserId, createdAt: iso(nowMs) }],
  }
}

/** Earliest moment the state changes on its own, or null. */
export function bossDeadline(state) {
  if (state.phase === 'interrupt' && state.interrupt) return state.interrupt.deadlineAt
  if (state.phase === 'closing' && state.deal?.closingDeadlineAt) return state.deal.closingDeadlineAt
  return null
}

export function resolveBossDeadlines(inputState, board, randomIndex, nowMs = Date.now()) {
  const state = structuredClone(inputState)
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
      state.markerSpace = advanceMarker(from, roll, closedSetOf(state))
      state.phase = 'rolled_choice'
      addEvent(state, 'dice_rolled', actorId, nowMs, { roll, spaceIndex: state.markerSpace, fromSpace: from })
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
        allocation: {},
        offered: false,
        asks: {},
        acceptedIds: [],
        declinedIds: [],
        closingDeadlineAt: null,
      }
      state.phase = 'negotiating'
      addEvent(state, 'deal_opened', actorId, nowMs, { dealNumber, spaceIndex, amount: state.deal.totalValue })
      return
    }
    case 'set_allocation': {
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
      clearAgreement(deal)
      autoAccept(state)
      backToTalks(state)
      addEvent(state, 'offer_updated', actorId, nowMs, { amount: deal.totalValue })
      return
    }
    case 'set_ask': {
      if (!talking) return err(409, 'INVALID_PHASE')
      if (actorId === deal.bossId) return err(400, 'ALREADY_BOSS')
      if (a.amount !== null && !isMoney(a.amount)) return err(400, 'INVALID_REQUEST')
      deal.asks[actorId] = a.amount
      deal.acceptedIds = deal.acceptedIds.filter((id) => id !== actorId)
      deal.declinedIds = deal.declinedIds.filter((id) => id !== actorId)
      autoAccept(state)
      backToTalks(state)
      addEvent(state, 'ask_set', actorId, nowMs, { amount: a.amount ?? undefined })
      return
    }
    case 'accept_offer':
    case 'decline_offer': {
      if (!talking) return err(409, 'INVALID_PHASE')
      if (!deal.offered) return err(409, 'NO_OFFER')
      if (actorId === deal.bossId) return err(400, 'ALREADY_BOSS')
      const accept = a.type === 'accept_offer'
      deal.acceptedIds = deal.acceptedIds.filter((id) => id !== actorId)
      deal.declinedIds = deal.declinedIds.filter((id) => id !== actorId)
      ;(accept ? deal.acceptedIds : deal.declinedIds).push(actorId)
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
      state.discard.push(...seat.hand.splice(idx, 1))
      const owner = targetCardId ? deal.tableCards.find((c) => c.id === targetCardId).ownerId : state.seats.find((s) => s.investors.includes(a.targetTeam))?.id
      openInterrupt(state, 'travel', actorId, nowMs, { targetTeam: a.targetTeam, targetCardId, targetId: owner ?? null })
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
      if (state.phase !== 'interrupt' || !state.interrupt) return err(409, 'INVALID_PHASE')
      if (state.interrupt.stoppedBy) return err(409, 'ALREADY_STOPPED')
      if (actorId === state.interrupt.actorId) return err(400, 'CANNOT_STOP_SELF')
      const idx = seat.hand.findIndex((c) => c.id === a.cardId && c.kind === 'stop')
      if (idx === -1) return err(400, 'CARD_NOT_FOUND')
      state.discard.push(...seat.hand.splice(idx, 1))
      state.interrupt.stoppedBy = actorId
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
  if (state.deal && state.phase !== 'game_over') {
    ids.add(state.deal.bossId)
    const space = state.spaces[state.deal.spaceIndex]
    const providers = activeTeamProviders(state)
    for (const g of space.groups.filter((x) => x.pick === x.teams.length)) {
      for (const team of g.teams) {
        const list = providers[team] ?? []
        if (list.length === 1) ids.add(list[0])
      }
    }
  }
  return [...ids]
}

/** Host decision "carry on without them": pass their turn, fail their deal or take their teams out of it. */
export function skipBossPlayer(inputState, targetId, randomIndex, nowMs = Date.now()) {
  const state = structuredClone(inputState)
  const seat = seatOf(state, targetId)
  if (!seat || state.phase === 'game_over') return { ok: false, status: 409, code: 'NOTHING_TO_SKIP' }
  if (state.phase === 'interrupt') return { ok: false, status: 409, code: 'INVALID_PHASE' }
  let done = false
  if (state.phase === 'pick_start' && state.markerChooserId === targetId) {
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
    const teams = Object.entries(providers).filter(([, ids]) => ids.includes(targetId)).map(([t]) => t)
    if (teams.length) {
      returnTableCards(state, targetId)
      for (const t of seat.investors) if (!state.deal.blockedTeams.includes(t)) state.deal.blockedTeams.push(t)
      state.deal.acceptedIds = state.deal.acceptedIds.filter((id) => id !== targetId)
      backToTalks(state)
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
  if (state.deal) {
    returnTableCards(state, leavingId)
    state.deal.acceptedIds = state.deal.acceptedIds.filter((id) => id !== leavingId)
    state.deal.declinedIds = state.deal.declinedIds.filter((id) => id !== leavingId)
    delete state.deal.allocation[leavingId]
    delete state.deal.asks[leavingId]
    state.deal.offered = false
    backToTalks(state)
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
      handCount: s.hand.length,
      cashTier: cashTierOf(s.cash),
      exactCash: s.id === viewerId || reveal ? s.cash : null,
    })),
    deal: state.deal ? { ...state.deal, providers: activeTeamProviders(state), agreedTeams: agreedTeams(state), contributorIds: contributorIds(state), canClose: canCloseDeal(state).ok } : null,
    interrupt: state.interrupt,
    lastEndRoll: state.lastEndRoll,
    lastSettlement: state.lastSettlement,
    myHand: me ? [...me.hand] : [],
    discardPendingCount: state.phase === 'discard_limit' && state.discardActorId === viewerId && me ? Math.max(0, me.hand.length - HAND_LIMIT) : 0,
    blockingIds: blockingIds(state),
    events: state.events.slice(-12),
    winnerIds: state.winnerIds,
  }
}
