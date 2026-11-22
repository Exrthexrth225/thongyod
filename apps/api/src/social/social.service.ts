import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import type { CursorPage, Friend, FriendRequest, FriendRequests, GangSummary, PersonCard, UserCard } from '@thongyod/shared'
import { DatabaseService } from '../db/database.service.js'

const edges = `WITH edges AS (
  SELECT requester_id AS a, recipient_id AS b FROM friendships WHERE status='accepted'
  UNION ALL SELECT recipient_id, requester_id FROM friendships WHERE status='accepted'
)`
const person = 'u.id AS "userId", u.display_name AS "displayName", u.handle, u.avatar_url AS "avatarUrl"'
const visible = `NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
  (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocked_id=$1 AND b.blocker_id=u.id))`
const mutual = `CASE WHEN u.id=$1 THEN 0 ELSE (SELECT count(*)::int FROM edges x JOIN edges y ON x.b=y.b
  WHERE x.a=$1 AND y.a=u.id AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
    (b.blocker_id=$1 AND b.blocked_id=x.b) OR (b.blocked_id=$1 AND b.blocker_id=x.b))) END`
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
type Query = { q?: unknown; limit?: unknown; cursor?: unknown }

function pagination(query: Query, scope: string) {
  const limit = query.limit === undefined ? 20 : Number(query.limit)
  if ((query.limit !== undefined && (typeof query.limit !== 'string' || !/^\d+$/.test(query.limit)))
    || !Number.isInteger(limit) || limit < 1 || limit > 50 || (query.q !== undefined && typeof query.q !== 'string')) {
    throw new BadRequestException({ error: { code: 'INVALID_REQUEST' } })
  }
  const q = typeof query.q === 'string' ? query.q.trim().toLowerCase().replace(/^@/, '') : ''
  const key = JSON.stringify([scope, q])
  let name: string | null = null, id: string | null = null
  if (query.cursor !== undefined) {
    try {
      if (typeof query.cursor !== 'string' || query.cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw new Error()
      const value: unknown = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'))
      if (!Array.isArray(value) || value.length !== 3 || value[0] !== key || typeof value[1] !== 'string' || typeof value[2] !== 'string' || !uuid(value[2])) throw new Error()
      ;[, name, id] = value
    } catch { throw new BadRequestException({ error: { code: 'INVALID_REQUEST' } }) }
  }
  return { limit, q, key, name, id }
}

function page<T>(rows: T[], p: ReturnType<typeof pagination>, position: (item: T) => [string, string]): CursorPage<T> {
  const items = rows.slice(0, p.limit)
  return { items, nextCursor: rows.length > p.limit
    ? Buffer.from(JSON.stringify([p.key, ...position(items[items.length - 1])])).toString('base64url') : null }
}

@Injectable()
export class SocialService {
  constructor(private readonly database: DatabaseService) {}

  private async mutatePair<T = void>(viewer: string, target: string, code: 'USER_NOT_FOUND' | 'REQUEST_NOT_FOUND' | 'NOT_FRIENDS', apply: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!uuid(target) || viewer === target.toLowerCase()) throw new NotFoundException({ error: { code } })
    const client = await Promise.resolve().then(() => this.database.connection.connect()).catch(() => {
      throw new ServiceUnavailableException({ error: { code: 'SOCIAL_UNAVAILABLE' } })
    })
    try {
      await client.query('BEGIN')
      // Every pair mutation takes these locks in UUID order, including block/unblock.
      const users = await client.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[viewer, target]])
      if (users.rowCount !== 2) throw new NotFoundException({ error: { code } })
      const result = await apply(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      if (error instanceof HttpException) throw error
      throw new ServiceUnavailableException({ error: { code: 'SOCIAL_UNAVAILABLE' } })
    } finally { client.release() }
  }

  async sendRequest(viewer: string, body: unknown): Promise<FriendRequest> {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1
      || !('userId' in body) || typeof body.userId !== 'string') throw new BadRequestException({ error: { code: 'INVALID_REQUEST' } })
    const target = body.userId.toLowerCase()
    if (viewer === target) throw new BadRequestException({ error: { code: 'CANNOT_ADD_SELF' } })
    return this.mutatePair(viewer, target, 'USER_NOT_FOUND', async client => {
      const blocked = await client.query(`SELECT 1 FROM user_blocks WHERE
        (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)`, [viewer,target])
      if (blocked.rowCount) throw new NotFoundException({ error: { code: 'USER_NOT_FOUND' } })
      const old = (await client.query<{ id: string; status: string }>(`SELECT id,status FROM friendships WHERE
        (requester_id=$1 AND recipient_id=$2) OR (requester_id=$2 AND recipient_id=$1)`, [viewer,target])).rows[0]
      if (old?.status === 'accepted') throw new ConflictException({ error: { code: 'ALREADY_FRIENDS' } })
      if (old?.status === 'pending') throw new ConflictException({ error: { code: 'REQUEST_EXISTS' } })
      const quota = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM friend_request_sends
        WHERE requester_id=$1 AND sent_at>statement_timestamp()-interval '24 hours'`, [viewer])
      if (quota.rows[0].n >= 20) throw new HttpException({ error: { code: 'DAILY_LIMIT_REACHED' } }, HttpStatus.TOO_MANY_REQUESTS)
      const id = randomUUID()
      if (old) await client.query(`UPDATE friendships SET id=$1,requester_id=$2,recipient_id=$3,status='pending',
        created_at=clock_timestamp(),responded_at=NULL WHERE id=$4`, [id,viewer,target,old.id])
      else await client.query(`INSERT INTO friendships(id,requester_id,recipient_id,status,created_at)
        VALUES($1,$2,$3,'pending',clock_timestamp())`, [id,viewer,target])
      await client.query(`INSERT INTO friend_request_sends(request_id,requester_id,recipient_id,sent_at)
        SELECT id,requester_id,recipient_id,created_at FROM friendships WHERE id=$1`, [id])
      const result = await client.query<FriendRequest>(`${edges} SELECT f.id,
        json_build_object('userId',u.id,'displayName',u.display_name,'handle',u.handle,'avatarUrl',u.avatar_url) AS "user",
        ${mutual} AS "mutualFriends",to_char(f.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
        FROM friendships f JOIN users u ON u.id=f.recipient_id WHERE f.id=$2 AND f.requester_id=$1`, [viewer,id])
      return result.rows[0]
    })
  }

  async requestAction(viewer: string, id: string, accept: boolean): Promise<void> {
    if (!uuid(id)) throw new NotFoundException({ error: { code: 'REQUEST_NOT_FOUND' } })
    const request = await this.rows<{ target: string }>(`SELECT
        CASE WHEN requester_id=$1 THEN recipient_id ELSE requester_id END AS target
      FROM friendships WHERE id=$2 AND status='pending'
        AND ${accept ? 'recipient_id=$1' : '(requester_id=$1 OR recipient_id=$1)'}`, [viewer, id])
    if (!request[0]) throw new NotFoundException({ error: { code: 'REQUEST_NOT_FOUND' } })
    await this.mutatePair(viewer, request[0].target, 'REQUEST_NOT_FOUND', async client => {
      const result = await client.query(`UPDATE friendships f SET
          status=CASE WHEN $3 THEN 'accepted'::friendship_status
            WHEN f.recipient_id=$1 THEN 'declined'::friendship_status ELSE 'ended'::friendship_status END,
          responded_at=clock_timestamp()
        WHERE f.id=$2 AND f.status='pending'
          AND ${accept ? 'f.recipient_id=$1' : '(f.requester_id=$1 OR f.recipient_id=$1)'}
          AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
            (b.blocker_id=f.requester_id AND b.blocked_id=f.recipient_id)
            OR (b.blocker_id=f.recipient_id AND b.blocked_id=f.requester_id))`, [viewer, id, accept])
      if (!result.rowCount) throw new NotFoundException({ error: { code: 'REQUEST_NOT_FOUND' } })
    })
  }

  async unfriend(viewer: string, target: string): Promise<void> {
    await this.mutatePair(viewer, target, 'NOT_FRIENDS', async client => {
      const result = await client.query(`UPDATE friendships SET status='ended'
        WHERE status='accepted' AND ((requester_id=$1 AND recipient_id=$2) OR (requester_id=$2 AND recipient_id=$1))`, [viewer, target])
      if (!result.rowCount) throw new NotFoundException({ error: { code: 'NOT_FRIENDS' } })
    })
  }

  async block(viewer: string, body: unknown): Promise<void> {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1
      || !('userId' in body) || typeof body.userId !== 'string') {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST' } })
    }
    const target = body.userId
    await this.mutatePair(viewer, target, 'USER_NOT_FOUND', async client => {
      await client.query(`INSERT INTO user_blocks(blocker_id,blocked_id,created_at) VALUES($1,$2,clock_timestamp())
        ON CONFLICT (blocker_id,blocked_id) DO NOTHING`, [viewer, target])
      // Keep request timestamps/history and shared memberships; revoke only this pair's active relationship.
      await client.query(`UPDATE friendships SET status='ended',responded_at=COALESCE(responded_at,clock_timestamp())
        WHERE status IN ('accepted','pending')
          AND ((requester_id=$1 AND recipient_id=$2) OR (requester_id=$2 AND recipient_id=$1))`, [viewer, target])
    })
  }

  async unblock(viewer: string, target: string): Promise<void> {
    await this.mutatePair(viewer, target, 'USER_NOT_FOUND', async client => {
      await client.query('DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2', [viewer, target])
    })
  }

  private async rows<T extends Record<string, unknown>>(sql: string, values: unknown[]): Promise<T[]> {
    try { return (await this.database.connection.query<T>(sql, values)).rows }
    catch { throw new ServiceUnavailableException({ error: { code: 'SOCIAL_UNAVAILABLE' } }) }
  }

  async friends(viewer: string, query: Query): Promise<CursorPage<Friend>> {
    const p = pagination(query, `friends:${viewer}`)
    const rows = await this.rows<Friend & Record<string, unknown>>(`${edges}
      SELECT ${person}, u.main_title_key AS title FROM users u JOIN edges e ON e.b=u.id
      WHERE e.a=$1 AND ${visible}
        AND (strpos(lower(u.display_name),$2)>0 OR strpos(u.handle,$2)>0)
        AND ($3::text IS NULL OR (u.display_name COLLATE "C",u.id)>($3::text COLLATE "C",$4::uuid))
      ORDER BY u.display_name COLLATE "C",u.id LIMIT $5`, [viewer,p.q,p.name,p.id,p.limit+1])
    return page(rows, p, u => [u.displayName,u.userId])
  }

  async requests(viewer: string): Promise<FriendRequests> {
    const rows = await this.rows<Record<string, unknown> & { direction: 'incoming' | 'outgoing'; id: string; user: PersonCard; mutualFriends: number; createdAt: string }>(`${edges}
      SELECT f.id, CASE WHEN f.recipient_id=$1 THEN 'incoming' ELSE 'outgoing' END AS direction,
        json_build_object('userId',u.id,'displayName',u.display_name,'handle',u.handle,'avatarUrl',u.avatar_url) AS "user",
        ${mutual} AS "mutualFriends",
        to_char(f.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
      FROM friendships f JOIN users u ON u.id=CASE WHEN f.requester_id=$1 THEN f.recipient_id ELSE f.requester_id END
      WHERE f.status='pending' AND (f.requester_id=$1 OR f.recipient_id=$1) AND ${visible}
      ORDER BY f.created_at DESC,f.id`, [viewer])
    const result: FriendRequests = { incoming: [], outgoing: [] }
    for (const { direction, ...request } of rows) result[direction].push(request)
    return result
  }

  async search(viewer: string, raw: unknown): Promise<UserCard> {
    if (typeof raw !== 'string') throw new BadRequestException({ error: { code: 'INVALID_REQUEST' } })
    const handle = raw.trim().toLowerCase().replace(/^@/, '')
    const rows = await this.rows<UserCard & Record<string, unknown>>(`${edges}
      SELECT ${person},u.main_title_key AS title, ${mutual} AS "mutualFriends",
        CASE WHEN u.id=$1 THEN 'self' WHEN f.status='accepted' THEN 'friend'
          WHEN f.status='pending' AND f.requester_id=$1 THEN 'request_sent'
          WHEN f.status='pending' THEN 'request_received' ELSE 'none' END AS relationship,
        CASE WHEN f.status='pending' THEN f.id ELSE NULL END AS "requestId"
      FROM users u LEFT JOIN friendships f ON ((f.requester_id=$1 AND f.recipient_id=u.id)
        OR (f.recipient_id=$1 AND f.requester_id=u.id)) AND f.status IN ('accepted','pending')
      WHERE u.handle=$2 AND ${visible}`, [viewer,handle])
    if (!rows[0]) throw new NotFoundException({ error: { code: 'USER_NOT_FOUND' } })
    return rows[0]
  }

  async mutualFriends(viewer: string, target: string, query: Query): Promise<CursorPage<PersonCard>> {
    if (!uuid(target)) throw new NotFoundException({ error: { code: 'USER_NOT_FOUND' } })
    const p = pagination(query, `mutual:${viewer}:${target}`)
    const targetRows = await this.rows(`SELECT u.id FROM users u WHERE u.id=$2 AND ${visible}`, [viewer,target])
    if (!targetRows.length) throw new NotFoundException({ error: { code: 'USER_NOT_FOUND' } })
    const rows = await this.rows<PersonCard & Record<string, unknown>>(`${edges}
      SELECT ${person} FROM users u JOIN edges x ON x.b=u.id JOIN edges y ON y.b=u.id
      WHERE x.a=$1 AND y.a=$2 AND ${visible}
        AND ($3::text IS NULL OR (u.display_name COLLATE "C",u.id)>($3::text COLLATE "C",$4::uuid))
      ORDER BY u.display_name COLLATE "C",u.id LIMIT $5`, [viewer,target,p.name,p.id,p.limit+1])
    return page(rows, p, u => [u.displayName,u.userId])
  }

  async gangs(viewer: string, query: Query): Promise<CursorPage<GangSummary>> {
    const p = pagination(query, `gangs:${viewer}`)
    const rows = await this.rows<GangSummary & Record<string, unknown>>(`SELECT s.gang_id AS id,s.name,
        (SELECT count(*)::int FROM gang_members members WHERE members.gang_id=s.gang_id AND members.left_at IS NULL) AS "memberCount"
      FROM gang_settings s JOIN gang_members mine ON mine.gang_id=s.gang_id AND mine.user_id=$1 AND mine.left_at IS NULL
      WHERE strpos(lower(s.name),$2)>0
        AND ($3::text IS NULL OR (s.name COLLATE "C",s.gang_id)>($3::text COLLATE "C",$4::uuid))
      ORDER BY s.name COLLATE "C",s.gang_id LIMIT $5`, [viewer,p.q,p.name,p.id,p.limit+1])
    return page(rows, p, g => [g.name,g.id])
  }
}
