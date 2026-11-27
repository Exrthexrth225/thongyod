import type { PersonCard } from './social.js'
import type { BossActionPayload, BossRoomSettings, BossView } from './boss.js'
type PersonRef = Omit<PersonCard, 'handle'>

/** Games that can be played with each friend on their own phone. */
export type RoomGame = 'spy' | 'mostLikely' | 'neverHave' | 'boss'
export type RoomState = 'lobby' | 'playing' | 'revealed'

/** สายลับ settings chosen by the host. */
export type SpyRoomSettings = { mode: 'places' | 'pairs'; spies: number; minutes: 3 | 5 | 8; packs: string[] }
/** ใครน่าจะ… / ไม่เคย… settings: which card packs (ids from config/games/party.ts). */
export type PartyRoomSettings = { packs: string[] }

/** userId is the legacy room-player identifier; guest IDs do not identify app accounts. */
export type RoomPlayer = PersonRef & { isHost: boolean; isGuest?: boolean }

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
  /** The server marks the round once its time is up. The host still decides when to reveal. */
  timeUp?: boolean
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

/** A shared Board Screen (e.g. an iPad on the table). It holds no seat and cannot act. */
export type RoomBoardStatus = 'pending' | 'approved' | 'rejected' | 'revoked'
export type RoomBoard = { id: string; /** 4 characters shown on the board and on the owner's phone. */ label: string; status: RoomBoardStatus; createdAt: string }

type RoomBase = {
  /** 6 digits; also used in the join link /games/rooms/:code. */
  code: string
  /** Bumped by every committed change. A client keeps the snapshot with the highest revision. */
  revision: number
  /** Match + state + round. Commands send it back; a command for an old phase is rejected (STALE_PHASE). */
  phase: string
  /** Seated players with a live connection to this room. */
  online: string[]
  /** Owner only: Board Screens asking to pair, or paired. Empty for everyone else. */
  boards: RoomBoard[]
  /** True when the owner has been away long enough that this player may take over (claimHost). */
  canClaimHost: boolean
  /** True on a paired Board Screen's view (public data only). */
  isBoard: boolean
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

/** I'm the Boss! (3–6 players). `boss` is projected per viewer: own hand and exact cash only. */
export type BossRoomData = RoomBase & {
  game: 'boss'
  settings: BossRoomSettings
  /** null in the lobby or when not a player / board. */
  boss: BossView | null
}

/** GET /rooms/:code (REST fallback); live snapshots come over the room socket. */
export type Room = SpyRoomData | PartyRoomData | BossRoomData

/** Commands sent over the room socket (or REST as a fallback). */
export type RoomCommandType =
  | 'join' | 'leave' | 'start' | 'reveal' | 'lobby' | 'vote' | 'settings'
  | 'claimHost' | 'boardApprove' | 'boardReject' | 'boardRevoke'
  /** I'm the Boss! move (payload: BossCommandPayload). Host only: bossSkip / bossKick an offline player who holds the game up. */
  | 'boss' | 'bossSkip' | 'bossKick'

export type BossCommandPayload = { action: BossActionPayload }
export type BossHostPayload = { targetId: string }

export type RoomCommand = {
  code: string
  /** UUID made by the client. Retrying with the same id and payload returns the first result. */
  actionId: string
  type: RoomCommandType
  /** The `phase` of the snapshot the player acted on. Required for in-game commands. */
  phase?: string
  payload?: unknown
}

export type RoomCommandResult = { ok: true; revision: number } | { ok: false; status: number; code: string }

/** Socket events (path /api/socket.io). Server → client: */
export type RoomServerEvents = {
  /** A full snapshot for this connection. `control`: this tab may act for the seat. */
  'room:view': (data: { room: Room; control: boolean }) => void
  /** Board Screen pairing state while it is not approved. */
  'room:board': (data: { code: string; board: Pick<RoomBoard, 'label' | 'status'> }) => void
  'room:closed': (data: { code: string }) => void
}

/** Client → server. Every handler answers through the acknowledgement callback. */
export type RoomClientEvents = {
  'room:watch': (data: { code: string; takeControl?: boolean }, ack: (result: RoomCommandResult) => void) => void
  'room:command': (command: RoomCommand, ack: (result: RoomCommandResult) => void) => void
}

/** POST /rooms/:code/boards and GET /rooms/:code/board (Board Screen, cookie-bound). */
export type RoomBoardSession = { board: Pick<RoomBoard, 'id' | 'label' | 'status'>; room: Room | null }
