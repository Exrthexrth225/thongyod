/** I'm the Boss! contract. The rules live in content/boss-engine.mjs; see docs/IM_THE_BOSS.md. */
export type InvestorTeam = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple'

export type InfluenceCard =
  | { kind: 'team'; team: InvestorTeam }
  | { kind: 'travel'; team: InvestorTeam | 'any' }
  | { kind: 'recruit' | 'boss' | 'stop' }

export type BossHandCard = InfluenceCard & { id: string }

/** A deal space: every required team plus enough optional teams to reach teamCount different teams. */
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

export type BossDealPlacard = { number: number; shareValue: number; endRollFaces: number[] }

export type BossPhase = 'pick_start' | 'turn_choice' | 'rolled_choice' | 'negotiating' | 'interrupt' | 'closing' | 'discard_limit' | 'game_over'

export type BossTableCard = { id: string; ownerId: string; team: InvestorTeam }

/** Travel, Boss or Recruit waiting out its 5-second Stop window. */
export type BossInterrupt = {
  id: string
  kind: 'boss' | 'travel' | 'recruit'
  actorId: string
  targetTeam?: InvestorTeam
  targetCardId?: string | null
  /** Who loses out: the current boss, the travelled seat or the recruited investor's owner. */
  targetId?: string | null
  stoppedBy: string | null
  deadlineAt: string
}

export type BossDealState = {
  id: string
  spaceIndex: number
  dealNumber: number
  totalValue: number
  bossId: string
  blockedTeams: InvestorTeam[]
  tableCards: BossTableCard[]
  /** Boss's offer: seat ID -> amount. Anyone at the table may be paid. */
  allocation: Record<string, number>
  offered: boolean
  /** What each player asked for (null = withdrew the ask). Public, like talk at the table. */
  asks: Record<string, number | null>
  acceptedIds: string[]
  declinedIds: string[]
  closingDeadlineAt: string | null
  /** Derived for display. */
  providers: Partial<Record<InvestorTeam, string[]>>
  agreedTeams: InvestorTeam[]
  /** Boss plus everyone offering a team: the people whose "accept" counts. */
  contributorIds: string[]
  canClose: boolean
}

export type BossEventKind =
  | 'game_started'
  | 'marker_placed'
  | 'dice_rolled'
  | 'drew_cards'
  | 'deal_opened'
  | 'offer_updated'
  | 'ask_set'
  | 'offer_accepted'
  | 'offer_declined'
  | 'team_played'
  | 'boss_played'
  | 'travel_played'
  | 'recruit_played'
  | 'stop_played'
  | 'interrupt_resolved'
  | 'deal_closing'
  | 'deal_held'
  | 'deal_settled'
  | 'deal_failed'
  | 'end_roll'
  | 'cards_discarded'
  | 'player_skipped'
  | 'player_removed'
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
  fromSpace?: number
  cancelled?: boolean
  createdAt: string
}

export type BossSeatView = {
  userId: string
  investors: InvestorTeam[]
  handCount: number
  cashTier: BossCashTier
  /** The viewer's own cash, or everyone's after game_over. */
  exactCash: number | null
}

export type BossRoomSettings = { short: boolean }

export type BossView = {
  revision: number
  phase: BossPhase
  short: boolean
  turnPlayerId: string
  markerChooserId: string
  markerSpace: number | null
  lastRoll: number | null
  currentDealNumber: number
  dealsDone: number
  dealsTotal: number
  currentShareValue: number
  currentEndRollFaces: number[]
  deckCount: number
  discardCount: number
  availableInvestors: InvestorTeam[]
  spaces: BossBoardSpace[]
  seats: BossSeatView[]
  deal: BossDealState | null
  interrupt: BossInterrupt | null
  lastEndRoll: { roll: number; ended: boolean; dealNumber: number; faces: number[] } | null
  lastSettlement: { dealNumber: number; spaceIndex: number; bossId: string; totalValue: number; payouts: Record<string, number> } | null
  myHand: BossHandCard[]
  discardPendingCount: number
  /** Seats the game is waiting on; the host may skip them when they are offline. */
  blockingIds: string[]
  events: BossEvent[]
  winnerIds: string[]
}

export type BossActionPayload =
  | { type: 'pick_start'; spaceIndex: number }
  | { type: 'roll_die' }
  | { type: 'draw_cards' }
  | { type: 'open_deal' }
  | { type: 'set_allocation'; allocation: Record<string, number> }
  | { type: 'set_ask'; amount: number | null }
  | { type: 'accept_offer' }
  | { type: 'decline_offer' }
  | { type: 'start_closing' }
  | { type: 'hold' }
  | { type: 'fail_deal' }
  | { type: 'play_team'; cardId: string }
  | { type: 'play_boss'; cardId: string }
  | { type: 'play_travel'; cardId: string; targetTeam: InvestorTeam; targetCardId?: string }
  | { type: 'play_recruit'; cardIds: [string, string, string]; targetTeam: InvestorTeam }
  | { type: 'play_stop'; cardId: string }
  | { type: 'discard_cards'; cardIds: string[] }

export type BossActionRequest = { actionId?: string; action: BossActionPayload }
