import { BadRequestException, ServiceUnavailableException } from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { PoolClient } from 'pg'

export const activityInvalid = () => new BadRequestException({ error: { code: 'INVALID_REQUEST' } })
export const activityUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v)
const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(v) && Number.isFinite(Date.parse(v))
const snapshot = (v: unknown): v is string => typeof v === 'string' && /^\d+:\d+:(\d+(,\d+)*)?$/.test(v)
export const exactTime = (column: string) => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

export async function activityContext(client: PoolClient) {
  const row = (await client.query<{ key: string; snapshot: string; at: string }>(`SELECT cursor_key AS key,
    txid_current_snapshot()::text AS snapshot,${exactTime('clock_timestamp()')} AS at FROM activity_epoch WHERE singleton`)).rows[0]
  if (!row) throw new ServiceUnavailableException({ error: { code: 'ACTIVITY_UNAVAILABLE' } })
  return row
}

export function activityToken(key: string, values: string[]) {
  const data = Buffer.from(JSON.stringify(values)).toString('base64url')
  return data + '.' + createHmac('sha256', key).update(data).digest('base64url')
}

export function parseActivityToken(key: string, token: unknown, kind: 'feed' | 'gang-read', viewer: string): string[] {
  try {
    if (typeof token !== 'string' || token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) throw activityInvalid()
    const [data, signature] = token.split('.')
    const expected = createHmac('sha256', key).update(data).digest()
    const actual = Buffer.from(signature, 'base64url')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw activityInvalid()
    const values: unknown = JSON.parse(Buffer.from(data, 'base64url').toString())
    if (!Array.isArray(values) || values.length !== 6 || values.some(v => typeof v !== 'string') || values[0] !== kind || values[1] !== viewer) throw activityInvalid()
    if (kind === 'feed') {
      if (!snapshot(values[2]) || !instant(values[3]) || !instant(values[4]) || !activityUuid(values[5]) || values[4] > values[3]) throw activityInvalid()
    } else if (!activityUuid(values[2]) || !activityUuid(values[3]) || !snapshot(values[4]) || !instant(values[5])) throw activityInvalid()
    return values
  } catch { throw activityInvalid() }
}

// Both derived lists exclude private targets/actors before sorting, counting or paging.
export const visibleActivity = `m.created_by<>$1 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE
  (b.blocker_id=$1 AND b.blocked_id=m.created_by) OR (b.blocked_id=$1 AND b.blocker_id=m.created_by))
  AND NOT EXISTS(SELECT 1 FROM meetup_responses r WHERE r.meetup_id=m.id AND r.user_id=$1 AND r.hidden_at IS NOT NULL)`
