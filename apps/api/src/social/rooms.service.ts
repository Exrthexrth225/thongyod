import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { randomInt, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Observable, Subject } from 'rxjs'
import type { PoolClient } from 'pg'
import type { IncomingMessage } from 'node:http'
import { RoomGuestService, type RoomActor } from '../auth/room-guest.service.js'
import { readSessionCookie, readGuestCookie, sessionHash } from '../auth/cookie.js'
import type {
  BossActionRequest,
  BossRoomSettings,
  PartyRoomSettings,
  Room,
  RoomGame,
  RoomPlayer,
  RoomState,
  SpyRoomSettings,
} from '@thongyod/shared'
import {
  applyBossAction,
  createBossGame,
  projectBossView,
  removeBossPlayer,
  resolveBossDeadlines,
  type BossBoardDefinition,
  type BossInternalState,
} from '@thongyod/shared/content/boss-engine.mjs'
import { DatabaseService } from '../db/database.service.js'

const require = createRequire(import.meta.url)
const content = JSON.parse(readFileSync(require.resolve('@thongyod/shared/content/room-games.json'), 'utf8')) as {
  spyPlaces: { id: string; items: string[] }[]
  spyPairs: { id: string; items: [string, string][] }[]
  mostLikely: { id: string; cards: string[] }[]
  neverHave: { id: string; cards: string[] }[]
}
const bossBoard = JSON.parse(readFileSync(require.resolve('@thongyod/shared/content/boss-board.json'), 'utf8')) as BossBoardDefinition

type SpyRound = { number: number; startedAt: string; endsAt: string; firstPlayerId: string; spies: string[]; secret: string; spyWord: string | null }
type PartyRound = { number: number; card: string; pack: string; votes: Record<string, string>; result: { tally: Record<string, number>; haveIds: string[] } | null }
type Internal = {
  code: string
  game: RoomGame
  hostId: string
  playerIds: string[]
  state: RoomState
  expiresAt: string
  settings: SpyRoomSettings | PartyRoomSettings | BossRoomSettings
  spy: SpyRound | null
  party: PartyRound | null
  deck: { pack: string; text: string }[]
  fingers: Record<string, number> | null
  boss?: BossInternalState | null
}
const invalid = () => new BadRequestException({ error: { code: 'INVALID_REQUEST' } })
function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
function object(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid()
  return body as Record<string, unknown>
}
function settings(game: RoomGame, raw: unknown, current?: Internal['settings']): Internal['settings'] {
  const b = object(raw ?? {})
  if (game === 'boss') {
    if (Object.keys(b).some((k) => k !== 'closingSeconds')) throw invalid()
    const old = current as BossRoomSettings | undefined
    const sec = b.closingSeconds ?? old?.closingSeconds ?? 10
    if (sec !== 10 && sec !== 15) throw invalid()
    return { closingSeconds: sec }
  }
  const spy = game === 'spy'
  if (Object.keys(b).some((k) => !(spy ? ['mode', 'minutes', 'spies', 'packs'] : ['packs']).includes(k))) throw invalid()
  const old = current as SpyRoomSettings | undefined
  const mode = b.mode ?? old?.mode ?? 'places'
  const minutes = b.minutes ?? old?.minutes ?? 5
  const spies = b.spies ?? old?.spies ?? 1
  if (spy && (!['places', 'pairs'].includes(String(mode)) || ![3, 5, 8].includes(Number(minutes)) || typeof minutes !== 'number' || !Number.isInteger(spies) || Number(spies) < 1 || Number(spies) > 3)) {
    throw invalid()
  }
  const valid = (spy ? (mode === 'places' ? content.spyPlaces : content.spyPairs) : content[game as 'mostLikely' | 'neverHave']).map((p) => p.id)
  const rawPacks = b.packs ?? (spy && old?.mode !== mode ? valid : (current as SpyRoomSettings | PartyRoomSettings | undefined)?.packs ?? valid)
  if (!Array.isArray(rawPacks) || rawPacks.length > valid.length || rawPacks.some((p) => typeof p !== 'string' || !valid.includes(p)) || new Set(rawPacks).size !== rawPacks.length) {
    throw invalid()
  }
  const packs = rawPacks.length ? rawPacks : valid
  return spy ? { mode: mode as 'places' | 'pairs', minutes: minutes as 3 | 5 | 8, spies: Number(spies), packs } : { packs }
}

function bossError(status: number, code: string): HttpException {
  if (status === 400) return new BadRequestException({ error: { code } })
  if (status === 403) return new ForbiddenException({ error: { code } })
  return new ConflictException({ error: { code } })
}

@Injectable()
export class RoomsService {
  private readonly streams = new Map<string, Set<Subject<{ data: string }>>>()

  constructor(private readonly database: DatabaseService, private readonly guests: RoomGuestService) {}

  stream(code: string): Observable<{ data: string }> {
    let listeners = this.streams.get(code)
    if (!listeners) {
      listeners = new Set()
      this.streams.set(code, listeners)
    }
    const subject = new Subject<{ data: string }>()
    listeners.add(subject)
    return new Observable((subscriber) => {
      const sub = subject.subscribe(subscriber)
      return () => {
        sub.unsubscribe()
        listeners?.delete(subject)
        if (listeners && listeners.size === 0) this.streams.delete(code)
      }
    })
  }

  private notify(code: string, revision: number) {
    const listeners = this.streams.get(code)
    if (!listeners) return
    const payload = JSON.stringify({ revision })
    for (const sub of listeners) sub.next({ data: payload })
  }

  private async transaction<T>(work: (c: PoolClient) => Promise<T>) {
    const c = await this.database.connection.connect().catch(() => {
      throw new ServiceUnavailableException({ error: { code: 'ROOMS_UNAVAILABLE' } })
    })
    try {
      await c.query('BEGIN')
      const result = await work(c)
      await c.query('COMMIT')
      return result
    } catch (e) {
      await c.query('ROLLBACK').catch(() => undefined)
      if (e instanceof HttpException) throw e
      throw new ServiceUnavailableException({ error: { code: 'ROOMS_UNAVAILABLE' } })
    } finally {
      c.release()
    }
  }

  private async view(c: PoolClient, r: Internal, viewer: string): Promise<Room> {
    const people = (await c.query<{ userId: string; displayName: string; avatarUrl: string | null }>('SELECT id AS "userId",display_name AS "displayName",avatar_url AS "avatarUrl" FROM users WHERE id=ANY($1::uuid[])', [r.playerIds])).rows
    const guestPeople = (await c.query<{ userId: string; displayName: string; avatarUrl: null; isGuest: true }>('SELECT id AS "userId",display_name AS "displayName",NULL AS "avatarUrl",true AS "isGuest" FROM game_guest_sessions WHERE id=ANY($1::uuid[])', [r.playerIds])).rows
    people.push(...guestPeople)
    const players = r.playerIds.map((id) => ({ ...people.find((p) => p.userId === id)!, isHost: id === r.hostId })) as RoomPlayer[]
    const joined = r.playerIds.includes(viewer)
    const maxPlayers = r.game === 'boss' ? 6 : 12
    const base = { code: r.code, state: r.state, hostId: r.hostId, players, maxPlayers, joined, expiresAt: r.expiresAt }
    if (r.game === 'spy') {
      const s = r.settings as SpyRoomSettings
      const round = r.spy
      const isSpy = round?.spies.includes(viewer) ?? false
      return {
        ...base,
        game: 'spy',
        settings: s,
        mySecret: joined && round ? { isSpy, text: s.mode === 'places' ? (isSpy ? null : round.secret) : isSpy ? round.spyWord : round.secret } : null,
        round: round
          ? {
              number: round.number,
              startedAt: round.startedAt,
              endsAt: round.endsAt,
              firstPlayerId: round.firstPlayerId,
              reveal: r.state === 'revealed' && joined ? { spyIds: round.spies, secret: round.secret, spyWord: round.spyWord } : null,
            }
          : null,
      }
    }
    if (r.game === 'boss') {
      return {
        ...base,
        game: 'boss',
        settings: r.settings as BossRoomSettings,
        boss: r.boss ? projectBossView(r.boss, viewer, bossBoard) : null,
      }
    }
    const round = r.party
    return {
      ...base,
      game: r.game,
      settings: r.settings as PartyRoomSettings,
      fingers: joined ? r.fingers : null,
      round: round && joined ? { number: round.number, card: round.card, pack: round.pack, votedIds: Object.keys(round.votes), myVote: round.votes[viewer] ?? null, result: round.result } : null,
    }
  }

  private show(r: Internal) {
    const round = r.party
    if (r.game === 'spy') {
      if (!r.spy) throw new ConflictException({ error: { code: 'NO_ROUND' } })
      r.state = 'revealed'
      return
    }
    if (r.game === 'boss') throw new ConflictException({ error: { code: 'NO_ROUND' } })
    if (!round) throw new ConflictException({ error: { code: 'NO_ROUND' } })
    if (round.result) return
    const tally: Record<string, number> = Object.fromEntries(r.game === 'neverHave' ? ['have', 'never'].map((k) => [k, 0]) : r.playerIds.map((k) => [k, 0]))
    for (const v of Object.values(round.votes)) tally[v] = (tally[v] ?? 0) + 1
    const haveIds = r.game === 'neverHave' ? Object.entries(round.votes).filter(([, v]) => v === 'have').map(([id]) => id) : []
    round.result = { tally, haveIds }
    r.state = 'revealed'
    if (r.fingers) for (const id of haveIds) r.fingers[id] = Math.max(0, (r.fingers[id] ?? 5) - 1)
  }

  private leave(r: Internal, viewer: string) {
    r.playerIds = r.playerIds.filter((id) => id !== viewer)
    if (r.hostId === viewer) r.hostId = r.playerIds[0] ?? viewer
    if (r.game === 'boss' && r.boss) {
      r.boss = removeBossPlayer(r.boss, viewer)
      if (r.boss.phase === 'game_over') r.state = 'revealed'
      return
    }
    if (r.party && !r.party.result) {
      delete r.party.votes[viewer]
      for (const [id, vote] of Object.entries(r.party.votes)) if (r.game === 'mostLikely' && vote === viewer) delete r.party.votes[id]
      if (r.playerIds.length && r.playerIds.every((id) => r.party!.votes[id])) this.show(r)
    }
    if (r.fingers) delete r.fingers[viewer]
  }

  async logout(request: IncomingMessage) {
    const account = readSessionCookie(request)
    const guest = readGuestCookie(request)
    if (!account && !guest) return
    await this.transaction(async (c) => {
      const ids: string[] = []
      for (const [table, column, token] of [
        ['auth_sessions', 'user_id', account],
        ['game_guest_sessions', 'id', guest],
      ]) {
        if (!token) continue
        const hash = sessionHash(token)
        const rows = await c.query<{ actor: string }>(`SELECT ${column} AS actor FROM ${table} WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE`, [hash])
        ids.push(...rows.rows.map((r) => r.actor))
        await c.query(`UPDATE ${table} SET revoked_at=clock_timestamp() WHERE token_hash=$1 AND revoked_at IS NULL`, [hash])
      }
      if (!ids.length) return
      const rows = await c.query<{ code: string; data: Internal }>("SELECT code,data FROM game_rooms WHERE data->'playerIds' ?| $1::text[] ORDER BY code FOR UPDATE", [ids])
      for (const { code, data: r } of rows.rows) {
        for (const id of ids) this.leave(r, id)
        if (r.playerIds.length) {
          await c.query('UPDATE game_rooms SET data=$2 WHERE code=$1', [code, JSON.stringify(r)])
          this.notify(code, r.boss?.revision ?? Date.now())
        } else {
          await c.query('DELETE FROM game_rooms WHERE code=$1', [code])
        }
      }
    })
  }

  async create(actor: RoomActor, body: unknown) {
    const viewer = actor.playerId
    const b = object(body)
    if (Object.keys(b).some((k) => !['game', 'settings'].includes(k)) || !['spy', 'mostLikely', 'neverHave', 'boss'].includes(String(b.game))) throw invalid()
    const game = b.game as RoomGame
    const s = settings(game, b.settings)
    return this.transaction(async (c) => {
      await this.guests.assertActive(c, actor)
      await c.query('DELETE FROM game_rooms WHERE expires_at<=now()')
      for (let tries = 0; tries < 10; tries++) {
        const code = String(randomInt(100000, 1000000))
        const now = new Date()
        const expiresAt = new Date(now.getTime() + 10800000).toISOString()
        const r: Internal = { code, game, hostId: viewer, playerIds: [viewer], state: 'lobby', expiresAt, settings: s, spy: null, party: null, deck: [], fingers: null, boss: null }
        const insert = await c.query('INSERT INTO game_rooms(code,data,created_at,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [code, JSON.stringify(r), now, expiresAt])
        if (insert.rowCount) return this.view(c, r, viewer)
      }
      throw new ServiceUnavailableException({ error: { code: 'ROOMS_UNAVAILABLE' } })
    })
  }

  async action(actor: RoomActor, code: string, action = 'get', body?: unknown) {
    const viewer = actor.playerId
    if (!/^\d{6}$/.test(code)) throw new NotFoundException({ error: { code: 'ROOM_NOT_FOUND' } })
    return this.transaction(async (c) => {
      await this.guests.assertActive(c, actor)
      const result = await c.query<{ data: Internal }>('SELECT data FROM game_rooms WHERE code=$1 AND expires_at>clock_timestamp() FOR UPDATE', [code])
      const r = result.rows[0]?.data
      if (!r) throw new NotFoundException({ error: { code: 'ROOM_NOT_FOUND' } })
      const joined = r.playerIds.includes(viewer)

      if (r.game === 'boss' && r.boss) {
        const resolved = resolveBossDeadlines(r.boss, bossBoard, randomInt)
        if (resolved.changed) {
          r.boss = resolved.state
          if (r.boss.phase === 'game_over') r.state = 'revealed'
          await c.query('UPDATE game_rooms SET data=$2 WHERE code=$1', [code, JSON.stringify(r)])
          this.notify(code, r.boss.revision)
        }
      }

      if (action === 'get') return this.view(c, r, viewer)
      if (action === 'join') {
        if (!joined) {
          if (r.state !== 'lobby') throw new ConflictException({ error: { code: 'ROOM_STARTED' } })
          const cap = r.game === 'boss' ? 6 : 12
          if (r.playerIds.length >= cap) throw new ConflictException({ error: { code: 'ROOM_FULL' } })
          r.playerIds.push(viewer)
          if (r.fingers) r.fingers[viewer] = 5
        }
      } else if (action === 'leave') {
        this.leave(r, viewer)
      } else {
        if (!joined) throw new ForbiddenException({ error: { code: 'NOT_IN_ROOM' } })
        if (action === 'boss') {
          if (r.game !== 'boss' || !r.boss || r.state === 'lobby') throw new ConflictException({ error: { code: 'NO_ROUND' } })
          const outcome = applyBossAction(r.boss, viewer, body as BossActionRequest, bossBoard, randomInt)
          if (!outcome.ok) throw bossError(outcome.status, outcome.code)
          r.boss = outcome.state
          if (r.boss.phase === 'game_over') r.state = 'revealed'
        } else if (action === 'vote') {
          if (r.game === 'spy' || r.game === 'boss' || !r.party || r.state !== 'playing') throw new ConflictException({ error: { code: 'NO_ROUND' } })
          const b = object(body)
          const choice = b.choice
          if (Object.keys(b).some((k) => !['choice', 'roundNumber'].includes(k)) || typeof choice !== 'string' || !(r.game === 'neverHave' ? ['have', 'never'] : r.playerIds).includes(choice)) throw invalid()
          if (b.roundNumber !== undefined && b.roundNumber !== r.party.number) throw new ConflictException({ error: { code: 'NO_ROUND' } })
          r.party.votes[viewer] = choice
          if (r.playerIds.every((id) => r.party!.votes[id])) this.show(r)
        } else if (action === 'invite') {
          if (actor.kind === 'guest') throw new ForbiddenException({ error: { code: 'GUEST_FORBIDDEN' } })
          const b = object(body)
          const ids = b.userIds
          if (Object.keys(b).length !== 1 || !Array.isArray(ids) || ids.length > 50 || ids.some((id) => typeof id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) throw invalid()
          const recipients = (
            await c.query<{ id: string }>(
              `SELECT u.id FROM users u JOIN friendships f ON f.status='accepted' AND
            ((f.requester_id=$1 AND f.recipient_id=u.id) OR(f.recipient_id=$1 AND f.requester_id=u.id))
            WHERE u.id=ANY($2::uuid[]) AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR(b.blocked_id=$1 AND b.blocker_id=u.id))`,
              [viewer, [...new Set(ids)]],
            )
          ).rows
          for (const p of recipients) {
            await c.query(
              `INSERT INTO app_notifications(id,user_id,actor_id,kind,room_code)
            SELECT $1,$2,$3,'game_invite',$4 WHERE NOT EXISTS(SELECT 1 FROM app_notifications WHERE user_id=$2 AND actor_id=$3 AND room_code=$4 AND kind='game_invite')`,
              [randomUUID(), p.id, viewer, code],
            )
          }
        } else {
          if (r.hostId !== viewer) throw new ForbiddenException({ error: { code: 'HOST_ONLY' } })
          if (action === 'settings') {
            if (r.state !== 'lobby') throw new ConflictException({ error: { code: 'ROOM_STARTED' } })
            r.settings = settings(r.game, body, r.settings)
            r.deck = []
          } else if (action === 'lobby') {
            r.state = 'lobby'
            r.spy = null
            r.party = null
            r.fingers = null
            r.boss = null
          } else if (action === 'reveal') {
            this.show(r)
          } else if (action === 'start') {
            if (r.state === 'playing') throw new ConflictException({ error: { code: 'ROOM_STARTED' } })
            if (r.playerIds.length < (r.game === 'neverHave' ? 2 : 3)) throw new ConflictException({ error: { code: 'NOT_ENOUGH_PLAYERS' } })
            if (r.game === 'boss') {
              if (r.playerIds.length > 6) throw new ConflictException({ error: { code: 'TOO_MANY_PLAYERS' } })
              r.boss = createBossGame(r.playerIds, r.settings as BossRoomSettings, bossBoard, randomInt)
            } else if (r.game === 'spy') {
              const s = r.settings as SpyRoomSettings
              const pool = (s.mode === 'places' ? content.spyPlaces : content.spyPairs).filter((p) => s.packs.includes(p.id)).flatMap((p) => p.items as (string | [string, string])[])
              const item = pool[randomInt(pool.length)]
              const words = Array.isArray(item) ? (randomInt(2) ? [...item].reverse() : item) : [item, null]
              const cap = r.playerIds.length <= 5 ? 1 : r.playerIds.length <= 8 ? 2 : 3
              r.spy = {
                number: (r.spy?.number ?? 0) + 1,
                startedAt: new Date().toISOString(),
                endsAt: new Date(Date.now() + s.minutes * 60000).toISOString(),
                firstPlayerId: r.playerIds[randomInt(r.playerIds.length)],
                spies: shuffle(r.playerIds).slice(0, Math.min(s.spies, cap)),
                secret: words[0]!,
                spyWord: words[1] ?? null,
              }
            } else {
              const s = r.settings as PartyRoomSettings
              if (!r.deck.length) r.deck = shuffle(content[r.game].filter((p) => s.packs.includes(p.id)).flatMap((p) => p.cards.map((text) => ({ pack: p.id, text }))))
              const card = r.deck.shift()!
              if (r.game === 'neverHave' && !r.fingers) r.fingers = Object.fromEntries(r.playerIds.map((id) => [id, 5]))
              r.party = { number: (r.party?.number ?? 0) + 1, card: card.text, pack: card.pack, votes: {}, result: null }
            }
            r.state = 'playing'
          } else {
            throw invalid()
          }
        }
      }
      if (!r.playerIds.length) {
        await c.query('DELETE FROM game_rooms WHERE code=$1', [code])
      } else {
        await c.query('UPDATE game_rooms SET data=$2 WHERE code=$1', [code, JSON.stringify(r)])
        this.notify(code, r.boss?.revision ?? Date.now())
      }
      return this.view(c, r, viewer)
    })
  }
}
