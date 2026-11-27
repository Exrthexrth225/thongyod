/**
 * Pure, authoritative I'm the Boss! state machine shared by apps/api and apps/web demo mocks.
 * Zero external dependencies; deterministic when given a deterministic randomIndex(upperBound).
 */

/** @typedef {'red'|'orange'|'yellow'|'green'|'blue'|'purple'} InvestorTeam */

export const TEAMS = /** @type {const} */ (['red', 'orange', 'yellow', 'green', 'blue', 'purple'])
export const HAND_LIMIT = 12
export const INTERRUPT_MS = 10_000

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

function buildDeck() {
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

function cloneState(state) {
  return structuredClone(state)
}

function nextSeatId(seats, fromId) {
  const idx = seats.findIndex((s) => s.id === fromId)
  if (idx === -1) return seats[0].id
  return seats[(idx + 1) % seats.length].id
}

function advanceMarker(position, steps, closedSet) {
  let pos = position
  for (let remaining = steps; remaining > 0;) {
    pos = (pos + 1) % 16
    if (!closedSet.has(pos)) remaining--
  }
  return pos
}

function closedSetOf(state) {
  return new Set(state.spaces.filter((s) => s.closedByDeal !== null).map((s) => s.index))
}

function drawFromDeck(state, count, randomIndex) {
  const drawn = []
  for (let i = 0; i < count; i++) {
    if (state.deck.length === 0) {
      if (state.discard.length === 0) break
      state.deck = shuffled(state.discard, randomIndex)
      state.discard = []
    }
    const card = state.deck.shift()
    if (card) drawn.push(card)
  }
  return drawn
}

function addEvent(state, kind, actorId, nowMs, extra = {}) {
  state.revision += 1
  const evt = {
    id: `e${state.revision}`,
    revision: state.revision,
    kind,
    actorId,
    createdAt: new Date(nowMs).toISOString(),
    ...extra,
  }
  state.events.push(evt)
  if (state.events.length > 24) state.events = state.events.slice(-24)
}

function recordAction(state, actionId) {
  if (!actionId) return
  state.processedActionIds.push(actionId)
  if (state.processedActionIds.length > 64) state.processedActionIds = state.processedActionIds.slice(-64)
}

function computeWinners(seats) {
  const best = Math.max(...seats.map((s) => s.cash))
  return seats.filter((s) => s.cash === best).map((s) => s.id)
}

/** Returns map of InvestorTeam -> array of provider seat IDs currently active in the deal. */
export function activeTeamProviders(state) {
  const deal = state.deal
  /** @type {Record<string, string[]>} */
  const providers = {}
  if (!deal) return providers
  const space = state.spaces[deal.spaceIndex]
  const allowed = new Set([...space.required, ...space.optional])
  const blocked = new Set(deal.blockedTeams)

  for (const team of allowed) {
    const ids = new Set()
    if (!blocked.has(team)) {
      const owner = state.seats.find((s) => s.investors.includes(team))
      if (owner) ids.add(owner.id)
    }
    for (const tc of deal.tableCards) {
      if (tc.team === team) ids.add(tc.ownerId)
    }
    if (ids.size > 0) providers[team] = [...ids]
  }
  return providers
}

export function eligibleRecipients(state) {
  const deal = state.deal
  if (!deal) return []
  const ids = new Set([deal.bossId])
  for (const list of Object.values(activeTeamProviders(state))) {
    for (const id of list) ids.add(id)
  }
  return [...ids]
}

export function canCloseDeal(state) {
  const deal = state.deal
  if (!deal) return { ok: false, reason: 'NO_DEAL' }
  const space = state.spaces[deal.spaceIndex]
  const providers = activeTeamProviders(state)
  const accepted = new Set([deal.bossId, ...deal.acceptedIds])

  const sum = Object.values(deal.allocation).reduce((a, b) => a + b, 0)
  if (sum !== deal.totalValue) return { ok: false, reason: 'BAD_TOTAL' }

  const eligible = new Set(eligibleRecipients(state))
  for (const [id, amt] of Object.entries(deal.allocation)) {
    if (!Number.isInteger(amt) || amt < 0 || !eligible.has(id)) return { ok: false, reason: 'BAD_RECIPIENT' }
    if (amt > 0 && !accepted.has(id)) return { ok: false, reason: 'MISSING_ACCEPT' }
  }

  for (const req of space.required) {
    const prov = providers[req] ?? []
    if (!prov.some((id) => accepted.has(id))) return { ok: false, reason: 'MISSING_REQUIRED' }
  }

  let agreedTeamCount = 0
  for (const team of [...space.required, ...space.optional]) {
    const prov = providers[team] ?? []
    if (prov.some((id) => accepted.has(id))) agreedTeamCount += 1
  }
  if (agreedTeamCount < space.teamCount) return { ok: false, reason: 'NOT_ENOUGH_TEAMS' }

  return { ok: true }
}

function settleDeal(state, board, randomIndex, nowMs) {
  const deal = state.deal
  if (!deal) return
  for (const seat of state.seats) {
    const payout = deal.allocation[seat.id] ?? 0
    if (payout > 0) seat.cash += payout
  }
  for (const tc of deal.tableCards) {
    state.discard.push({ id: tc.id, kind: 'team', team: tc.team })
  }
  const space = state.spaces[deal.spaceIndex]
  space.closedByDeal = deal.dealNumber
  space.closedByBossId = deal.bossId

  const settledDeal = deal.dealNumber
  const bossId = deal.bossId
  const totalValue = deal.totalValue
  const spaceIndex = deal.spaceIndex
  state.deal = null
  state.currentDealNumber += 1

  addEvent(state, 'deal_settled', bossId, nowMs, {
    dealNumber: settledDeal,
    amount: totalValue,
    spaceIndex,
  })

  if (settledDeal >= 15) {
    state.phase = 'game_over'
    state.winnerIds = computeWinners(state.seats)
    addEvent(state, 'game_ended', bossId, nowMs, { dealNumber: settledDeal })
    return
  }

  if (settledDeal >= 10) {
    const placard = board.dealPlacards.find((p) => p.number === settledDeal)
    const roll = randomIndex(6) + 1
    const ended = Boolean(placard && placard.endRollFaces.includes(roll))
    state.lastEndRoll = { roll, ended, dealNumber: settledDeal }
    addEvent(state, 'end_roll', bossId, nowMs, { roll, dealNumber: settledDeal, cancelled: !ended })
    if (ended) {
      state.phase = 'game_over'
      state.winnerIds = computeWinners(state.seats)
      addEvent(state, 'game_ended', bossId, nowMs, { dealNumber: settledDeal })
      return
    }
  }

  const closed = closedSetOf(state)
  if (closed.size < 16 && state.markerSpace !== null) {
    state.markerSpace = advanceMarker(state.markerSpace, 1, closed)
  }
  state.turnPlayerId = nextSeatId(state.seats, bossId)
  state.phase = 'turn_choice'
}

function resolveInterrupt(state, nowMs) {
  const intr = state.interrupt
  const deal = state.deal
  if (!intr || !deal) return
  const cancelled = intr.stopCount % 2 === 1
  if (!cancelled) {
    if (intr.kind === 'boss') {
      deal.bossId = intr.actorId
      deal.acceptedIds = []
      deal.closingDeadlineAt = null
      state.phase = 'negotiating'
    } else if (intr.kind === 'travel' && intr.targetTeam) {
      const cardIdx = deal.tableCards.findIndex((c) => c.team === intr.targetTeam)
      if (cardIdx !== -1) {
        const [removed] = deal.tableCards.splice(cardIdx, 1)
        state.discard.push({ id: removed.id, kind: 'team', team: removed.team })
      } else if (!deal.blockedTeams.includes(intr.targetTeam)) {
        deal.blockedTeams.push(intr.targetTeam)
      }
      deal.acceptedIds = []
      deal.closingDeadlineAt = null
      state.phase = 'negotiating'
    } else if (intr.kind === 'recruit' && intr.targetTeam) {
      const availIdx = state.availableInvestors.indexOf(intr.targetTeam)
      if (availIdx !== -1) {
        state.availableInvestors.splice(availIdx, 1)
      } else {
        for (const s of state.seats) {
          const idx = s.investors.indexOf(intr.targetTeam)
          if (idx !== -1) {
            s.investors.splice(idx, 1)
            break
          }
        }
      }
      const actor = state.seats.find((s) => s.id === intr.actorId)
      if (actor && !actor.investors.includes(intr.targetTeam)) actor.investors.push(intr.targetTeam)
      deal.acceptedIds = []
      deal.closingDeadlineAt = null
      state.phase = 'negotiating'
    }
  } else {
    state.phase = intr.resumePhase
    if (state.phase === 'closing') {
      deal.closingDeadlineAt = new Date(nowMs + state.settings.closingSeconds * 1000).toISOString()
    }
  }
  state.interrupt = null
  addEvent(state, 'interrupt_resolved', intr.actorId, nowMs, {
    team: intr.targetTeam,
    cancelled,
  })
}

export function createBossGame(seatIds, rawSettings, board, randomIndex, nowMs = Date.now()) {
  if (seatIds.length < 3 || seatIds.length > 6 || new Set(seatIds).size !== seatIds.length) {
    throw new RangeError('Expected three to six distinct seats')
  }
  const closingSeconds = rawSettings?.closingSeconds === 15 ? 15 : 10
  const availableInvestors = shuffled([...TEAMS], randomIndex)
  const deck = shuffled(buildDeck(), randomIndex)
  const seats = seatIds.map((id) => ({
    id,
    investors: availableInvestors.splice(0, seatIds.length === 3 ? 2 : 1),
    cash: 0,
    hand: deck.splice(0, 5),
  }))
  const first = randomIndex(seats.length)
  const firstPlayerId = seats[first].id
  const markerChooserId = seats[(first + seats.length - 1) % seats.length].id

  const state = {
    revision: 1,
    phase: 'pick_start',
    settings: { closingSeconds },
    firstPlayerId,
    turnPlayerId: firstPlayerId,
    markerChooserId,
    markerSpace: null,
    lastRoll: null,
    currentDealNumber: 1,
    deck,
    discard: [],
    availableInvestors,
    spaces: board.spaces.map((s) => ({ ...s, closedByDeal: null, closedByBossId: null })),
    seats,
    deal: null,
    interrupt: null,
    lastEndRoll: null,
    discardActorId: null,
    discardNextTurnId: null,
    processedActionIds: [],
    winnerIds: [],
    events: [
      {
        id: 'e1',
        revision: 1,
        kind: 'game_started',
        actorId: firstPlayerId,
        targetId: markerChooserId,
        createdAt: new Date(nowMs).toISOString(),
      },
    ],
  }
  return state
}

export function resolveBossDeadlines(inputState, board, randomIndex, nowMs = Date.now()) {
  const state = cloneState(inputState)
  let changed = false
  if (state.phase === 'interrupt' && state.interrupt && nowMs >= Date.parse(state.interrupt.deadlineAt)) {
    resolveInterrupt(state, nowMs)
    changed = true
  }
  if (state.phase === 'closing' && state.deal?.closingDeadlineAt && nowMs >= Date.parse(state.deal.closingDeadlineAt)) {
    if (canCloseDeal(state).ok) {
      settleDeal(state, board, randomIndex, nowMs)
    } else {
      state.deal.closingDeadlineAt = null
      state.phase = 'negotiating'
    }
    changed = true
  }
  return { state, changed }
}

function err(status, code) {
  return { ok: false, status, code }
}

export function applyBossAction(inputState, actorId, request, board, randomIndex, nowMs = Date.now()) {
  const { state } = resolveBossDeadlines(inputState, board, randomIndex, nowMs)
  const actionId = typeof request?.actionId === 'string' && request.actionId.length <= 64 ? request.actionId : undefined
  if (actionId && state.processedActionIds.includes(actionId)) {
    return { ok: true, state, duplicate: true }
  }
  if (request?.expectedRevision !== undefined && request.expectedRevision !== state.revision) {
    return err(409, 'REVISION_CONFLICT')
  }
  const seat = state.seats.find((s) => s.id === actorId)
  if (!seat) return err(403, 'NOT_IN_ROOM')
  if (state.phase === 'game_over') return err(409, 'GAME_OVER')

  const a = request?.action
  if (!a || typeof a !== 'object' || typeof a.type !== 'string') return err(400, 'INVALID_REQUEST')

  if (a.type === 'pick_start') {
    if (state.phase !== 'pick_start') return err(409, 'INVALID_PHASE')
    if (actorId !== state.markerChooserId) return err(403, 'NOT_YOUR_TURN')
    if (!Number.isInteger(a.spaceIndex) || a.spaceIndex < 0 || a.spaceIndex >= 16) return err(400, 'INVALID_REQUEST')
    state.markerSpace = a.spaceIndex
    state.phase = 'turn_choice'
    state.turnPlayerId = state.firstPlayerId
    addEvent(state, 'marker_placed', actorId, nowMs, { spaceIndex: a.spaceIndex })
    recordAction(state, actionId)
    return { ok: true, state }
  }

  if (a.type === 'roll_die') {
    if (state.phase !== 'turn_choice') return err(409, 'INVALID_PHASE')
    if (actorId !== state.turnPlayerId) return err(403, 'NOT_YOUR_TURN')
    const roll = randomIndex(6) + 1
    state.lastRoll = roll
    state.markerSpace = advanceMarker(state.markerSpace ?? 0, roll, closedSetOf(state))
    state.phase = 'rolled_choice'
    addEvent(state, 'dice_rolled', actorId, nowMs, { roll, spaceIndex: state.markerSpace })
    recordAction(state, actionId)
    return { ok: true, state }
  }

  if (a.type === 'draw_cards') {
    if (state.phase !== 'rolled_choice') return err(409, 'INVALID_PHASE')
    if (actorId !== state.turnPlayerId) return err(403, 'NOT_YOUR_TURN')
    const drawn = drawFromDeck(state, 3, randomIndex)
    seat.hand.push(...drawn)
    const nextTurn = nextSeatId(state.seats, actorId)
    addEvent(state, 'drew_cards', actorId, nowMs, { amount: drawn.length })
    if (seat.hand.length > HAND_LIMIT) {
      state.phase = 'discard_limit'
      state.discardActorId = actorId
      state.discardNextTurnId = nextTurn
    } else {
      state.turnPlayerId = nextTurn
      state.phase = 'turn_choice'
    }
    recordAction(state, actionId)
    return { ok: true, state }
  }

  if (a.type === 'open_deal') {
    if (state.phase !== 'turn_choice' && state.phase !== 'rolled_choice') return err(409, 'INVALID_PHASE')
    if (actorId !== state.turnPlayerId) return err(403, 'NOT_YOUR_TURN')
    const spaceIndex = state.markerSpace ?? 0
    const space = state.spaces[spaceIndex]
    const placard = board.dealPlacards.find((p) => p.number === state.currentDealNumber)
    if (!space || space.closedByDeal !== null || !placard) return err(409, 'SPACE_CLOSED')
    state.deal = {
      id: `d${state.currentDealNumber}-${state.revision + 1}`,
      spaceIndex,
      dealNumber: state.currentDealNumber,
      totalValue: space.dividends * placard.shareValue,
      bossId: actorId,
      blockedTeams: [],
      tableCards: [],
      allocation: {},
      acceptedIds: [],
      closingDeadlineAt: null,
    }
    state.phase = 'negotiating'
    addEvent(state, 'deal_opened', actorId, nowMs, { dealNumber: state.currentDealNumber, spaceIndex })
    recordAction(state, actionId)
    return { ok: true, state }
  }

  if (a.type === 'set_allocation') {
    if ((state.phase !== 'negotiating' && state.phase !== 'closing') || !state.deal) return err(409, 'INVALID_PHASE')
    if (actorId !== state.deal.bossId) return err(403, 'NOT_BOSS')
    if (!a.allocation || typeof a.allocation !== 'object' || Array.isArray(a.allocation)) return err(400, 'INVALID_REQUEST')
    const eligible = new Set(eligibleRecipients(state))
    /** @type {Record<string, number>} */
    const nextAlloc = {}
    let sum = 0
    for (const [id, rawAmt] of Object.entries(a.allocation)) {
      if (!eligible.has(id) || typeof rawAmt !== 'number' || !Number.isInteger(rawAmt) || rawAmt < 0) {
        return err(400, 'INVALID_ALLOCATION')
      }
      if (rawAmt > 0) nextAlloc[id] = rawAmt
      sum += rawAmt
    }
    if (sum !== state.deal.totalValue) return err(400, 'INVALID_ALLOCATION_TOTAL')
    state.deal.allocation = nextAlloc
    state.deal.acceptedIds = [actorId]
    state.deal.closingDeadlineAt = null
    state.phase = 'negotiating'
    addEvent(state, 'offer_updated', actorId, nowMs, { amount: state.deal.totalValue })
    recordAction(state, actionId)
    return { ok: true, state }
  }

  if (a.type === 'accept_offer') {
    if (state.phase !== 'negotiating' || !state.deal) return err(409, 'INVALID_PHASE')
    const sum = Object.values(state.deal.allocation).reduce((x, y) => x + y, 0)
    if (sum !== state.deal.totalValue) return err(409, 'NO_OFFER')
    if (!state.deal.acceptedIds.includes(actorId)) {
      state.deal.acceptedIds.push(actorId)
      addEvent(state, 'offer_accepted', actorId, nowMs)
    }
    recordAction(state, actionId)
    return { ok: true, state }
  }

  if (a.type === 'start_closing') {
    if (state.phase !== 'negotiating' || !state.deal) return err(409, 'INVALID_PHASE')
    if (actorId !== state.deal.bossId) return err(403, 'NOT_BOSS')
    const check = canCloseDeal(state)
    if (!check.ok) return err(409, check.reason)
    state.phase = 'closing'
    state.deal.closingDeadlineAt = new Date(nowMs + state.settings.closingSeconds * 1000).toISOString()
    addEvent(state, 'deal_closing', actorId, nowMs, { dealNumber: state.deal.dealNumber })
    recordAction(state, actionId)
    return { ok: true, state }
  }

  if (a.type === 'fail_deal') {
    if ((state.phase !== 'negotiating' && state.phase !== 'closing') || !state.deal) return err(409, 'INVALID_PHASE')
    if (actorId !== state.deal.bossId) return err(403, 'NOT_BOSS')
    const bossId = state.deal.bossId
    for (const tc of state.deal.tableCards) {
      const owner = state.seats.find((s) => s.id === tc.ownerId)
      if (owner) owner.hand.push({ id: tc.id, kind: 'team', team: tc.team })
      else state.discard.push({ id: tc.id, kind: 'team', team: tc.team })
    }
    state.deal = null
    const nextTurn = nextSeatId(state.seats, bossId)
    addEvent(state, 'deal_failed', bossId, nowMs)
    const bossSeat = state.seats.find((s) => s.id === bossId)
    if (bossSeat && bossSeat.hand.length > HAND_LIMIT) {
      state.phase = 'discard_limit'
      state.discardActorId = bossId
      state.discardNextTurnId = nextTurn
    } else {
      state.turnPlayerId = nextTurn
      state.phase = 'turn_choice'
    }
    recordAction(state, actionId)
    return { ok: true, state }
  }

  if (a.type === 'play_team') {
    if ((state.phase !== 'negotiating' && state.phase !== 'closing') || !state.deal) return err(409, 'INVALID_PHASE')
    const idx = seat.hand.findIndex((c) => c.id === a.cardId && c.kind === 'team')
    if (idx === -1) return err(400, 'CARD_NOT_FOUND')
    const card = seat.hand[idx]
    const space = state.spaces[state.deal.spaceIndex]
    if (!space.required.includes(card.team) && !space.optional.includes(card.team)) {
      return err(400, 'TEAM_NOT_IN_DEAL')
    }
    seat.hand.splice(idx, 1)
    state.deal.tableCards.push({ id: card.id, ownerId: actorId, team: card.team })
    if (state.phase === 'closing') {
      state.phase = 'negotiating'
      state.deal.closingDeadlineAt = null
      state.deal.acceptedIds = []
    }
    addEvent(state, 'team_played', actorId, nowMs, { team: card.team })
    recordAction(state, actionId)
    return { ok: true, state }
  }

  if (a.type === 'play_boss') {
    if ((state.phase !== 'negotiating' && state.phase !== 'closing') || !state.deal) return err(409, 'INVALID_PHASE')
    if (actorId === state.deal.bossId) return err(400, 'ALREADY_BOSS')
    const idx = seat.hand.findIndex((c) => c.id === a.cardId && c.kind === 'boss')
    if (idx === -1) return err(400, 'CARD_NOT_FOUND')
    const [card] = seat.hand.splice(idx, 1)
    state.discard.push(card)
    const resumePhase = state.phase
    state.phase = 'interrupt'
    state.interrupt = {
      id: `i${state.revision + 1}`,
      kind: 'boss',
      actorId,
      stopCount: 0,
      lastActorId: actorId,
      passedIds: [actorId],
      deadlineAt: new Date(nowMs + INTERRUPT_MS).toISOString(),
      resumePhase,
    }
    addEvent(state, 'boss_played', actorId, nowMs, { targetId: state.deal.bossId })
    recordAction(state, actionId)
    return { ok: true, state }
  }

  if (a.type === 'play_travel') {
    if ((state.phase !== 'negotiating' && state.phase !== 'closing') || !state.deal) return err(409, 'INVALID_PHASE')
    if (!TEAMS.includes(a.targetTeam)) return err(400, 'INVALID_REQUEST')
    const idx = seat.hand.findIndex((c) => c.id === a.cardId && c.kind === 'travel')
    if (idx === -1) return err(400, 'CARD_NOT_FOUND')
    const card = seat.hand[idx]
    if (card.team !== 'any' && card.team !== a.targetTeam) return err(400, 'WRONG_TEAM')
    const hasTableCard = state.deal.tableCards.some((tc) => tc.team === a.targetTeam)
    const hasActivePlacard = !state.deal.blockedTeams.includes(a.targetTeam) && state.seats.some((s) => s.investors.includes(a.targetTeam))
    if (!hasTableCard && !hasActivePlacard) return err(400, 'TARGET_NOT_ACTIVE')
    seat.hand.splice(idx, 1)
    state.discard.push(card)
    const resumePhase = state.phase
    state.phase = 'interrupt'
    state.interrupt = {
      id: `i${state.revision + 1}`,
      kind: 'travel',
      actorId,
      targetTeam: a.targetTeam,
      stopCount: 0,
      lastActorId: actorId,
      passedIds: [actorId],
      deadlineAt: new Date(nowMs + INTERRUPT_MS).toISOString(),
      resumePhase,
    }
    addEvent(state, 'travel_played', actorId, nowMs, { team: a.targetTeam })
    recordAction(state, actionId)
    return { ok: true, state }
  }

  if (a.type === 'play_recruit') {
    if ((state.phase !== 'negotiating' && state.phase !== 'closing') || !state.deal) return err(409, 'INVALID_PHASE')
    if (!Array.isArray(a.cardIds) || a.cardIds.length !== 3 || new Set(a.cardIds).size !== 3) return err(400, 'NEED_THREE_RECRUIT')
    if (!TEAMS.includes(a.targetTeam)) return err(400, 'INVALID_REQUEST')
    const indices = a.cardIds.map((id) => seat.hand.findIndex((c) => c.id === id && c.kind === 'recruit'))
    if (indices.some((i) => i === -1)) return err(400, 'CARD_NOT_FOUND')

    const isUnowned = state.availableInvestors.includes(a.targetTeam)
    if (state.availableInvestors.length > 0 && !isUnowned) return err(400, 'RECRUIT_UNOWNED_FIRST')
    const currentOwner = state.seats.find((s) => s.investors.includes(a.targetTeam))
    if (!isUnowned && (!currentOwner || currentOwner.id === actorId)) return err(400, 'INVALID_TARGET')

    const picked = new Set(a.cardIds)
    const removed = seat.hand.filter((c) => picked.has(c.id))
    seat.hand = seat.hand.filter((c) => !picked.has(c.id))
    state.discard.push(...removed)

    const resumePhase = state.phase
    state.phase = 'interrupt'
    state.interrupt = {
      id: `i${state.revision + 1}`,
      kind: 'recruit',
      actorId,
      targetTeam: a.targetTeam,
      targetOwnerId: currentOwner?.id ?? null,
      stopCount: 0,
      lastActorId: actorId,
      passedIds: [actorId],
      deadlineAt: new Date(nowMs + INTERRUPT_MS).toISOString(),
      resumePhase,
    }
    addEvent(state, 'recruit_played', actorId, nowMs, {
      team: a.targetTeam,
      targetId: currentOwner?.id,
    })
    recordAction(state, actionId)
    return { ok: true, state }
  }

  if (a.type === 'play_stop') {
    if (state.phase !== 'interrupt' || !state.interrupt) return err(409, 'INVALID_PHASE')
    if (actorId === state.interrupt.lastActorId) return err(400, 'CANNOT_STOP_SELF')
    const idx = seat.hand.findIndex((c) => c.id === a.cardId && c.kind === 'stop')
    if (idx === -1) return err(400, 'CARD_NOT_FOUND')
    const [card] = seat.hand.splice(idx, 1)
    state.discard.push(card)
    state.interrupt.stopCount += 1
    state.interrupt.lastActorId = actorId
    state.interrupt.passedIds = [actorId]
    state.interrupt.deadlineAt = new Date(nowMs + INTERRUPT_MS).toISOString()
    addEvent(state, 'stop_played', actorId, nowMs, { targetId: state.interrupt.actorId })
    recordAction(state, actionId)
    return { ok: true, state }
  }

  if (a.type === 'pass_interrupt') {
    if (state.phase !== 'interrupt' || !state.interrupt) return err(409, 'INVALID_PHASE')
    if (!state.interrupt.passedIds.includes(actorId)) {
      state.interrupt.passedIds.push(actorId)
    }
    if (state.interrupt.passedIds.length >= state.seats.length) {
      resolveInterrupt(state, nowMs)
    }
    recordAction(state, actionId)
    return { ok: true, state }
  }

  if (a.type === 'discard_cards') {
    if (state.phase !== 'discard_limit' || actorId !== state.discardActorId) return err(409, 'INVALID_PHASE')
    if (!Array.isArray(a.cardIds) || new Set(a.cardIds).size !== a.cardIds.length) return err(400, 'INVALID_REQUEST')
    if (seat.hand.length - a.cardIds.length !== HAND_LIMIT) return err(400, 'MUST_KEEP_TWELVE')
    const drop = new Set(a.cardIds)
    const dropped = seat.hand.filter((c) => drop.has(c.id))
    if (dropped.length !== a.cardIds.length) return err(400, 'CARD_NOT_FOUND')
    seat.hand = seat.hand.filter((c) => !drop.has(c.id))
    state.discard.push(...dropped)
    state.turnPlayerId = state.discardNextTurnId ?? nextSeatId(state.seats, actorId)
    state.discardActorId = null
    state.discardNextTurnId = null
    state.phase = 'turn_choice'
    state.revision += 1
    recordAction(state, actionId)
    return { ok: true, state }
  }

  return err(400, 'INVALID_REQUEST')
}

export function removeBossPlayer(inputState, leavingId, nowMs = Date.now()) {
  const state = cloneState(inputState)
  const idx = state.seats.findIndex((s) => s.id === leavingId)
  if (idx === -1) return state
  const nextTurn = nextSeatId(state.seats, leavingId)
  const [removed] = state.seats.splice(idx, 1)
  state.availableInvestors.push(...removed.investors)
  state.discard.push(...removed.hand)
  if (state.deal) {
    state.deal.tableCards = state.deal.tableCards.filter((tc) => tc.ownerId !== leavingId)
    state.deal.acceptedIds = state.deal.acceptedIds.filter((id) => id !== leavingId)
    delete state.deal.allocation[leavingId]
    if (state.deal.bossId === leavingId && state.seats.length > 0) {
      state.deal.bossId = nextTurn
      state.deal.closingDeadlineAt = null
      if (state.phase === 'closing') state.phase = 'negotiating'
    }
  }
  if (state.interrupt) {
    if (state.interrupt.actorId === leavingId) {
      state.phase = state.interrupt.resumePhase
      state.interrupt = null
    } else {
      state.interrupt.passedIds = state.interrupt.passedIds.filter((id) => id !== leavingId)
      if (state.interrupt.passedIds.length >= state.seats.length && state.seats.length > 0) {
        resolveInterrupt(state, nowMs)
      }
    }
  }
  if (state.turnPlayerId === leavingId && state.seats.length > 0) state.turnPlayerId = nextTurn
  if (state.markerChooserId === leavingId && state.seats.length > 0) state.markerChooserId = nextTurn
  if (state.firstPlayerId === leavingId && state.seats.length > 0) state.firstPlayerId = nextTurn
  if (state.discardActorId === leavingId && state.seats.length > 0) {
    state.discardActorId = null
    state.turnPlayerId = state.discardNextTurnId ?? nextTurn
    state.phase = 'turn_choice'
  }
  if (state.seats.length < 3 && state.phase !== 'game_over') {
    state.phase = 'game_over'
    state.deal = null
    state.interrupt = null
    state.winnerIds = state.seats.length ? computeWinners(state.seats) : []
    addEvent(state, 'game_ended', leavingId, nowMs)
  } else {
    state.revision += 1
  }
  return state
}

export function projectBossView(state, viewerId, board) {
  const placard = board.dealPlacards.find((p) => p.number === Math.min(15, state.currentDealNumber))
  const revealAllCash = state.phase === 'game_over'
  const mySeat = state.seats.find((s) => s.id === viewerId)
  return {
    revision: state.revision,
    phase: state.phase,
    turnPlayerId: state.turnPlayerId,
    markerChooserId: state.markerChooserId,
    markerSpace: state.markerSpace,
    lastRoll: state.lastRoll,
    currentDealNumber: state.currentDealNumber,
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
      exactCash: s.id === viewerId || revealAllCash ? s.cash : null,
    })),
    deal: state.deal,
    interrupt: state.interrupt,
    lastEndRoll: state.lastEndRoll,
    myHand: mySeat ? [...mySeat.hand] : [],
    discardPendingCount: state.phase === 'discard_limit' && state.discardActorId === viewerId && mySeat ? Math.max(0, mySeat.hand.length - HAND_LIMIT) : 0,
    events: state.events.slice(-12),
    winnerIds: state.winnerIds,
  }
}
