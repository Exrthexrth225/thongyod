import type { BossActionRequest, BossBoardSpace, BossDealPlacard, BossHandCard, BossRoomSettings, BossView, InvestorTeam } from '../src/boss.js'

export interface BossBoardDefinition {
  spaces: Array<Omit<BossBoardSpace, 'closedByDeal' | 'closedByBossId'>>
  dealPlacards: BossDealPlacard[]
}

type DealState = Omit<NonNullable<BossView['deal']>, 'providers' | 'agreedTeams' | 'contributorIds' | 'canClose'>

export interface BossInternalState {
  revision: number
  phase: BossView['phase']
  settings: BossRoomSettings
  placards: number[]
  dealIndex: number
  firstPlayerId: string
  turnPlayerId: string
  markerChooserId: string
  markerSpace: number | null
  lastRoll: number | null
  deck: BossHandCard[]
  discard: BossHandCard[]
  availableInvestors: InvestorTeam[]
  spaces: BossBoardSpace[]
  seats: Array<{ id: string; investors: InvestorTeam[]; cash: number; hand: BossHandCard[] }>
  deal: DealState | null
  interrupt: BossView['interrupt']
  lastEndRoll: BossView['lastEndRoll']
  lastSettlement: BossView['lastSettlement']
  discardActorId: string | null
  discardNextTurnId: string | null
  processedActionIds: string[]
  winnerIds: string[]
  events: BossView['events']
}

type Random = (upperBound: number) => number
type Failure = { ok: false; status: number; code: string }

export const TEAMS: readonly InvestorTeam[]
export const HAND_LIMIT: number
export const START_HAND: number
export const STOP_WINDOW_MS: number
export const CLOSING_MS: number
export function buildDeck(): BossHandCard[]
export function cashTierOf(cash: number): BossView['seats'][number]['cashTier']
export function activeTeamProviders(state: BossInternalState): Partial<Record<InvestorTeam, string[]>>
export function contributorIds(state: BossInternalState): string[]
export function agreedTeams(state: BossInternalState): InvestorTeam[]
export function canCloseDeal(state: BossInternalState): { ok: true } | { ok: false; reason: string }
export function createBossGame(seatIds: readonly string[], settings: Partial<BossRoomSettings> | undefined, board: BossBoardDefinition, randomIndex: Random, nowMs?: number): BossInternalState
export function bossDeadline(state: BossInternalState): string | null
export function resolveBossDeadlines(state: BossInternalState, board: BossBoardDefinition, randomIndex: Random, nowMs?: number): { state: BossInternalState; changed: boolean }
export function applyBossAction(state: BossInternalState, actorId: string, request: BossActionRequest, board: BossBoardDefinition, randomIndex: Random, nowMs?: number): { ok: true; state: BossInternalState; duplicate?: boolean } | Failure
export function blockingIds(state: BossInternalState): string[]
export function skipBossPlayer(state: BossInternalState, targetId: string, randomIndex: Random, nowMs?: number): { ok: true; state: BossInternalState } | Failure
export function removeBossPlayer(state: BossInternalState, leavingId: string, randomIndex: Random, nowMs?: number): BossInternalState
export function projectBossView(state: BossInternalState, viewerId: string, board: BossBoardDefinition): BossView
