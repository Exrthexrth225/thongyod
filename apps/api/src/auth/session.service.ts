import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import type { IncomingMessage } from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'
import { DatabaseService } from '../db/database.service.js'
import { ALLOW_DEV_SESSIONS, assertDevRequest, devLoginEnabled } from './policy.js'
import { readSessionCookie, sessionHash } from './cookie.js'
import type { Me, UpdateMeRequest } from '@thongyod/shared'

export const meColumns = `u.id AS "userId", u.display_name AS "displayName", u.handle,
  u.avatar_url AS "avatarUrl", u.cover_url AS "coverUrl", u.main_title_key AS title, u.bio,
  CASE WHEN u.handle_changed_at + interval '720 hours' > statement_timestamp()
    THEN to_char((u.handle_changed_at + interval '720 hours') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ELSE NULL END AS "handleChangeableAt"`

function profilePatch(body: unknown): UpdateMeRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !['displayName', 'bio', 'handle'].includes(key))) {
    throw new BadRequestException({ error: { code: 'INVALID_REQUEST' } })
  }
  const patch: UpdateMeRequest = {}
  if ('displayName' in body) {
    if (typeof body.displayName !== 'string') throw new BadRequestException({ error: { code: 'INVALID_DISPLAY_NAME' } })
    const name = body.displayName.trim().normalize('NFC')
    if ([...name].length < 2 || [...name].length > 20 || !/^[\p{Script=Thai}A-Za-z0-9 ._-]+$/u.test(name)) {
      throw new BadRequestException({ error: { code: 'INVALID_DISPLAY_NAME' } })
    }
    patch.displayName = name
  }
  if ('bio' in body) {
    if (body.bio !== null && typeof body.bio !== 'string') throw new BadRequestException({ error: { code: 'INVALID_BIO' } })
    const bio = body.bio?.trim() ?? ''
    if ([...bio].length > 80) throw new BadRequestException({ error: { code: 'INVALID_BIO' } })
    patch.bio = bio || null
  }
  if ('handle' in body) {
    if (typeof body.handle !== 'string') throw new BadRequestException({ error: { code: 'INVALID_HANDLE' } })
    const handle = body.handle.trim().toLowerCase().replace(/^@/, '')
    if (!/^[a-z][a-z0-9._]{3,19}$/.test(handle)) throw new BadRequestException({ error: { code: 'INVALID_HANDLE' } })
    patch.handle = handle
  }
  return patch
}

@Injectable()
export class SessionService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(ALLOW_DEV_SESSIONS) private readonly allowDevSessions: boolean,
  ) {}

  async me(request: IncomingMessage): Promise<Me> {
    const token = readSessionCookie(request)
    if (!token) throw new UnauthorizedException({ error: { code: 'UNAUTHENTICATED' } })
    let row: (Me & { source: 'line' | 'local_dev' }) | undefined
    try {
      const result = await this.database.connection.query<Me & { source: 'line' | 'local_dev' }>(
        `SELECT ${meColumns}, s.source FROM auth_sessions s JOIN users u ON u.id=s.user_id
         WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()`, [sessionHash(token)],
      )
      row = result.rows[0]
    } catch { throw new ServiceUnavailableException({ error: { code: 'AUTH_UNAVAILABLE' } }) }
    if (!row || (row.source === 'local_dev' && (!this.allowDevSessions || !devLoginEnabled()))) {
      throw new UnauthorizedException({ error: { code: 'UNAUTHENTICATED' } })
    }
    if (row.source === 'local_dev') assertDevRequest(request)
    return { userId: row.userId, displayName: row.displayName, handle: row.handle, handleChangeableAt: row.handleChangeableAt,
      avatarUrl: row.avatarUrl, coverUrl: row.coverUrl, title: row.title, bio: row.bio }
  }

  async updateMe(request: IncomingMessage, body: unknown): Promise<Me> {
    const me = await this.me(request)
    const patch = profilePatch(body)
    if (Object.keys(patch).length === 0) return me
    const client = await Promise.resolve().then(() => this.database.connection.connect()).catch(() => {
      throw new ServiceUnavailableException({ error: { code: 'AUTH_UNAVAILABLE' } })
    })
    try {
      await client.query('BEGIN')
      const locked = await client.query<Me>(`SELECT ${meColumns} FROM users u WHERE u.id=$1 FOR UPDATE`, [me.userId])
      const current = locked.rows[0]
      if (!current) throw new UnauthorizedException({ error: { code: 'UNAUTHENTICATED' } })
      if (patch.handle !== undefined && patch.handle !== current.handle && current.handleChangeableAt) {
        throw new HttpException({ error: { code: 'HANDLE_CHANGE_TOO_SOON', retryAt: current.handleChangeableAt } }, HttpStatus.TOO_MANY_REQUESTS)
      }
      const result = await client.query<Me>(
        `UPDATE users AS u SET
          display_name=CASE WHEN $2 THEN $3::text ELSE u.display_name END,
          display_name_key=CASE WHEN $2 THEN lower(normalize($3::text, NFC)) ELSE u.display_name_key END,
          bio=CASE WHEN $4 THEN $5::text ELSE u.bio END,
          handle_changed_at=CASE WHEN $6 AND u.handle IS DISTINCT FROM $7::text THEN clock_timestamp() ELSE u.handle_changed_at END,
          handle=CASE WHEN $6 THEN $7::text ELSE u.handle END
         WHERE u.id=$1 RETURNING ${meColumns}`,
        [me.userId, patch.displayName !== undefined, patch.displayName ?? null,
          patch.bio !== undefined, patch.bio ?? null, patch.handle !== undefined, patch.handle ?? null],
      )
      await client.query('COMMIT')
      return result.rows[0]
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      if (error instanceof HttpException) throw error
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505'
        && 'constraint' in error && error.constraint === 'users_handle_unique') {
        throw new ConflictException({ error: { code: 'HANDLE_TAKEN' } })
      }
      throw new ServiceUnavailableException({ error: { code: 'AUTH_UNAVAILABLE' } })
    } finally { client.release() }
  }

  async createDevSession(userId: string, request: IncomingMessage): Promise<{ token: string; expiresAt: Date }> {
    if (!this.allowDevSessions || !devLoginEnabled()) throw new UnauthorizedException({ error: { code: 'UNAUTHENTICATED' } })
    assertDevRequest(request)
    const token = randomBytes(32).toString('base64url')
    const previous = readSessionCookie(request)
    const client = await Promise.resolve().then(() => this.database.connection.connect()).catch(() => {
      throw new ServiceUnavailableException({ error: { code: 'AUTH_UNAVAILABLE' } })
    })
    try {
      await client.query('BEGIN')
      if (previous) await client.query('UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1 AND revoked_at IS NULL', [sessionHash(previous)])
      const result = await client.query<{ expiresAt: Date }>(
        `INSERT INTO auth_sessions(id,user_id,token_hash,source,created_at,expires_at)
         VALUES($1,$2,$3,'local_dev',statement_timestamp(),statement_timestamp()+interval '2592000 seconds') RETURNING expires_at AS "expiresAt"`,
        [randomUUID(), userId, sessionHash(token)],
      )
      await client.query('COMMIT')
      return { token, expiresAt: result.rows[0].expiresAt }
    } catch {
      await client.query('ROLLBACK').catch(() => undefined)
      throw new ServiceUnavailableException({ error: { code: 'AUTH_UNAVAILABLE' } })
    } finally { client.release() }
  }

  async logout(request: IncomingMessage): Promise<void> {
    const token = readSessionCookie(request)
    if (!token) return
    try {
      await this.database.connection.query('UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1 AND revoked_at IS NULL', [sessionHash(token)])
    } catch { throw new ServiceUnavailableException({ error: { code: 'AUTH_UNAVAILABLE' } }) }
  }
}
