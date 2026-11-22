import { ConflictException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { randomBytes, randomUUID } from 'node:crypto'
import { DatabaseService } from '../db/database.service.js'
import { SocialService } from './social.service.js'
import { decryptLink, encryptLink, linkHash } from './link-token.js'

@Injectable()
export class FriendLinksService {
  constructor(private readonly database: DatabaseService, private readonly social: SocialService) {}

  async own(viewer: string, rotate = false): Promise<{ code: string }> {
    const client = await this.database.connection.connect().catch(() => { throw new ServiceUnavailableException({ error: { code: 'SOCIAL_UNAVAILABLE' } }) })
    try {
      await client.query('BEGIN')
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [viewer])
      const old = (await client.query<{ id: string; encrypted_token: string | null; token_hash: string; fixture_key: string | null }>(`SELECT t.id,t.encrypted_token,t.token_hash,u.fixture_key
        FROM friend_link_tokens t JOIN users u ON u.id=t.user_id WHERE t.user_id=$1 AND t.revoked_at IS NULL`, [viewer])).rows[0]
      let code: string
      if (old && !rotate) {
        const context = `friend-link:${viewer}:${old.id}`
        if (old.encrypted_token) code = decryptLink(old.encrypted_token, context)
        else {
          // Only locally seeded tokens are recoverable; unknown legacy links require explicit rotation.
          const fixture = `local-fixture-friend-${old.fixture_key}-v1`
          if (process.env.NODE_ENV !== 'development' || process.env.APP_ENV !== 'local' || !old.fixture_key || linkHash(fixture) !== old.token_hash) {
            throw new ConflictException({ error: { code: 'LINK_ROTATION_REQUIRED' } })
          }
          code = fixture
          await client.query('UPDATE friend_link_tokens SET encrypted_token=$2 WHERE id=$1', [old.id, encryptLink(code, context)])
        }
      } else {
        const id = randomUUID()
        code = randomBytes(32).toString('base64url')
        const encrypted = encryptLink(code, `friend-link:${viewer}:${id}`)
        await client.query('UPDATE friend_link_tokens SET revoked_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL', [viewer])
        await client.query('INSERT INTO friend_link_tokens(id,user_id,token_hash,encrypted_token,created_at) VALUES($1,$2,$3,$4,clock_timestamp())', [id, viewer, linkHash(code), encrypted])
      }
      await client.query('COMMIT')
      return { code }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      if (error instanceof HttpException) throw error
      throw new ServiceUnavailableException({ error: { code: 'SOCIAL_UNAVAILABLE' } })
    } finally { client.release() }
  }

  async resolve(viewer: string, code: string) {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(code)) throw new NotFoundException({ error: { code: 'LINK_INVALID' } })
    const result = await this.database.connection.query<{ handle: string }>(`SELECT u.handle FROM friend_link_tokens t
      JOIN users u ON u.id=t.user_id WHERE t.token_hash=$1 AND t.revoked_at IS NULL`, [linkHash(code)])
      .catch(() => { throw new ServiceUnavailableException({ error: { code: 'SOCIAL_UNAVAILABLE' } }) })
    if (!result.rows[0]) throw new NotFoundException({ error: { code: 'LINK_INVALID' } })
    try { return await this.social.search(viewer, result.rows[0].handle) }
    catch (error) {
      if (error instanceof NotFoundException) throw new NotFoundException({ error: { code: 'LINK_INVALID' } })
      throw error
    }
  }
}
