import type { BossActionRequest, BossBoardSpace, BossDealPlacard, BossRoomSettings, BossView, InvestorTeam } from '../src/boss.js'

export interface BossBoardDefinition {
  spaces: Array<Omit<BossBoardSpace, 'closedByDeal' | 'closedByBossId'>>
  dealPlacards: BossDealPlacard[]
}

export interface BossInternalState {
  revision: number
  phase: BossView['phase']
  settings: BossRoomSettings
  firstPlayerId: string
  turnPlayerId: string
  markerChooserId: string
  markerSpace: number | null
  lastRoll: number | null
  currentDealNumber: number
  deck: BossView['myHand']
  discard: BossView['myHand']
  availableInvestors: InvestorTeam[]
  spaces: BossBoardSpace[]
  seats: Array<{ id: string; investors: InvestorTeam[]; cash: number; hand: BossView['myHand'] }>
  deal: BossView['deal']
  interrupt: BossView['interrupt']
  lastEndRoll: BossView['lastEndRoll']
  discardActorId: string | null
  discardNextTurnId: string | null
  processedActionIds: string[]
  winnerIds: string[]
  events: BossView['events']
}

export function cashTierOf(cash: number): BossView['seats'][number]['cashTier']
export function activeTeamProviders(state: BossInternalState): Record<string, string[]>
export function eligibleRecipients(state: BossInternalState): string[]
export function canCloseDeal(state: BossInternalState): { ok: true } | { ok: false; reason: string }
export function createBossGame(
  seatIds: readonly string[],
  rawSettings: Partial<BossRoomSettings> | undefined,
  board: BossBoardDefinition,
  randomIndex: (upperBound: number) => number,
  nowMs?: number,
): BossInternalState
export function resolveBossDeadlines(
  state: BossInternalState,
  board: BossBoardDefinition,
  randomIndex: (upperBound: number) => number,
  nowMs?: number,
): { state: BossInternalState; changed: boolean }
export function applyBossAction(
  state: BossInternalState,
  actorId: string,
  request: BossActionRequest,
  board: BossBoardDefinition,
  randomIndex: (upperBound: number) => number,
  nowMs?: number,
): { ok: true; state: BossInternalState; duplicate?: boolean } | { ok: false; status: number; code: string }
export function removeBossPlayer(state: BossInternalState, leavingId: string, nowMs?: number): BossInternalState
export function projectBossView(state: BossInternalState, viewerId: string, board: BossBoardDefinition): BossView
