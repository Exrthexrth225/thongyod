import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { IncomingMessage } from 'node:http'
import type { PoolClient } from 'pg'
import type { BossActionPayload, BossRestartVote, BossRoomSettings, PartyRoomSettings, Room, RoomBoard, RoomBoardSession, RoomBoardStatus, RoomCommand, RoomCommandResult, RoomGame, RoomPlayer, RoomState, SpyRoomSettings } from '@thongyod/shared'
import { RoomGuestService, type RoomActor } from '../auth/room-guest.service.js'
import { BOARD_COOKIE, readBoardCookie, readGuestCookie, readSessionCookie, sessionHash } from '../auth/cookie.js'
import { secureCookie } from '../auth/policy.js'
import { DatabaseService } from '../db/database.service.js'
import { payloadHash, RoomEvents, RoomPresence } from './room-support.js'
import {
  applyBossAction, bossDeadline, createBossGame, draftRandomRest, investorChoices, projectBossView, removeBossPlayer, resolveBossDeadlines, skipBossPlayer,
  type BossBoardDefinition, type BossInternalState,
} from '@thongyod/shared/content/boss-engine.mjs'

const content = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@thongyod/shared/content/room-games.json'), 'utf8')) as {
  spyPlaces: { id: string; items: string[] }[]; spyPairs: { id: string; items: [string, string][] }[]; mostLikely: { id: string; cards: string[] }[]; neverHave: { id: string; cards: string[] }[]
}
const bossBoard = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@thongyod/shared/content/boss-board.json'), 'utf8')) as BossBoardDefinition

type SpyRound = { number: number; startedAt: string; endsAt: string; firstPlayerId: string; spies: string[]; secret: string; spyWord: string | null; timeUp?: boolean }
type PartyRound = { number: number; card: string; pack: string; votes: Record<string, string>; result: { tally: Record<string, number>; haveIds: string[] } | null }
/** Server-only room state, stored as JSON in game_rooms.data. Never sent to a client as is. */
type Internal = {
  code: string; game: RoomGame; hostId: string; playerIds: string[]; state: RoomState; expiresAt: string
  settings: SpyRoomSettings | PartyRoomSettings | BossRoomSettings; spy: SpyRound | null; party: PartyRound | null; deck: { pack: string; text: string }[]
  fingers: Record<string, number> | null
  /** Changes when the host goes back to the room: commands for an earlier match are rejected. Older rows have none. */
  matchId?: string
  /** Players the owner turned into the Board Screen: their next board request is approved at once. */
  boardInvites?: string[]
  /** I'm the Boss! state (engine-owned). */
  boss?: BossInternalState | null
  /** Restart vote (I'm the Boss!). */
  restart?: BossRestartVote | null
  restartCooldownUntil?: string | null
}
type Loaded = { room: Internal; revision: number }
type People = Map<string, { userId: string; displayName: string; avatarUrl: string | null; isGuest?: true }>
export type RoomViewer = { kind: 'seat'; playerId: string } | { kind: 'board'; boardId: string }
type Change = { result: unknown; changed?: string; closed?: string }

const MAX_PLAYERS = 12
const BOSS_PLAYERS = 6
const ROOM_MS = 3 * 60 * 60 * 1000
const HOST_AWAY_MS = 2 * 60 * 1000
const BOARD_PENDING_MS = 2 * 60 * 1000
const RESTART_VOTE_MS = 30 * 1000
const RESTART_COOLDOWN_MS = 60 * 1000
const MAX_BOARDS = 2
const LABEL_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
/** Commands that act inside a match must name the phase they were made in. */
const PHASED = new Set(['start', 'reveal', 'lobby', 'vote'])
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

const invalid = () => new BadRequestException({ error: { code: 'INVALID_REQUEST' } })
const unavailable = () => new ServiceUnavailableException({ error: { code: 'ROOMS_UNAVAILABLE' } })
const notFound = () => new NotFoundException({ error: { code: 'ROOM_NOT_FOUND' } })
const conflict = (code: string) => new ConflictException({ error: { code } })

function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) { const j = randomInt(i + 1); [result[i], result[j]] = [result[j], result[i]] }
  return result
}
function object(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid()
  return body as Record<string, unknown>
}
function errorCode(error: HttpException): string {
  const body = error.getResponse() as { error?: { code?: string } }
  return body?.error?.code ?? 'ERROR'
}
function settings(game: RoomGame, raw: unknown, current?: Internal['settings']): Internal['settings'] {
  const b = object(raw ?? {}), spy = game === 'spy'
  if (game === 'boss') {
    const old = current as BossRoomSettings | undefined
    if (Object.keys(b).some((k) => !['short', 'investorsEach', 'draft'].includes(k)) || (b.short !== undefined && typeof b.short !== 'boolean')) throw invalid()
    if (b.investorsEach !== undefined && b.investorsEach !== null && (!Number.isInteger(b.investorsEach) || Number(b.investorsEach) < 1 || Number(b.investorsEach) > 2)) throw invalid()
    if (b.draft !== undefined && !['random', 'snake'].includes(String(b.draft))) throw invalid()
    const each = b.investorsEach === null ? undefined : (b.investorsEach as number | undefined) ?? old?.investorsEach
    return { short: (b.short as boolean | undefined) ?? old?.short ?? false, ...(each ? { investorsEach: each } : {}), draft: (b.draft as 'random' | 'snake' | undefined) ?? old?.draft ?? 'random' }
  }
  if (Object.keys(b).some((k) => !(spy ? ['mode', 'minutes', 'spies', 'packs'] : ['packs']).includes(k))) throw invalid()
  const old = current as SpyRoomSettings | undefined
  const mode = b.mode ?? old?.mode ?? 'places', minutes = b.minutes ?? old?.minutes ?? 5, spies = b.spies ?? old?.spies ?? 1
  if (spy && (!['places', 'pairs'].includes(String(mode)) || ![3, 5, 8].includes(Number(minutes)) || typeof minutes !== 'number' || !Number.isInteger(spies) || Number(spies) < 1 || Number(spies) > 3)) throw invalid()
  const valid = (spy ? (mode === 'places' ? content.spyPlaces : content.spyPairs) : content[game as 'mostLikely' | 'neverHave']).map((p) => p.id)
  const rawPacks = b.packs ?? (spy && old?.mode !== mode ? valid : (current as PartyRoomSettings | undefined)?.packs ?? valid)
  if (!Array.isArray(rawPacks) || rawPacks.length > valid.length || rawPacks.some((p) => typeof p !== 'string' || !valid.includes(p)) || new Set(rawPacks).size !== rawPacks.length) throw invalid()
  const packs = rawPacks.length ? rawPacks : valid
  return spy ? { mode: mode as 'places' | 'pairs', minutes: minutes as 3 | 5 | 8, spies: Number(spies), packs } : { packs }
}

export const phaseOf = (r: Internal) => `${r.matchId ?? 'm0'}:${r.state}:${r.spy?.number ?? r.party?.number ?? 0}`

/** Earliest moment the server must act on its own: the spy timer, else room expiry. */
function deadlineOf(r: Internal): string {
  if (r.state === 'playing' && r.spy && !r.spy.timeUp && r.spy.endsAt < r.expiresAt) return r.spy.endsAt
  const due = [r.expiresAt]
  if (r.state === 'playing' && r.boss) { const boss = bossDeadline(r.boss); if (boss) due.push(boss) }
  if (r.restart) due.push(r.restart.deadlineAt)
  return due.sort()[0]
}

/** Engine refusals become the usual { error: { code } } HTTP errors. */
function bossResult<T>(result: { ok: true; state: T } | { ok: false; status: number; code: string }): T {
  if (result.ok) return result.state
  throw new HttpException({ error: { code: result.code } }, result.status)
}
/** A finished game shows its results like any other round. */
function bossSettle(r: Internal) {
  if (r.boss?.phase === 'game_over' && r.state === 'playing') r.state = 'revealed'
}

export function boardCookie(token = ''): string {
  return `${BOARD_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? ROOM_MS / 1000 : 0}${secureCookie() ? '; Secure' : ''}`
}

/**
 * Game rooms. One row per room in Neon holds the authoritative state; every change locks that row,
 * bumps `revision` and is published to sockets only after COMMIT (RoomEvents).
 */
@Injectable()
export class RoomsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly guests: RoomGuestService,
    private readonly events: RoomEvents,
    private readonly presence: RoomPresence,
  ) {}

  private async transaction<T>(work: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.database.connection.connect().catch(() => { throw unavailable() })
    try { await c.query('BEGIN'); const result = await work(c); await c.query('COMMIT'); return result }
    catch (e) { await c.query('ROLLBACK').catch(() => undefined); if (e instanceof HttpException) throw e; throw unavailable() }
    finally { c.release() }
  }

  /** Runs a change and tells the sockets once it has been committed. */
  private async change<T>(work: (c: PoolClient) => Promise<Change & { result: T }>): Promise<T> {
    const done = await this.transaction(work)
    if (done.closed) { this.presence.forget(done.closed); this.events.closed(done.closed) }
    else if (done.changed) this.events.changed(done.changed)
    return done.result
  }

  private async lock(c: PoolClient, code: string): Promise<Loaded> {
    if (!/^\d{6}$/.test(code)) throw notFound()
    const row = (await c.query<{ data: Internal; revision: string }>('SELECT data,revision FROM game_rooms WHERE code=$1 AND expires_at>clock_timestamp() FOR UPDATE', [code])).rows[0]
    if (!row) throw notFound()
    return { room: row.data, revision: Number(row.revision) }
  }

  /** Saves a changed room (or deletes it when nobody is left). Returns the new revision, or null when deleted. */
  private async save(c: PoolClient, r: Internal): Promise<number | null> {
    if (!r.playerIds.length) { await c.query('DELETE FROM game_rooms WHERE code=$1', [r.code]); return null }
    const row = await c.query<{ revision: string }>('UPDATE game_rooms SET data=$2,revision=revision+1,next_deadline=$3 WHERE code=$1 RETURNING revision', [r.code, JSON.stringify(r), deadlineOf(r)])
    return Number(row.rows[0].revision)
  }

  // ── Views ───────────────────────────────────────────────────────────────

  private async people(c: Pick<PoolClient, 'query'>, ids: string[]): Promise<People> {
    const rows = (await c.query<{ userId: string; displayName: string; avatarUrl: string | null }>('SELECT id AS "userId",display_name AS "displayName",avatar_url AS "avatarUrl" FROM users WHERE id=ANY($1::uuid[])', [ids])).rows
    const guests = (await c.query<{ userId: string; displayName: string }>('SELECT id AS "userId",display_name AS "displayName" FROM game_guest_sessions WHERE id=ANY($1::uuid[])', [ids])).rows
    return new Map([...rows.map((p) => [p.userId, p] as const), ...guests.map((g) => [g.userId, { ...g, avatarUrl: null, isGuest: true as const }] as const)])
  }

  private async boardList(c: Pick<PoolClient, 'query'>, code: string): Promise<RoomBoard[]> {
    return (await c.query<{ id: string; label: string; status: RoomBoardStatus; createdAt: Date }>(
      `SELECT id,label,status,created_at AS "createdAt" FROM game_room_boards WHERE room_code=$1 AND expires_at>clock_timestamp()
       AND (status='approved' OR (status='pending' AND created_at>clock_timestamp()-make_interval(secs=>$2))) ORDER BY created_at`, [code, BOARD_PENDING_MS / 1000],
    )).rows.map((b) => ({ ...b, createdAt: b.createdAt.toISOString() }))
  }

  /** What one viewer may see. Secrets are projected here, never filtered in the browser. */
  private render(r: Internal, revision: number, people: People, boards: RoomBoard[], viewer: RoomViewer): Room {
    const playerId = viewer.kind === 'seat' ? viewer.playerId : null
    const isBoard = viewer.kind === 'board'
    const joined = playerId !== null && r.playerIds.includes(playerId)
    const players = r.playerIds.flatMap((id) => {
      const person = people.get(id)
      return person ? [{ ...person, isHost: id === r.hostId } as RoomPlayer] : []
    })
    const base = {
      code: r.code, state: r.state, hostId: r.hostId, players, maxPlayers: MAX_PLAYERS, joined, expiresAt: r.expiresAt,
      revision, phase: phaseOf(r), isBoard,
      online: r.playerIds.filter((id) => this.presence.isOnline(r.code, id)),
      boards: playerId === r.hostId ? boards : [],
      canClaimHost: joined && playerId !== r.hostId && this.presence.awayFor(r.code, r.hostId) >= HOST_AWAY_MS,
      boardInvite: !!playerId && !joined && (r.boardInvites ?? []).includes(playerId),
    }
    if (r.game === 'boss') {
      return {
        ...base, maxPlayers: BOSS_PLAYERS, game: 'boss', settings: r.settings as BossRoomSettings,
        boss: r.boss && (joined || isBoard) ? projectBossView(r.boss, playerId ?? '', bossBoard) : null,
        boardOnline: boards.some((b) => b.status === 'approved' && this.presence.isOnline(r.code, `board:${b.id}`)),
        restart: r.restart ?? null,
        restartCooldownUntil: r.restartCooldownUntil ?? null,
      }
    }
    if (r.game === 'spy') {
      const s = r.settings as SpyRoomSettings, round = r.spy, isSpy = (playerId !== null && round?.spies.includes(playerId)) ?? false
      return {
        ...base, game: 'spy', settings: s,
        mySecret: joined && round ? { isSpy, text: s.mode === 'places' ? (isSpy ? null : round.secret) : isSpy ? round.spyWord : round.secret } : null,
        round: round ? {
          number: round.number, startedAt: round.startedAt, endsAt: round.endsAt, firstPlayerId: round.firstPlayerId, timeUp: round.timeUp ?? false,
          reveal: r.state === 'revealed' && (joined || isBoard) ? { spyIds: round.spies, secret: round.secret, spyWord: round.spyWord } : null,
        } : null,
      }
    }
    const round = r.party
    return {
      ...base, game: r.game as 'mostLikely' | 'neverHave', settings: r.settings as PartyRoomSettings, fingers: joined || isBoard ? r.fingers : null,
      round: round && (joined || isBoard) ? {
        number: round.number, card: round.card, pack: round.pack, votedIds: Object.keys(round.votes),
        myVote: playerId ? round.votes[playerId] ?? null : null, result: round.result,
      } : null,
    }
  }

  private async view(c: PoolClient, loaded: Loaded, viewer: RoomViewer): Promise<Room> {
    const [people, boards] = await Promise.all([this.people(c, loaded.room.playerIds), this.boardList(c, loaded.room.code)])
    return this.render(loaded.room, loaded.revision, people, boards, viewer)
  }

  /** Read once, render for many sockets. Null when the room is gone. */
  async snapshot(code: string): Promise<{ revision: number; render: (viewer: RoomViewer) => Room; board: (id: string) => { label: string; status: RoomBoardStatus } | null } | null> {
    const db = this.database.connection
    const row = (await db.query<{ data: Internal; revision: string }>('SELECT data,revision FROM game_rooms WHERE code=$1 AND expires_at>clock_timestamp()', [code])).rows[0]
    if (!row) return null
    const [people, boards, all] = await Promise.all([
      this.people(db, row.data.playerIds), this.boardList(db, code),
      db.query<{ id: string; label: string; status: RoomBoardStatus }>('SELECT id,label,status FROM game_room_boards WHERE room_code=$1', [code]),
    ])
    const revision = Number(row.revision)
    const known = new Map(all.rows.map((b) => [b.id, { label: b.label, status: b.status }]))
    return { revision, render: (viewer) => this.render(row.data, revision, people, boards, viewer), board: (id) => known.get(id) ?? null }
  }

  // ── Rules ───────────────────────────────────────────────────────────────

  private show(r: Internal) {
    const round = r.party
    if (r.game === 'spy') { if (!r.spy) throw conflict('NO_ROUND'); r.state = 'revealed'; return }
    if (!round) throw conflict('NO_ROUND')
    if (round.result) return
    const tally: Record<string, number> = Object.fromEntries(r.game === 'neverHave' ? ['have', 'never'].map((k) => [k, 0]) : r.playerIds.map((k) => [k, 0]))
    for (const v of Object.values(round.votes)) tally[v] = (tally[v] ?? 0) + 1
    const haveIds = r.game === 'neverHave' ? Object.entries(round.votes).filter(([, v]) => v === 'have').map(([id]) => id) : []
    round.result = { tally, haveIds }; r.state = 'revealed'
    if (r.fingers) for (const id of haveIds) r.fingers[id] = Math.max(0, (r.fingers[id] ?? 5) - 1)
  }

  /** Closes the restart vote when it passed, cannot pass any more, or ran out of time. Passing goes back to the lobby. */
  private settleRestart(r: Internal, timedOut = false) {
    const v = r.restart
    if (!v) return
    const open = v.voters.length - v.yes.length - v.no.length
    if (v.yes.length >= v.needed) {
      r.restart = null; r.restartCooldownUntil = null
      r.state = 'lobby'; r.boss = null; r.matchId = randomUUID()
    } else if (timedOut || v.yes.length + open < v.needed) {
      r.restart = null
      r.restartCooldownUntil = new Date(Date.now() + RESTART_COOLDOWN_MS).toISOString()
    }
  }

  private leave(r: Internal, viewer: string) {
    r.playerIds = r.playerIds.filter((id) => id !== viewer)
    if (r.hostId === viewer) r.hostId = r.playerIds[0] ?? viewer
    if (r.boss) { r.boss = removeBossPlayer(r.boss, viewer, randomInt, Date.now()); bossSettle(r) }
    if (r.party && !r.party.result) {
      delete r.party.votes[viewer]
      for (const [id, vote] of Object.entries(r.party.votes)) if (r.game === 'mostLikely' && vote === viewer) delete r.party.votes[id]
      if (r.playerIds.length && r.playerIds.every((id) => r.party!.votes[id])) this.show(r)
    }
    if (r.fingers) delete r.fingers[viewer]
  }

  /** Applies one command to the locked room. Throws an HttpException for a refused command. */
  private async apply(c: PoolClient, actor: RoomActor, r: Internal, type: string, body: unknown) {
    const viewer = actor.playerId, joined = r.playerIds.includes(viewer)
    if (type === 'join') {
      if (joined) return
      if (r.state !== 'lobby') throw conflict('ROOM_STARTED')
      if (r.playerIds.length >= (r.game === 'boss' ? BOSS_PLAYERS : MAX_PLAYERS)) throw conflict('ROOM_FULL')
      r.playerIds.push(viewer); if (r.fingers) r.fingers[viewer] = 5
      return
    }
    if (type === 'leave') { this.leave(r, viewer); return }
    if (!joined) throw new ForbiddenException({ error: { code: 'NOT_IN_ROOM' } })
    if (type === 'vote') {
      if (r.game === 'spy' || !r.party || r.state !== 'playing') throw conflict('NO_ROUND')
      const b = object(body), choice = b.choice
      if (Object.keys(b).some((k) => !['choice', 'roundNumber'].includes(k)) || typeof choice !== 'string' || !(r.game === 'neverHave' ? ['have', 'never'] : r.playerIds).includes(choice)) throw invalid()
      if (b.roundNumber !== undefined && b.roundNumber !== r.party.number) throw conflict('NO_ROUND')
      r.party.votes[viewer] = choice
      if (r.playerIds.every((id) => r.party!.votes[id])) this.show(r)
      return
    }
    if (type === 'boss') {
      if (r.game !== 'boss' || !r.boss || r.state !== 'playing') throw conflict('NO_ROUND')
      const b = object(body)
      if (Object.keys(b).length !== 1 || !b.action || typeof b.action !== 'object') throw invalid()
      r.boss = bossResult(applyBossAction(r.boss, viewer, { action: b.action as BossActionPayload }, bossBoard, randomInt, Date.now()))
      bossSettle(r)
      return
    }
    if (type === 'bossSkip') {
      // Anyone seated may carry on without an offline player who is holding the game up.
      if (r.game !== 'boss' || !r.boss || r.state !== 'playing') throw conflict('NO_ROUND')
      const b = object(body), target = b.targetId
      if (Object.keys(b).length !== 1 || typeof target !== 'string' || !r.playerIds.includes(target) || target === viewer) throw invalid()
      if (this.presence.isOnline(r.code, target)) throw conflict('PLAYER_ONLINE')
      r.boss = bossResult(skipBossPlayer(r.boss, target, randomInt, Date.now()))
      bossSettle(r)
      return
    }
    if (type === 'restartOpen') {
      if (r.game !== 'boss' || !r.boss || (r.state !== 'playing' && r.state !== 'revealed')) throw conflict('NO_ROUND')
      if (r.restart) throw conflict('VOTE_OPEN')
      if (r.restartCooldownUntil && r.restartCooldownUntil > new Date().toISOString()) throw conflict('VOTE_COOLDOWN')
      // Frozen: the seated players online right now. Leaving or dropping later does not lower the bar.
      const voters = r.playerIds.filter((id) => id === viewer || this.presence.isOnline(r.code, id))
      r.restart = { openedBy: viewer, voters, yes: [viewer], no: [], needed: Math.max(2, Math.floor(voters.length / 2) + 1), deadlineAt: new Date(Date.now() + RESTART_VOTE_MS).toISOString() }
      this.settleRestart(r)
      return
    }
    if (type === 'restartVote') {
      if (!r.restart) throw conflict('NO_VOTE')
      if (!r.restart.voters.includes(viewer)) throw new ForbiddenException({ error: { code: 'NOT_A_VOTER' } })
      const b = object(body)
      if (Object.keys(b).length !== 1 || typeof b.yes !== 'boolean') throw invalid()
      r.restart.yes = r.restart.yes.filter((id) => id !== viewer)
      r.restart.no = r.restart.no.filter((id) => id !== viewer)
      ;(b.yes ? r.restart.yes : r.restart.no).push(viewer)
      this.settleRestart(r)
      return
    }
    if (type === 'claimHost') {
      if (r.hostId === viewer) return
      if (this.presence.awayFor(r.code, r.hostId) < HOST_AWAY_MS) throw conflict('HOST_ACTIVE')
      r.hostId = viewer
      return
    }
    if (r.hostId !== viewer) throw new ForbiddenException({ error: { code: 'HOST_ONLY' } })
    if (type === 'boardApprove' || type === 'boardReject' || type === 'boardRevoke') { await this.decideBoard(c, r, type, body); return }
    if (type === 'makeBoard') {
      const b = object(body), target = b.targetId
      if (Object.keys(b).length !== 1 || typeof target !== 'string' || !r.playerIds.includes(target) || target === viewer) throw invalid()
      if (r.state !== 'lobby') throw conflict('ROOM_STARTED')
      this.leave(r, target)
      r.boardInvites = [...(r.boardInvites ?? []).filter((id) => id !== target), target]
      return
    }
    if (type === 'closeRoom') { r.playerIds = []; return }
    if (type === 'bossKick') {
      if (r.game !== 'boss' || !r.boss || r.state !== 'playing') throw conflict('NO_ROUND')
      const b = object(body), target = b.targetId
      if (Object.keys(b).length !== 1 || typeof target !== 'string' || !r.playerIds.includes(target) || target === viewer) throw invalid()
      this.leave(r, target)
      bossSettle(r)
      return
    }
    if (type === 'bossDraftRandom') {
      if (r.game !== 'boss' || !r.boss || r.state !== 'playing') throw conflict('NO_ROUND')
      r.boss = bossResult(draftRandomRest(r.boss, randomInt, Date.now()))
      return
    }
    if (type === 'settings') {
      if (r.state !== 'lobby') throw conflict('ROOM_STARTED')
      r.settings = settings(r.game, body, r.settings); r.deck = []
    } else if (type === 'lobby') {
      r.state = 'lobby'; r.spy = null; r.party = null; r.fingers = null; r.boss = null; r.matchId = randomUUID()
    } else if (type === 'reveal') {
      this.show(r)
    } else if (type === 'start') {
      if (r.state === 'playing') throw conflict('ROOM_STARTED')
      if (r.playerIds.length < (r.game === 'neverHave' ? 2 : 3)) throw conflict('NOT_ENOUGH_PLAYERS')
      if (r.game === 'boss') {
        if (r.playerIds.length > BOSS_PLAYERS) throw conflict('ROOM_FULL')
        const s = r.settings as BossRoomSettings
        if (s.investorsEach && !investorChoices(r.playerIds.length).includes(s.investorsEach)) r.settings = { ...s, investorsEach: undefined }
        r.restart = null
        r.boss = createBossGame(shuffle(r.playerIds), r.settings as BossRoomSettings, bossBoard, randomInt, Date.now())
      } else if (r.game === 'spy') {
        const s = r.settings as SpyRoomSettings
        const pool = (s.mode === 'places' ? content.spyPlaces : content.spyPairs).filter((p) => s.packs.includes(p.id)).flatMap((p) => p.items as (string | [string, string])[])
        const item = pool[randomInt(pool.length)], words = Array.isArray(item) ? (randomInt(2) ? [...item].reverse() : item) : [item, null]
        const cap = r.playerIds.length <= 5 ? 1 : r.playerIds.length <= 8 ? 2 : 3
        r.spy = {
          number: (r.spy?.number ?? 0) + 1, startedAt: new Date().toISOString(), endsAt: new Date(Date.now() + s.minutes * 60000).toISOString(),
          firstPlayerId: r.playerIds[randomInt(r.playerIds.length)], spies: shuffle(r.playerIds).slice(0, Math.min(s.spies, cap)), secret: words[0]!, spyWord: words[1] ?? null,
        }
      } else {
        if (!r.deck.length) r.deck = shuffle(content[r.game].filter((p) => (r.settings as PartyRoomSettings).packs.includes(p.id)).flatMap((p) => p.cards.map((text) => ({ pack: p.id, text }))))
        const card = r.deck.shift()!
        if (r.game === 'neverHave' && !r.fingers) r.fingers = Object.fromEntries(r.playerIds.map((id) => [id, 5]))
        r.party = { number: (r.party?.number ?? 0) + 1, card: card.text, pack: card.pack, votes: {}, result: null }
      }
      r.state = 'playing'
    } else throw invalid()
  }

  private async decideBoard(c: PoolClient, r: Internal, type: 'boardApprove' | 'boardReject' | 'boardRevoke', body: unknown) {
    const b = object(body)
    if (Object.keys(b).length !== 1 || typeof b.boardId !== 'string' || !UUID.test(b.boardId)) throw invalid()
    const from = type === 'boardRevoke' ? 'approved' : 'pending'
    const to = type === 'boardApprove' ? 'approved' : type === 'boardReject' ? 'rejected' : 'revoked'
    if (type === 'boardApprove') {
      const approved = Number((await c.query<{ n: string }>("SELECT count(*) AS n FROM game_room_boards WHERE room_code=$1 AND status='approved' AND expires_at>clock_timestamp()", [r.code])).rows[0].n)
      if (approved >= MAX_BOARDS) throw conflict('BOARD_LIMIT')
    }
    const pendingWindow = from === 'pending' ? 'AND created_at>clock_timestamp()-make_interval(secs=>$4)' : 'AND $4::int IS NOT NULL'
    const updated = await c.query(`UPDATE game_room_boards SET status=$3 WHERE id=$1 AND room_code=$2 AND status='${from}' AND expires_at>clock_timestamp() ${pendingWindow}`, [b.boardId, r.code, to, BOARD_PENDING_MS / 1000])
    if (!updated.rowCount) throw new NotFoundException({ error: { code: 'BOARD_NOT_FOUND' } })
  }

  // ── Entry points ────────────────────────────────────────────────────────

  async create(actor: RoomActor, body: unknown): Promise<Room> {
    const b = object(body)
    if (Object.keys(b).some((k) => !['game', 'settings'].includes(k)) || !['spy', 'mostLikely', 'neverHave', 'boss'].includes(String(b.game))) throw invalid()
    const game = b.game as RoomGame, s = settings(game, b.settings)
    return this.change(async (c) => {
      await this.guests.assertActive(c, actor)
      await c.query('DELETE FROM game_rooms WHERE expires_at<=now()')
      for (let tries = 0; tries < 10; tries++) {
        const code = String(randomInt(100000, 1000000)), now = new Date(), expiresAt = new Date(now.getTime() + ROOM_MS).toISOString()
        const r: Internal = { code, game, hostId: actor.playerId, playerIds: [actor.playerId], state: 'lobby', expiresAt, settings: s, spy: null, party: null, deck: [], fingers: null, matchId: randomUUID() }
        const insert = await c.query('INSERT INTO game_rooms(code,data,created_at,expires_at,revision,next_deadline) VALUES($1,$2,$3,$4,1,$4) ON CONFLICT DO NOTHING', [code, JSON.stringify(r), now, expiresAt])
        if (insert.rowCount) return { result: await this.view(c, { room: r, revision: 1 }, { kind: 'seat', playerId: actor.playerId }) }
      }
      throw unavailable()
    })
  }

  async get(actor: RoomActor, code: string): Promise<Room> {
    return this.transaction(async (c) => {
      await this.guests.assertActive(c, actor)
      const loaded = await this.lock(c, code)
      return this.view(c, loaded, { kind: 'seat', playerId: actor.playerId })
    })
  }

  /** REST commands (the original endpoints and the fallback while a socket is down). */
  async action(actor: RoomActor, code: string, type: string, body?: unknown): Promise<Room> {
    if (type === 'get') return this.get(actor, code)
    return this.change(async (c) => {
      await this.guests.assertActive(c, actor)
      const loaded = await this.lock(c, code)
      await this.apply(c, actor, loaded.room, type, body)
      const revision = await this.save(c, loaded.room)
      if (revision === null) return { result: await this.emptyView(loaded.room), closed: code }
      return { result: await this.view(c, { room: loaded.room, revision }, { kind: 'seat', playerId: actor.playerId }), changed: code }
    })
  }

  /** Friends get a "ชวนเล่น" notification. Changes no room state. */
  async invite(actor: RoomActor, code: string, body: unknown): Promise<void> {
    await this.transaction(async (c) => {
      await this.guests.assertActive(c, actor)
      const { room: r } = await this.lock(c, code)
      if (!r.playerIds.includes(actor.playerId)) throw new ForbiddenException({ error: { code: 'NOT_IN_ROOM' } })
      if (actor.kind === 'guest') throw new ForbiddenException({ error: { code: 'GUEST_FORBIDDEN' } })
      const b = object(body), ids = b.userIds
      if (Object.keys(b).length !== 1 || !Array.isArray(ids) || ids.length > 50 || ids.some((id) => typeof id !== 'string' || !UUID.test(id))) throw invalid()
      const recipients = (await c.query<{ id: string }>(`SELECT u.id FROM users u JOIN friendships f ON f.status='accepted' AND
        ((f.requester_id=$1 AND f.recipient_id=u.id) OR (f.recipient_id=$1 AND f.requester_id=u.id))
        WHERE u.id=ANY($2::uuid[]) AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocked_id=$1 AND b.blocker_id=u.id))`,
      [actor.playerId, [...new Set(ids as string[])]])).rows
      for (const p of recipients) {
        await c.query(`INSERT INTO app_notifications(id,user_id,actor_id,kind,room_code)
          SELECT $1,$2,$3,'game_invite',$4 WHERE NOT EXISTS(SELECT 1 FROM app_notifications WHERE user_id=$2 AND actor_id=$3 AND room_code=$4 AND kind='game_invite')`, [randomUUID(), p.id, actor.playerId, code])
      }
    })
  }

  /** The last player left: the room is gone, answer with what the leaver saw. */
  private async emptyView(r: Internal): Promise<Room> {
    return this.render(r, 0, new Map(), [], { kind: 'seat', playerId: '' })
  }

  /**
   * Socket commands. Serialized by the room row lock; a repeated actionId returns its first result
   * (accepted or refused) without changing anything again.
   */
  async command(actor: RoomActor, raw: unknown): Promise<RoomCommandResult> {
    let cmd: RoomCommand
    try {
      const b = object(raw)
      if (Object.keys(b).some((k) => !['code', 'actionId', 'type', 'phase', 'payload'].includes(k))) throw invalid()
      if (typeof b.code !== 'string' || typeof b.actionId !== 'string' || !UUID.test(b.actionId) || typeof b.type !== 'string') throw invalid()
      if (b.phase !== undefined && (typeof b.phase !== 'string' || b.phase.length > 100)) throw invalid()
      if (PHASED.has(b.type) && b.phase === undefined) throw invalid()
      cmd = b as RoomCommand
    } catch (e) { return this.refusal(e as HttpException) }
    const hash = payloadHash({ type: cmd.type, phase: cmd.phase ?? null, payload: cmd.payload ?? null })
    try {
      return await this.change(async (c) => {
        await this.guests.assertActive(c, actor)
        const loaded = await this.lock(c, cmd.code)
        const prior = await this.prior(c, cmd, actor, hash)
        if (prior) return { result: prior }
        if (cmd.phase !== undefined && cmd.phase !== phaseOf(loaded.room)) throw conflict('STALE_PHASE')
        await this.apply(c, actor, loaded.room, cmd.type, cmd.payload)
        const revision = await this.save(c, loaded.room)
        if (revision === null) return { result: { ok: true, revision: 0 } as RoomCommandResult, closed: cmd.code }
        const result: RoomCommandResult = { ok: true, revision }
        await c.query('INSERT INTO game_room_actions(room_code,action_id,actor_id,payload_hash,result) VALUES($1,$2,$3,$4,$5)', [cmd.code, cmd.actionId, actor.playerId, hash, JSON.stringify(result)])
        return { result, changed: cmd.code }
      })
    } catch (e) {
      if (!(e instanceof HttpException)) throw e
      const refused = this.refusal(e)
      // Keep final refusals so a retry gets the same answer. Auth and availability errors stay retryable.
      if (refused.ok || [401, 404].includes(refused.status) || refused.status >= 500 || refused.code === 'ACTION_ID_REUSED') return refused
      return this.transaction(async (c) => {
        const exists = (await c.query('SELECT 1 FROM game_rooms WHERE code=$1 FOR UPDATE', [cmd.code])).rowCount
        if (!exists) return refused
        const prior = await this.prior(c, cmd, actor, hash)
        if (prior) return prior
        await c.query('INSERT INTO game_room_actions(room_code,action_id,actor_id,payload_hash,result) VALUES($1,$2,$3,$4,$5)', [cmd.code, cmd.actionId, actor.playerId, hash, JSON.stringify(refused)])
        return refused
      }).catch(() => refused)
    }
  }

  private async prior(c: PoolClient, cmd: RoomCommand, actor: RoomActor, hash: string): Promise<RoomCommandResult | null> {
    const row = (await c.query<{ actor_id: string; payload_hash: string; result: RoomCommandResult }>('SELECT actor_id,payload_hash,result FROM game_room_actions WHERE room_code=$1 AND action_id=$2', [cmd.code, cmd.actionId])).rows[0]
    if (!row) return null
    if (row.actor_id !== actor.playerId || row.payload_hash !== hash) throw conflict('ACTION_ID_REUSED')
    return row.result
  }

  private refusal(e: HttpException): RoomCommandResult {
    return { ok: false, status: e.getStatus(), code: errorCode(e) }
  }

  /** Resolves due deadlines exactly once: room expiry and the spy timer. Safe to run from several places at once. */
  async sweep(): Promise<number> {
    const done = await this.transaction(async (c) => {
      const rows = (await c.query<{ code: string; data: Internal; expired: boolean }>(
        `SELECT code,data,expires_at<=clock_timestamp() AS expired FROM game_rooms
         WHERE coalesce(next_deadline,expires_at)<=clock_timestamp() ORDER BY code LIMIT 25 FOR UPDATE SKIP LOCKED`,
      )).rows
      const changed: string[] = [], closed: string[] = []
      let resolved: { state: BossInternalState; changed: boolean }
      for (const { code, data: r, expired } of rows) {
        if (expired) { await c.query('DELETE FROM game_rooms WHERE code=$1', [code]); closed.push(code); continue }
        if (r.state === 'playing' && r.spy && !r.spy.timeUp && new Date(r.spy.endsAt).getTime() <= Date.now()) {
          r.spy.timeUp = true
          await this.save(c, r); changed.push(code)
        } else if (r.restart && r.restart.deadlineAt <= new Date().toISOString()) {
          this.settleRestart(r, true)
          await this.save(c, r); changed.push(code)
        } else if (r.state === 'playing' && r.boss && (resolved = resolveBossDeadlines(r.boss, bossBoard, randomInt, Date.now())).changed) {
          r.boss = resolved.state; bossSettle(r)
          await this.save(c, r); changed.push(code)
        } else {
          await c.query('UPDATE game_rooms SET next_deadline=$2 WHERE code=$1', [code, deadlineOf(r)])
        }
      }
      await c.query("DELETE FROM game_room_boards WHERE expires_at<=clock_timestamp() OR (status='pending' AND created_at<=clock_timestamp()-interval '1 hour') OR status IN ('rejected','revoked') AND created_at<=clock_timestamp()-interval '1 hour'")
      return { changed, closed }
    })
    for (const code of done.closed) { this.presence.forget(code); this.events.closed(code) }
    for (const code of done.changed) this.events.changed(code)
    return done.changed.length + done.closed.length
  }

  // ── Board Screens ───────────────────────────────────────────────────────

  /** A device asks to become this room's Board Screen. Anyone with the code may ask; only the owner can approve. */
  async requestBoard(request: IncomingMessage, code: string, who: string | null = null): Promise<{ session: RoomBoardSession; cookie?: string }> {
    const current = await this.boardFromCookie(request)
    if (current && current.roomCode === code && ['pending', 'approved'].includes(current.status)) return { session: await this.boardSession(current) }
    const token = randomBytes(32).toString('base64url'), id = randomUUID()
    const label = Array.from({ length: 4 }, () => LABEL_LETTERS[randomInt(LABEL_LETTERS.length)]).join('')
    const board = await this.change(async (c) => {
      const room = (await c.query<{ expires_at: Date; data: Internal }>('SELECT expires_at,data FROM game_rooms WHERE code=$1 AND expires_at>clock_timestamp() FOR UPDATE', [code])).rows[0]
      if (!room) throw notFound()
      // The owner picked this person's device as the Board Screen: approve it straight away.
      const invited = !!who && (room.data.boardInvites ?? []).includes(who)
      const open = Number((await c.query<{ n: string }>(`SELECT count(*) AS n FROM game_room_boards WHERE room_code=$1 AND expires_at>clock_timestamp()
        AND (status='approved' OR (status='pending' AND created_at>clock_timestamp()-make_interval(secs=>$2)))`, [code, BOARD_PENDING_MS / 1000])).rows[0].n)
      if (open >= 5) throw conflict('BOARD_LIMIT')
      const status: RoomBoardStatus = invited ? 'approved' : 'pending'
      await c.query('INSERT INTO game_room_boards(id,room_code,token_hash,label,status,expires_at) VALUES($1,$2,$3,$4,$5,$6)', [id, code, sessionHash(token), label, status, room.expires_at])
      if (invited) {
        room.data.boardInvites = room.data.boardInvites!.filter((x) => x !== who)
        await c.query('UPDATE game_rooms SET data=$2,revision=revision+1 WHERE code=$1', [code, JSON.stringify(room.data)])
      } else await c.query('UPDATE game_rooms SET revision=revision+1 WHERE code=$1', [code])
      return { result: { id, roomCode: code, label, status }, changed: code }
    })
    return { session: await this.boardSession(board), cookie: boardCookie(token) }
  }

  async boardFromCookie(request: IncomingMessage): Promise<{ id: string; roomCode: string; label: string; status: RoomBoardStatus } | null> {
    const token = readBoardCookie(request)
    if (!token) return null
    const row = (await this.database.connection.query<{ id: string; roomCode: string; label: string; status: RoomBoardStatus; stale: boolean }>(
      `SELECT id,room_code AS "roomCode",label,status,(status='pending' AND created_at<=clock_timestamp()-make_interval(secs=>$2)) AS stale
       FROM game_room_boards WHERE token_hash=$1 AND expires_at>clock_timestamp()`, [sessionHash(token), BOARD_PENDING_MS / 1000],
    ).catch(() => { throw unavailable() })).rows[0]
    if (!row) return null
    return { id: row.id, roomCode: row.roomCode, label: row.label, status: row.stale ? 'rejected' : row.status }
  }

  async boardSession(board: { id: string; roomCode: string; label: string; status: RoomBoardStatus }): Promise<RoomBoardSession> {
    const snap = board.status === 'approved' ? await this.snapshot(board.roomCode) : null
    return { board: { id: board.id, label: board.label, status: board.status }, room: snap ? snap.render({ kind: 'board', boardId: board.id }) : null }
  }

  /** Logout leaves every room the credential sat in (host passes on; empty rooms close). */
  async logout(request: IncomingMessage) {
    const account = readSessionCookie(request), guest = readGuestCookie(request)
    if (!account && !guest) return
    const done = await this.transaction(async (c) => {
      const ids: string[] = []
      for (const [table, column, token] of [['auth_sessions', 'user_id', account], ['game_guest_sessions', 'id', guest]] as const) {
        if (!token) continue
        const hash = sessionHash(token)
        const rows = await c.query<{ actor: string }>(`SELECT ${column} AS actor FROM ${table} WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE`, [hash])
        ids.push(...rows.rows.map((r) => r.actor))
        await c.query(`UPDATE ${table} SET revoked_at=clock_timestamp() WHERE token_hash=$1 AND revoked_at IS NULL`, [hash])
      }
      const changed: string[] = [], closed: string[] = []
      if (!ids.length) return { changed, closed }
      const rows = await c.query<{ code: string; data: Internal }>("SELECT code,data FROM game_rooms WHERE data->'playerIds' ?| $1::text[] ORDER BY code FOR UPDATE", [ids])
      for (const { code, data: r } of rows.rows) {
        for (const id of ids) this.leave(r, id)
        if ((await this.save(c, r)) === null) closed.push(code); else changed.push(code)
      }
      return { changed, closed }
    })
    for (const code of done.closed) { this.presence.forget(code); this.events.closed(code) }
    for (const code of done.changed) this.events.changed(code)
  }
}
