import type { PersonCard } from './social.js'
type PersonRef = Omit<PersonCard, 'handle'>

/** Games that can be played with each friend on their own phone. */
export type RoomGame = 'spy' | 'mostLikely' | 'neverHave'
export type RoomState = 'lobby' | 'playing' | 'revealed'

/** สายลับ settings chosen by the host. */
export type SpyRoomSettings = { mode: 'places' | 'pairs'; spies: number; minutes: 3 | 5 | 8; packs: string[] }
/** ใครน่าจะ… / ไม่เคย… settings: which card packs (ids from config/games/party.ts). */
export type PartyRoomSettings = { packs: string[] }

export type RoomPlayer = PersonRef & { isHost: boolean }

/** What only I can see this round. */
export type SpySecret = { isSpy: boolean; /** The place / my word; null for the spy in places mode. */ text: string | null }

export type RoomRound = {
  number: number
  startedAt: string
  endsAt: string
  /** Who asks first. */
  firstPlayerId: string
  /** Set after the host reveals: who the spies were and the words. */
  reveal: { spyIds: string[]; secret: string; spyWord: string | null } | null
}

/**
 * One card of ใครน่าจะ… / ไม่เคย…. Everyone answers on their own phone:
 * ใครน่าจะ… = the userId of a player (anonymous), ไม่เคย… = 'have' | 'never' (shown with names).
 */
export type PartyRound = {
  number: number
  card: string
  pack: string
  /** Who has answered (not what). */
  votedIds: string[]
  myVote: string | null
  /** After the host reveals, or by itself when everyone answered. */
  result: {
    /** ใครน่าจะ…: votes per player id. ไม่เคย…: { have, never }. */
    tally: Record<string, number>
    /** ไม่เคย…: who has done it (they fold a finger). Empty for ใครน่าจะ…. */
    haveIds: string[]
  } | null
}

type RoomBase = {
  /** 6 digits; also used in the join link /games/rooms/:code. */
  code: string
  state: RoomState
  hostId: string
  players: RoomPlayer[]
  maxPlayers: number
  /** Am I in this room? false = I opened a link and can join. */
  joined: boolean
  expiresAt: string
}

export type SpyRoomData = RoomBase & {
  game: 'spy'
  settings: SpyRoomSettings
  round: RoomRound | null
  /** Private to the caller. null outside a round or when not a player. */
  mySecret: SpySecret | null
}

export type PartyRoomData = RoomBase & {
  game: 'mostLikely' | 'neverHave'
  settings: PartyRoomSettings
  round: PartyRound | null
  /** ไม่เคย…: fingers left per player id (start 5, reset when the host goes back to the room). null for ใครน่าจะ…. */
  fingers: Record<string, number> | null
}

/** GET /rooms/:code — poll every ~1.5 s while open (real-time push can replace polling later). */
export type Room = SpyRoomData | PartyRoomData
