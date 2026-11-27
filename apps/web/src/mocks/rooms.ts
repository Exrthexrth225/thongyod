// In-memory game rooms for the mock API (provisional contract, DECISIONS #76 / #79 / #134, docs/HANDOFF.md).
// DEMO ONLY: each browser has its own mock, so two real phones cannot meet here. To show the flow,
// a few mock friends join a new room by themselves and play along. The real server keeps shared state.
import type { BossActionRequest, BossRoomSettings, PartyRoomSettings, Room, RoomGame, RoomPlayer, RoomState, SpyRoomSettings } from '@/api/types'
import { MOST_LIKELY, NEVER_HAVE } from '@/config/games/party'
import { SPY_PAIRS, SPY_PLACES } from '@/config/games/spy'
import { cardsOf } from '@/features/party/logic'
import { START_FINGERS, allVoted, foldFingers, tally, validVote, type PartyGame } from '@/features/party/roomLogic'
import { dealSpy, maxSpies } from '@/features/spy/logic'
import { spyPool } from '@/features/spy/settings'
import { secureRandomInt, shuffle } from '@/lib/random'
import bossBoardJson from '@thongyod/shared/content/boss-board.json'
import {
  activeTeamProviders,
  applyBossAction,
  canCloseDeal,
  createBossGame,
  projectBossView,
  removeBossPlayer,
  resolveBossDeadlines,
  type BossBoardDefinition,
  type BossInternalState,
} from '@thongyod/shared/content/boss-engine.mjs'
import { mockPlayerId as ME, mockRoomPerson as person } from './auth'

const bossBoard = bossBoardJson as BossBoardDefinition
export const MAX_PLAYERS = 12
const ROOM_TTL_MS = 3 * 3_600_000
/** Mock friends who "join" a room I create, and when (ms). */
const DEMO_JOINERS: [string, number][] = [['u2', 1200], ['u3', 2400], ['u5', 3800], ['u4', 5200]]
const ROOM_GAMES: RoomGame[] = ['spy', 'mostLikely', 'neverHave', 'boss']
const MIN_PLAYERS: Record<RoomGame, number> = { spy: 3, mostLikely: 3, neverHave: 2, boss: 3 }

type SpyState = { settings: SpyRoomSettings; round: { number: number; startedAt: string; endsAt: string; firstPlayerId: string; spies: string[]; secret: string; spyWord: string | null } | null }
type PartyState = {
  settings: PartyRoomSettings
  /** Cards not used yet in this room. */
  deck: { pack: string; text: string }[]
  round: { number: number; card: string; pack: string; votes: Map<string, string>; shown: boolean } | null
  fingers: Record<string, number> | null
}

type Internal = {
  code: string
  game: RoomGame
  hostId: string
  playerIds: string[]
  state: RoomState
  createdAt: number
  spy: SpyState
  party: PartyState
  bossSettings: BossRoomSettings
  boss: BossInternalState | null
  bossBotTimer?: ReturnType<typeof setTimeout>
}

const rooms = new Map<string, Internal>()

export type RoomResult = { ok: true; room: Room } | { ok: false; status: number; code: string }

const notFound = { ok: false as const, status: 404, code: 'ROOM_NOT_FOUND' }
const hostOnly = { ok: false as const, status: 403, code: 'HOST_ONLY' }
const packsOf = (game: PartyGame) => (game === 'mostLikely' ? MOST_LIKELY : NEVER_HAVE)

function newCode(): string {
  for (;;) {
    const code = String(100000 + secureRandomInt(900000))
    if (!rooms.has(code)) return code
  }
}

function view(r: Internal, me: string): Room {
  const joined = r.playerIds.includes(me)
  const base = {
    code: r.code,
    state: r.state,
    hostId: r.hostId,
    players: r.playerIds.map((id): RoomPlayer => ({ ...person(id), isHost: id === r.hostId })),
    maxPlayers: r.game === 'boss' ? 6 : MAX_PLAYERS,
    joined,
    expiresAt: new Date(r.createdAt + ROOM_TTL_MS).toISOString(),
  }
  if (r.game === 'spy') {
    const round = r.spy.round
    let mySecret = null
    if (joined && round) {
      const isSpy = round.spies.includes(me)
      mySecret = { isSpy, text: r.spy.settings.mode === 'places' ? (isSpy ? null : round.secret) : isSpy ? round.spyWord : round.secret }
    }
    return {
      ...base,
      game: 'spy',
      settings: r.spy.settings,
      mySecret,
      round: round
        ? { number: round.number, startedAt: round.startedAt, endsAt: round.endsAt, firstPlayerId: round.firstPlayerId, reveal: r.state === 'revealed' ? { spyIds: round.spies, secret: round.secret, spyWord: round.spyWord } : null }
        : null,
    }
  }
  if (r.game === 'boss') {
    return {
      ...base,
      game: 'boss',
      settings: r.bossSettings,
      boss: r.boss ? projectBossView(r.boss, me, bossBoard) : null,
    }
  }
  const round = r.party.round
  return {
    ...base,
    game: r.game,
    settings: r.party.settings,
    fingers: r.party.fingers,
    round: round
      ? {
          number: round.number,
          card: round.card,
          pack: round.pack,
          votedIds: [...round.votes.keys()],
          myVote: round.votes.get(me) ?? null,
          result: round.shown ? tally(r.game, round.votes) : null,
        }
      : null,
  }
}

function cleanSpy(raw: Partial<SpyRoomSettings> | undefined): SpyRoomSettings {
  const mode = raw?.mode === 'pairs' ? 'pairs' : 'places'
  const valid = (mode === 'places' ? SPY_PLACES : SPY_PAIRS).map((p) => p.id as string)
  const packs = (raw?.packs ?? []).filter((id) => valid.includes(id))
  const minutes = raw?.minutes === 3 || raw?.minutes === 8 ? raw.minutes : 5
  return { mode, minutes, spies: Math.max(1, Math.min(3, Math.round(raw?.spies ?? 1))), packs: packs.length ? packs : valid }
}

function cleanParty(game: PartyGame, raw: Partial<PartyRoomSettings> | undefined): PartyRoomSettings {
  const valid = packsOf(game).map((p) => p.id as string)
  const packs = (raw?.packs ?? []).filter((id) => valid.includes(id))
  return { packs: packs.length ? packs : valid }
}

function cleanBoss(raw: Partial<BossRoomSettings> | undefined): BossRoomSettings {
  return { closingSeconds: raw?.closingSeconds === 15 ? 15 : 10 }
}

function emptyParty(): PartyState {
  return { settings: { packs: [] }, deck: [], round: null, fingers: null }
}

function syncBossState(r: Internal) {
  if (r.game !== 'boss' || !r.boss) return
  const res = resolveBossDeadlines(r.boss, bossBoard, secureRandomInt)
  if (res.changed) {
    r.boss = res.state
    if (r.boss.phase === 'game_over') r.state = 'revealed'
  }
}

function scheduleBossBots(r: Internal) {
  if (r.bossBotTimer) {
    clearTimeout(r.bossBotTimer)
    r.bossBotTimer = undefined
  }
  if (r.game !== 'boss' || !r.boss || r.boss.phase === 'game_over') return
  const b = r.boss
  const bots = b.seats.filter((s) => s.id !== ME)
  if (!bots.length) return

  const runBot = (actorId: string, action: BossActionRequest['action']) => {
    const out = applyBossAction(r.boss!, actorId, { action }, bossBoard, secureRandomInt)
    if (out.ok) {
      r.boss = out.state
      if (r.boss.phase === 'game_over') r.state = 'revealed'
      scheduleBossBots(r)
    }
  }

  if (b.phase === 'pick_start' && b.markerChooserId !== ME) {
    r.bossBotTimer = setTimeout(() => runBot(b.markerChooserId, { type: 'pick_start', spaceIndex: secureRandomInt(16) }), 1100)
    return
  }
  if (b.phase === 'turn_choice' && b.turnPlayerId !== ME) {
    const space = b.spaces[b.markerSpace ?? 0]
    const bot = b.seats.find((s) => s.id === b.turnPlayerId)!
    const matchCount = space ? [...space.required, ...space.optional].filter((t) => bot.investors.includes(t)).length : 0
    const openNow = matchCount >= 2 && secureRandomInt(10) < 4
    r.bossBotTimer = setTimeout(() => runBot(b.turnPlayerId, openNow ? { type: 'open_deal' } : { type: 'roll_die' }), 1300)
    return
  }
  if (b.phase === 'rolled_choice' && b.turnPlayerId !== ME) {
    const space = b.spaces[b.markerSpace ?? 0]
    const bot = b.seats.find((s) => s.id === b.turnPlayerId)!
    const matchCount = space ? [...space.required, ...space.optional].filter((t) => bot.investors.includes(t)).length : 0
    const shouldDeal = matchCount >= 1 && secureRandomInt(10) < 6
    r.bossBotTimer = setTimeout(() => runBot(b.turnPlayerId, shouldDeal ? { type: 'open_deal' } : { type: 'draw_cards' }), 1300)
    return
  }
  if (b.phase === 'discard_limit' && b.discardActorId && b.discardActorId !== ME) {
    const bot = b.seats.find((s) => s.id === b.discardActorId)!
    const excess = bot.hand.slice(0, Math.max(0, bot.hand.length - 12)).map((c) => c.id)
    r.bossBotTimer = setTimeout(() => runBot(b.discardActorId!, { type: 'discard_cards', cardIds: excess }), 900)
    return
  }
  if (b.phase === 'interrupt' && b.interrupt) {
    const intr = b.interrupt
    const pendingBot = bots.find((s) => !intr.passedIds.includes(s.id))
    if (pendingBot) {
      const stopCard = pendingBot.hand.find((c) => c.kind === 'stop')
      if (stopCard && pendingBot.id !== intr.lastActorId && intr.stopCount === 0 && secureRandomInt(10) < 3) {
        r.bossBotTimer = setTimeout(() => runBot(pendingBot.id, { type: 'play_stop', cardId: stopCard.id }), 1200)
      } else {
        r.bossBotTimer = setTimeout(() => runBot(pendingBot.id, { type: 'pass_interrupt' }), 1000)
      }
      return
    }
    const leftMs = Math.max(250, Date.parse(intr.deadlineAt) - Date.now() + 80)
    r.bossBotTimer = setTimeout(() => {
      syncBossState(r)
      scheduleBossBots(r)
    }, leftMs)
    return
  }
  if (b.phase === 'closing' && b.deal?.closingDeadlineAt) {
    const leftMs = Math.max(250, Date.parse(b.deal.closingDeadlineAt) - Date.now() + 80)
    r.bossBotTimer = setTimeout(() => {
      syncBossState(r)
      scheduleBossBots(r)
    }, leftMs)
    return
  }
  if (b.phase === 'negotiating' && b.deal) {
    const deal = b.deal
    const providers = activeTeamProviders(b)
    const space = b.spaces[deal.spaceIndex]
    const allNeededTeams = [...space.required, ...space.optional]
    // Bot plays a helpful Team card if it has one that is missing!
    for (const bot of bots) {
      const helpful = bot.hand.find((c) => c.kind === 'team' && allNeededTeams.includes(c.team) && !(providers[c.team]?.length))
      if (helpful && helpful.kind === 'team') {
        r.bossBotTimer = setTimeout(() => runBot(bot.id, { type: 'play_team', cardId: helpful.id }), 1300)
        return
      }
    }
    const sum = Object.values(deal.allocation).reduce((x, y) => x + y, 0)
    if (sum === deal.totalValue) {
      // Bots who haven't accepted yet accept if they got a share or aren't holding required teams for free
      const waitingBot = bots.find((bot) => !deal.acceptedIds.includes(bot.id) && ((deal.allocation[bot.id] ?? 0) > 0 || space.required.some((t) => providers[t]?.includes(bot.id) && (deal.allocation[bot.id] ?? 0) > 0)))
      if (waitingBot) {
        r.bossBotTimer = setTimeout(() => runBot(waitingBot.id, { type: 'accept_offer' }), 1100)
        return
      }
      if (deal.bossId !== ME) {
        if (canCloseDeal(b).ok) {
          r.bossBotTimer = setTimeout(() => runBot(deal.bossId, { type: 'start_closing' }), 1200)
          return
        }
        // Check if human needs to accept or if deal is impossible
        const missingReq = space.required.some((t) => !(providers[t]?.length))
        const totalAvailTeams = allNeededTeams.filter((t) => (providers[t]?.length ?? 0) > 0).length
        if (missingReq || totalAvailTeams < space.teamCount) {
          r.bossBotTimer = setTimeout(() => runBot(deal.bossId, { type: 'fail_deal' }), 1800)
          return
        }
      }
    } else if (deal.bossId !== ME) {
      const missingReq = space.required.some((t) => !(providers[t]?.length))
      const totalAvailTeams = allNeededTeams.filter((t) => (providers[t]?.length ?? 0) > 0).length
      if (missingReq || totalAvailTeams < space.teamCount) {
        r.bossBotTimer = setTimeout(() => runBot(deal.bossId, { type: 'fail_deal' }), 1800)
        return
      }
      // Build a fair split across active participants + Boss!
      const participants = new Set<string>([deal.bossId])
      for (const t of space.required) for (const id of providers[t] ?? []) participants.add(id)
      for (const t of space.optional) {
        if (participants.size >= space.teamCount + 1) break
        for (const id of providers[t] ?? []) participants.add(id)
      }
      const list = [...participants]
      const units = Math.floor(deal.totalValue / 1_000_000)
      const base = Math.floor(units / list.length) * 1_000_000
      const rem = (units % list.length) * 1_000_000
      const allocation: Record<string, number> = {}
      list.forEach((id) => {
        allocation[id] = base + (id === deal.bossId ? rem : 0)
      })
      r.bossBotTimer = setTimeout(() => runBot(deal.bossId, { type: 'set_allocation', allocation }), 1400)
    }
  }
}

export function createRoom(game: string, settings: Record<string, unknown> | undefined): RoomResult {
  if (!ROOM_GAMES.includes(game as RoomGame)) return { ok: false, status: 400, code: 'INVALID_REQUEST' }
  const g = game as RoomGame
  const room: Internal = {
    code: newCode(),
    game: g,
    hostId: ME,
    playerIds: [ME],
    state: 'lobby',
    createdAt: Date.now(),
    spy: { settings: cleanSpy(settings as Partial<SpyRoomSettings>), round: null },
    party: emptyParty(),
    bossSettings: cleanBoss(settings as Partial<BossRoomSettings>),
    boss: null,
  }
  if (g !== 'spy' && g !== 'boss') room.party.settings = cleanParty(g, settings as Partial<PartyRoomSettings>)
  rooms.set(room.code, room)
  const joiners = g === 'boss' ? DEMO_JOINERS.slice(0, 3) : DEMO_JOINERS
  for (const [id, ms] of joiners) setTimeout(() => room.state === 'lobby' && !room.playerIds.includes(id) && room.playerIds.push(id), ms)
  return { ok: true, room: view(room, ME) }
}

export function getRoom(code: string): RoomResult {
  const r = rooms.get(code)
  if (!r) return notFound
  syncBossState(r)
  return { ok: true, room: view(r, ME) }
}

export function joinRoom(code: string): RoomResult {
  const r = rooms.get(code)
  if (!r) return notFound
  if (!r.playerIds.includes(ME)) {
    if (r.state !== 'lobby') return { ok: false, status: 409, code: 'ROOM_STARTED' }
    const cap = r.game === 'boss' ? 6 : MAX_PLAYERS
    if (r.playerIds.length >= cap) return { ok: false, status: 409, code: 'ROOM_FULL' }
    r.playerIds.push(ME)
  }
  return { ok: true, room: view(r, ME) }
}

export function leaveRoom(code: string): RoomResult {
  const r = rooms.get(code)
  if (!r) return notFound
  r.playerIds = r.playerIds.filter((id) => id !== ME)
  if (r.hostId === ME && r.playerIds.length) r.hostId = r.playerIds[0]
  if (r.game === 'boss' && r.boss) {
    r.boss = removeBossPlayer(r.boss, ME)
    if (r.boss.phase === 'game_over') r.state = 'revealed'
  }
  if (!r.playerIds.length) {
    if (r.bossBotTimer) clearTimeout(r.bossBotTimer)
    rooms.delete(code)
  }
  return { ok: true, room: view(r, ME) }
}

export function updateSettings(code: string, settings: Record<string, unknown>): RoomResult {
  const r = rooms.get(code)
  if (!r) return notFound
  if (r.hostId !== ME) return hostOnly
  if (r.game === 'boss') {
    r.bossSettings = cleanBoss({ ...r.bossSettings, ...(settings as Partial<BossRoomSettings>) })
  } else if (r.game === 'spy') {
    const s = settings as Partial<SpyRoomSettings>
    const cur = r.spy.settings
    r.spy.settings = cleanSpy({ ...cur, ...s, packs: s.mode && s.mode !== cur.mode ? [] : (s.packs ?? cur.packs) })
  } else {
    r.party.settings = cleanParty(r.game, { ...r.party.settings, ...(settings as Partial<PartyRoomSettings>) })
    r.party.deck = []
  }
  return { ok: true, room: view(r, ME) }
}

/** Mock friends answer a party card after a short think. */
function botsAnswer(r: Internal, game: PartyGame, roundNo: number) {
  for (const id of r.playerIds) {
    if (id === ME) continue
    setTimeout(
      () => {
        const round = r.party.round
        if (!round || round.number !== roundNo || round.shown || !r.playerIds.includes(id)) return
        const choice = game === 'mostLikely' ? r.playerIds[secureRandomInt(r.playerIds.length)] : secureRandomInt(5) < 2 ? 'have' : 'never'
        round.votes.set(id, choice)
        finishIfAll(r)
      },
      900 + secureRandomInt(2600),
    )
  }
}

function finishIfAll(r: Internal) {
  const round = r.party.round
  if (!round || round.shown || r.game === 'spy' || r.game === 'boss') return
  if (allVoted(r.playerIds, round.votes)) showResult(r)
}

function showResult(r: Internal) {
  const round = r.party.round
  if (!round || r.game === 'spy' || r.game === 'boss') return
  round.shown = true
  r.state = 'revealed'
  if (r.game === 'neverHave') r.party.fingers = foldFingers(r.party.fingers ?? {}, tally('neverHave', round.votes).haveIds)
}

/** Host starts (or deals the next) round. */
export function startRound(code: string): RoomResult {
  const r = rooms.get(code)
  if (!r) return notFound
  if (r.hostId !== ME) return hostOnly
  if (r.playerIds.length < MIN_PLAYERS[r.game]) return { ok: false, status: 409, code: 'NOT_ENOUGH_PLAYERS' }
  if (r.game === 'boss') {
    if (r.playerIds.length > 6) return { ok: false, status: 409, code: 'TOO_MANY_PLAYERS' }
    r.boss = createBossGame(r.playerIds, r.bossSettings, bossBoard, secureRandomInt)
    r.state = 'playing'
    scheduleBossBots(r)
    return { ok: true, room: view(r, ME) }
  }
  if (r.game === 'spy') {
    const s = r.spy.settings
    const pool = spyPool(s.mode, s.packs)
    const item = pool[secureRandomInt(pool.length)]
    const deal = dealSpy({ players: r.playerIds.length, spies: Math.min(s.spies, maxSpies(r.playerIds.length)), mode: s.mode, item })
    const now = Date.now()
    r.spy.round = {
      number: (r.spy.round?.number ?? 0) + 1,
      startedAt: new Date(now).toISOString(),
      endsAt: new Date(now + s.minutes * 60_000).toISOString(),
      firstPlayerId: r.playerIds[deal.first],
      spies: r.playerIds.filter((_, i) => deal.spies[i]),
      secret: deal.secret,
      spyWord: deal.spyWord,
    }
  } else {
    const p = r.party
    if (!p.deck.length) p.deck = shuffle(cardsOf(packsOf(r.game), p.settings.packs))
    const card = p.deck.shift()!
    if (r.game === 'neverHave' && !p.fingers) p.fingers = Object.fromEntries(r.playerIds.map((id) => [id, START_FINGERS]))
    p.round = { number: (p.round?.number ?? 0) + 1, card: card.text, pack: card.pack, votes: new Map(), shown: false }
    botsAnswer(r, r.game, p.round.number)
  }
  r.state = 'playing'
  return { ok: true, room: view(r, ME) }
}

export function bossAction(code: string, body: BossActionRequest | null): RoomResult {
  const r = rooms.get(code)
  if (!r) return notFound
  if (r.game !== 'boss' || !r.boss || r.state === 'lobby') return { ok: false, status: 409, code: 'NO_ROUND' }
  if (!r.playerIds.includes(ME)) return { ok: false, status: 403, code: 'NOT_IN_ROOM' }
  if (!body) return { ok: false, status: 400, code: 'INVALID_REQUEST' }
  const outcome = applyBossAction(r.boss, ME, body, bossBoard, secureRandomInt)
  if (!outcome.ok) return { ok: false, status: outcome.status, code: outcome.code }
  r.boss = outcome.state
  if (r.boss.phase === 'game_over') r.state = 'revealed'
  scheduleBossBots(r)
  return { ok: true, room: view(r, ME) }
}

/** An answer to the current party card (can be changed until the result shows). */
export function vote(code: string, choice: unknown): RoomResult {
  const r = rooms.get(code)
  if (!r) return notFound
  if (r.game === 'spy' || r.game === 'boss' || !r.party.round || r.state !== 'playing') return { ok: false, status: 409, code: 'NO_ROUND' }
  if (!r.playerIds.includes(ME)) return { ok: false, status: 403, code: 'NOT_IN_ROOM' }
  if (typeof choice !== 'string' || !validVote(r.game, choice, r.playerIds)) return { ok: false, status: 400, code: 'INVALID_REQUEST' }
  r.party.round.votes.set(ME, choice)
  finishIfAll(r)
  return { ok: true, room: view(r, ME) }
}

export function revealRound(code: string): RoomResult {
  const r = rooms.get(code)
  if (!r) return notFound
  if (r.hostId !== ME) return hostOnly
  if (r.game === 'boss') return { ok: false, status: 409, code: 'NO_ROUND' }
  if (r.game === 'spy') {
    if (!r.spy.round) return { ok: false, status: 409, code: 'NO_ROUND' }
    r.state = 'revealed'
  } else {
    if (!r.party.round) return { ok: false, status: 409, code: 'NO_ROUND' }
    showResult(r)
  }
  return { ok: true, room: view(r, ME) }
}

/** Back to the lobby: round cleared, ไม่เคย… fingers reset. */
export function backToLobby(code: string): RoomResult {
  const r = rooms.get(code)
  if (!r) return notFound
  if (r.hostId !== ME) return hostOnly
  if (r.bossBotTimer) {
    clearTimeout(r.bossBotTimer)
    r.bossBotTimer = undefined
  }
  r.state = 'lobby'
  r.spy.round = null
  r.party.round = null
  r.party.fingers = null
  r.boss = null
  return { ok: true, room: view(r, ME) }
}

/** Rooms someone else hosts, so the "ชวนเล่น" notification and joining by code can be tried in the demo. */
function seed(code: string, game: RoomGame) {
  const r: Internal = {
    code,
    game,
    hostId: 'u2',
    playerIds: ['u2', 'u3', 'u5'],
    state: 'lobby',
    createdAt: Date.now(),
    spy: { settings: cleanSpy({ mode: 'pairs' }), round: null },
    party: emptyParty(),
    bossSettings: { closingSeconds: 10 },
    boss: null,
  }
  if (game !== 'spy' && game !== 'boss') r.party.settings = cleanParty(game, undefined)
  rooms.set(code, r)
}
seed('482913', 'spy')
seed('305117', 'mostLikely')
seed('777888', 'boss')

/** Exit all rooms when the demo identity logs out. No real backend is contacted. */
export function logoutPlayer(id: string): void {
  for (const r of rooms.values()) {
    r.playerIds = r.playerIds.filter((player) => player !== id)
    if (r.hostId === id) r.hostId = r.playerIds[0] ?? ''
    if (r.game === 'boss' && r.boss) {
      r.boss = removeBossPlayer(r.boss, id)
      if (r.boss.phase === 'game_over') r.state = 'revealed'
    }
    if (r.party.round && !r.party.round.shown) {
      r.party.round.votes.delete(id)
      for (const [voter, choice] of r.party.round.votes) if (choice === id) r.party.round.votes.delete(voter)
    }
    if (r.party.fingers) delete r.party.fingers[id]
    if (!r.playerIds.length) {
      if (r.bossBotTimer) clearTimeout(r.bossBotTimer)
      rooms.delete(codeOf(r))
    }
  }
}

function codeOf(r: Internal) {
  return r.code
}
