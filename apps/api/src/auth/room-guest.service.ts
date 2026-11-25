import { BadRequestException, ConflictException, HttpException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { randomBytes, randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { PoolClient } from 'pg'
import type { RoomIdentity } from '@thongyod/shared'
import { DatabaseService } from '../db/database.service.js'
import { GUEST_COOKIE, readGuestCookie, readSessionCookie, sessionHash } from './cookie.js'
import { secureCookie } from './policy.js'
import { profilePatch, SessionService } from './session.service.js'

export type RoomActor = { kind: 'account' | 'guest'; playerId: string; tokenHash: string }
export const anonymousRoomIdentity = (): RoomIdentity => ({ kind: 'anonymous', playerId: null, displayName: null, expiresAt: null })
const unavailable = () => new ServiceUnavailableException({ error: { code: 'AUTH_UNAVAILABLE' } })
const unauthorized = () => new UnauthorizedException({ error: { code: 'UNAUTHENTICATED' } })

export function guestCookie(token = ''): string {
  return `${GUEST_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? 10800 : 0}${secureCookie() ? '; Secure' : ''}`
}

@Injectable()
export class RoomGuestService {
  constructor(private readonly database: DatabaseService, private readonly sessions: SessionService) {}

  async identity(request: IncomingMessage): Promise<RoomIdentity> {
    try {
      const me = await this.sessions.me(request)
      return { kind: 'account', playerId: me.userId, displayName: me.displayName, expiresAt: null }
    } catch (error) {
      // An auth outage must not switch an account to a guest.
      if (!(error instanceof HttpException) || error.getStatus() !== 401) throw error
    }
    const token = readGuestCookie(request)
    if (!token) return anonymousRoomIdentity()
    try {
      const row = (await this.database.connection.query<{ id: string; display_name: string; expires_at: Date }>(
        'SELECT id,display_name,expires_at FROM game_guest_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()', [sessionHash(token)],
      )).rows[0]
      return row ? { kind: 'guest', playerId: row.id, displayName: row.display_name, expiresAt: row.expires_at.toISOString() } : anonymousRoomIdentity()
    } catch { throw unavailable() }
  }

  async actor(request: IncomingMessage): Promise<RoomActor> {
    const identity = await this.identity(request)
    if (identity.kind === 'anonymous' || !identity.playerId) throw unauthorized()
    const token = identity.kind === 'account' ? readSessionCookie(request) : readGuestCookie(request)
    if (!token) throw unauthorized()
    return { kind: identity.kind, playerId: identity.playerId, tokenHash: sessionHash(token) }
  }

  // Lock the credential before the room; logout serializes with late room actions.
  async assertActive(client: PoolClient, actor: RoomActor): Promise<void> {
    const table = actor.kind === 'guest' ? 'game_guest_sessions' : 'auth_sessions'
    const column = actor.kind === 'guest' ? 'id' : 'user_id'
    const row = await client.query(`SELECT id FROM ${table} WHERE token_hash=$1 AND ${column}=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE`, [actor.tokenHash, actor.playerId])
    if (!row.rowCount) throw unauthorized()
  }

  async create(request: IncomingMessage, body: unknown): Promise<{ identity: RoomIdentity; cookie?: string }> {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('displayName' in body)) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST' } })
    }
    const displayName = profilePatch(body).displayName!
    const existing = await this.identity(request)
    if (existing.kind === 'account') throw new ConflictException({ error: { code: 'ACCOUNT_SESSION_ACTIVE' } })
    if (existing.kind === 'guest') return { identity: existing }
    const token = randomBytes(32).toString('base64url'), id = randomUUID()
    try {
      const row = (await this.database.connection.query<{ expires_at: Date }>(
        "INSERT INTO game_guest_sessions(id,display_name,token_hash,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '3 hours') RETURNING expires_at", [id, displayName, sessionHash(token)],
      )).rows[0]
      return { identity: { kind: 'guest', playerId: id, displayName, expiresAt: row.expires_at.toISOString() }, cookie: guestCookie(token) }
    } catch { throw unavailable() }
  }
}
