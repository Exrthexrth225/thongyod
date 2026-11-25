import type { RoomIdentity } from '@thongyod/shared'
import { ME, person } from './db'
import { checkDisplayName } from '@/features/profile/validation'

const KEY = 'thongyod-demo-room-identity'
const guests = new Map<string, { userId: string; displayName: string; avatarUrl: null; isGuest: true }>()
let identity: RoomIdentity = { kind: 'account', playerId: ME, displayName: person(ME).displayName, expiresAt: null }
try {
  const stored = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as RoomIdentity | null
  if (stored?.kind === 'anonymous') identity = stored
  else if (stored?.kind === 'guest' && stored.playerId && stored.displayName && Date.parse(stored.expiresAt ?? '') > Date.now()) {
    identity = stored
    guests.set(stored.playerId, { userId: stored.playerId, displayName: stored.displayName, avatarUrl: null, isGuest: true })
  } else if (stored?.kind === 'guest') identity = { kind: 'anonymous', playerId: null, displayName: null, expiresAt: null }
} catch { /* The demo also works when storage is unavailable. */ }

export let mockPlayerId = identity.playerId ?? ''
function save(next: RoomIdentity) {
  identity = next; mockPlayerId = next.playerId ?? ''
  try { sessionStorage.setItem(KEY, JSON.stringify(next)) } catch { /* In-page state still works. */ }
  return next
}
export function mockIdentity(): RoomIdentity {
  if (identity.kind === 'guest' && Date.parse(identity.expiresAt ?? '') <= Date.now()) mockLogout()
  return identity
}
export function mockLogout() { return save({ kind: 'anonymous', playerId: null, displayName: null, expiresAt: null }) }
export function mockGuest(body: unknown): RoomIdentity | null {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('displayName' in body) || typeof body.displayName !== 'string' || checkDisplayName(body.displayName) !== null) return null
  const current = mockIdentity()
  if (current.kind !== 'anonymous') return current
  const userId = crypto.randomUUID(), displayName = body.displayName.trim()
  guests.set(userId, { userId, displayName, avatarUrl: null, isGuest: true })
  return save({ kind: 'guest', playerId: userId, displayName, expiresAt: new Date(Date.now() + 10800000).toISOString() })
}
export const mockRoomPerson = (id: string) => guests.get(id) ?? person(id)
