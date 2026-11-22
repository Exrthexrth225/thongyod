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
export interface BlockUserRequest { userId: string }
export interface SocialMutationErrorResponse {
  error: { code: 'INVALID_REQUEST' | 'UNAUTHENTICATED' | 'AUTH_UNAVAILABLE' | 'ORIGIN_NOT_ALLOWED' | 'DEV_ACCESS_DENIED'
    | 'USER_NOT_FOUND' | 'REQUEST_NOT_FOUND' | 'NOT_FRIENDS' | 'SOCIAL_UNAVAILABLE' }
}
