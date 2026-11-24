export interface PersonCard { userId: string; displayName: string; handle: string; avatarUrl: string | null }
export interface Friend extends PersonCard { title: string | null }
export interface UserCard extends Friend {
  mutualFriends: number
  relationship: 'self' | 'none' | 'friend' | 'request_sent' | 'request_received'
  requestId: string | null
}
export interface FriendRequest { id: string; user: PersonCard; mutualFriends: number; createdAt: string }
export interface FriendRequests { incoming: FriendRequest[]; outgoing: FriendRequest[] }
export interface GangSummary { id: string; name: string; memberCount: number }
export interface CursorPage<T> { items: T[]; nextCursor: string | null }

// APPROVED — GET /gangs activity contract (DECISIONS #133). GangSummary stays compatible.
export interface GangActivitySummary extends GangSummary {
  nextMeetup: { id: string; title: string; startsAt: string } | null
  unreadCount: number
  /** Server UTC timestamp; null until this membership has opened the gang. */
  lastOpenedAt: string | null
  /** Opaque snapshot watermark scoped to this user, gang and membership period. */
  readCursor: string
}
export type ListGangsResponse = CursorPage<GangActivitySummary>
/** PUT /gangs/:gangId/activity/read, sent only when the gang is opened. */
export interface ReadGangActivityRequest { readThrough: string }
export interface ReadGangActivityResponse { lastOpenedAt: string; readThrough: string }
export interface GangActivityErrorResponse {
  error: { code: 'INVALID_REQUEST' | 'UNAUTHENTICATED' | 'AUTH_UNAVAILABLE'
    | 'ORIGIN_NOT_ALLOWED' | 'GANG_NOT_FOUND' | 'ACTIVITY_UNAVAILABLE' | 'SOCIAL_UNAVAILABLE' }
}
export interface BlockUserRequest { userId: string }
export interface SendFriendRequest { userId: string }
export interface SocialMutationErrorResponse {
  error: { code: 'INVALID_REQUEST' | 'UNAUTHENTICATED' | 'AUTH_UNAVAILABLE' | 'ORIGIN_NOT_ALLOWED' | 'DEV_ACCESS_DENIED'
    | 'USER_NOT_FOUND' | 'REQUEST_NOT_FOUND' | 'NOT_FRIENDS' | 'SOCIAL_UNAVAILABLE'
    | 'CANNOT_ADD_SELF' | 'ALREADY_FRIENDS' | 'REQUEST_EXISTS' | 'DAILY_LIMIT_REACHED' | 'LINK_INVALID' | 'LINK_ROTATION_REQUIRED' }
}

// Deprecated draft names remain type-only aliases for existing consumers.
export type DraftGangSummary = GangActivitySummary
export type DraftListGangsResponse = ListGangsResponse
export type DraftReadGangActivityRequest = ReadGangActivityRequest
export type DraftReadGangActivityResponse = ReadGangActivityResponse
export type DraftGangActivityErrorResponse = GangActivityErrorResponse
