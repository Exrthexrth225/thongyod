export type InvestorTeam = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple'

export type InfluenceCard =
  | { kind: 'team'; team: InvestorTeam }
  | { kind: 'travel'; team: InvestorTeam | 'any' }
  | { kind: 'recruit' | 'boss' | 'stop' }

export type BossHandCard = InfluenceCard & { id: string }

/** Each participating team counts once, whether provided by a placard or a card. */
export interface DealSpace {
  required: InvestorTeam[]
  optional: InvestorTeam[]
  teamCount: number
  dividends: number
}

export type BossCashTier = 'empty' | 'low' | 'mid' | 'high' | 'rich'

export type BossBoardSpace = DealSpace & {
  index: number
  closedByDeal: number | null
  closedByBossId: string | null
}

export type BossDealPlacard = {
  number: number
  shareValue: number
  endRollFaces: number[]
}

export type BossPhase =
  | 'pick_start'
  | 'turn_choice'
  | 'rolled_choice'
  | 'negotiating'
  | 'interrupt'
  | 'closing'
  | 'discard_limit'
  | 'game_over'

export type BossTableCard = {
  id: string
  ownerId: string
  team: InvestorTeam
}

export type BossInterrupt = {
  id: string
  kind: 'boss' | 'travel' | 'recruit'
  actorId: string
  targetTeam?: InvestorTeam
  targetOwnerId?: string | null
  stopCount: number
  lastActorId: string
  passedIds: string[]
  deadlineAt: string
  resumePhase: 'negotiating' | 'closing'
}

export type BossDealState = {
  id: string
  spaceIndex: number
  dealNumber: number
  totalValue: number
  bossId: string
  blockedTeams: InvestorTeam[]
  tableCards: BossTableCard[]
  allocation: Record<string, number>
  acceptedIds: string[]
  closingDeadlineAt: string | null
}

export type BossEventKind =
  | 'game_started'
  | 'marker_placed'
  | 'dice_rolled'
  | 'drew_cards'
  | 'deal_opened'
  | 'offer_updated'
  | 'offer_accepted'
  | 'team_played'
  | 'boss_played'
  | 'travel_played'
  | 'recruit_played'
  | 'stop_played'
  | 'interrupt_resolved'
  | 'deal_closing'
  | 'deal_settled'
  | 'deal_failed'
  | 'end_roll'
  | 'game_ended'

export type BossEvent = {
  id: string
  revision: number
  kind: BossEventKind
  actorId: string
  targetId?: string
  team?: InvestorTeam
  roll?: number
  amount?: number
  dealNumber?: number
  spaceIndex?: number
  cancelled?: boolean
  createdAt: string
}

export type BossSeatView = {
  userId: string
  investors: InvestorTeam[]
  handCount: number
  cashTier: BossCashTier
  /** Caller's own cash, or every player's cash after game_over. */
  exactCash: number | null
}

export type BossRoomSettings = {
  closingSeconds: 10 | 15
}

export type BossView = {
  revision: number
  phase: BossPhase
  turnPlayerId: string
  markerChooserId: string
  markerSpace: number | null
  lastRoll: number | null
  currentDealNumber: number
  currentShareValue: number
  currentEndRollFaces: number[]
  deckCount: number
  discardCount: number
  availableInvestors: InvestorTeam[]
  spaces: BossBoardSpace[]
  seats: BossSeatView[]
  deal: BossDealState | null
  interrupt: BossInterrupt | null
  lastEndRoll: { roll: number; ended: boolean; dealNumber: number } | null
  myHand: BossHandCard[]
  discardPendingCount: number
  events: BossEvent[]
  winnerIds: string[]
}

export type BossActionPayload =
  | { type: 'pick_start'; spaceIndex: number }
  | { type: 'roll_die' }
  | { type: 'draw_cards' }
  | { type: 'open_deal' }
  | { type: 'set_allocation'; allocation: Record<string, number> }
  | { type: 'accept_offer' }
  | { type: 'start_closing' }
  | { type: 'fail_deal' }
  | { type: 'play_team'; cardId: string }
  | { type: 'play_boss'; cardId: string }
  | { type: 'play_travel'; cardId: string; targetTeam: InvestorTeam }
  | { type: 'play_recruit'; cardIds: [string, string, string]; targetTeam: InvestorTeam }
  | { type: 'play_stop'; cardId: string }
  | { type: 'pass_interrupt' }
  | { type: 'discard_cards'; cardIds: string[] }

export type BossActionRequest = {
  actionId?: string
  expectedRevision?: number
  action: BossActionPayload
}
