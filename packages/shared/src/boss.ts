/** I'm the Boss! contract. The rules live in content/boss-engine.mjs; see docs/IM_THE_BOSS.md. */
export type InvestorTeam = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple'

export type InfluenceCard =
  | { kind: 'team'; team: InvestorTeam }
  | { kind: 'travel'; team: InvestorTeam | 'any' }
  | { kind: 'recruit' | 'boss' | 'stop' }

export type BossHandCard = InfluenceCard & { id: string }

/** One column of a deal space: pick `pick` investors from these teams (pick === teams.length means all of them). */
export interface DealGroup {
  teams: InvestorTeam[]
  pick: number
}

/** A deal space as printed on the board: columns of teams, the total number of investors and the multiplier. */
export interface DealSpace {
  groups: DealGroup[]
  /** Sum of the columns' picks. */
  teamCount: number
  dividends: number
}

export type BossCashTier = 'empty' | 'low' | 'mid' | 'high' | 'rich'

export type BossBoardSpace = DealSpace & {
  index: number
  closedByDeal: number | null
  /** What the deal here was worth, once closed. */
  closedValue?: number | null
  closedByBossId: string | null
}

export type BossDealPlacard = { number: number; shareValue: number; endRollFaces: number[] }

export type BossPhase = 'draft' | 'pick_start' | 'turn_choice' | 'rolled_choice' | 'negotiating' | 'interrupt' | 'closing' | 'discard_limit' | 'game_over'

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

/** Where a contract slot's investor comes from: its owner's placard, or one face-up Team card. */
export type BossSlotSource =
  | { kind: 'placard'; team: InvestorTeam; ownerId: string }
  | { kind: 'card'; team: InvestorTeam; ownerId: string; cardId: string }

/** One investor the deal needs, in column `group`. Filled only by the boss, never automatically. */
export type BossSlot = {
  group: number
  source: BossSlotSource | null
  /** The contribution an interrupt took away (until the boss fills the slot again). */
  lost: { team: InvestorTeam; ownerId: string; kind: 'placard' | 'card' } | null
}

export type BossDealState = {
  id: string
  spaceIndex: number
  dealNumber: number
  totalValue: number
  bossId: string
  blockedTeams: InvestorTeam[]
  /** Face-up Team cards: offered by their owners; "selected" when a slot uses them. */
  tableCards: BossTableCard[]
  slots: BossSlot[]
  /** Boss's offer: seat ID -> amount, one payout per person. Anyone at the table may be paid. */
  allocation: Record<string, number>
  offered: boolean
  /** Per person: the version of the terms they are asked to confirm (send it back with accept/decline). */
  terms: Record<string, number>
  closingDeadlineAt: string | null
  /** Derived for display. */
  providers: Partial<Record<InvestorTeam, string[]>>
  /** Boss plus everyone supplying a slot. */
  contributorIds: string[]
  /** Everyone who must confirm: suppliers and paid players, not the boss. */
  requiredIds: string[]
  /** Confirmed / declined the terms they hold now. */
  acceptedIds: string[]
  declinedIds: string[]
  canClose: boolean
}

export type BossEventKind =
  | 'game_started'
  | 'marker_placed'
  | 'dice_rolled'
  | 'drew_cards'
  | 'deal_opened'
  | 'investor_drafted'
  | 'slot_set'
  | 'offer_updated'
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
  /** dice_rolled: every space the marker steps on, closed ones included. */
  path?: number[]
  slot?: number
  ids?: string[]
  cancelled?: boolean
  createdAt: string
}

export type BossSeatView = {
  userId: string
  investors: InvestorTeam[]
  /** The face this player keeps all game, whatever investors they gain or lose. */
  portrait: InvestorTeam | null
  handCount: number
  /** Own (or everyone's after game_over); null otherwise. */
  cashTier: BossCashTier | null
  /** The viewer's own cash, or everyone's after game_over. */
  exactCash: number | null
}

export type BossRoomSettings = { short: boolean; investorsEach?: number; draft?: 'random' | 'snake' }

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
  investorsEach: number
  /** Snake draft in progress: whose pick it is. */
  draft: { order: string[]; index: number; actorId: string } | null
  spaces: BossBoardSpace[]
  seats: BossSeatView[]
  deal: BossDealState | null
  interrupt: BossInterrupt | null
  lastEndRoll: { roll: number; ended: boolean; dealNumber: number; faces: number[] } | null
  lastSettlement: { dealNumber: number; spaceIndex: number; bossId: string; totalValue: number; payouts: Record<string, number>; suppliers?: string[] } | null
  myHand: BossHandCard[]
  discardPendingCount: number
  /** Seats the game is waiting on; the host may skip them when they are offline. */
  blockingIds: string[]
  /** Per seat, for the end screen: deals closed as boss, biggest deal, bribes paid, Travel and Stop played. */
  stats: Record<string, { deals: number; biggest: number; bribesPaid: number; travels: number; stops: number }>
  events: BossEvent[]
  winnerIds: string[]
}

export type BossActionPayload =
  | { type: 'draft_pick'; team: InvestorTeam }
  | { type: 'pick_start'; spaceIndex: number }
  | { type: 'roll_die' }
  | { type: 'draw_cards' }
  | { type: 'open_deal' }
  | { type: 'set_slot'; slot: number; source: { kind: 'placard'; team: InvestorTeam } | { kind: 'card'; cardId: string } | null }
  | { type: 'submit_offer'; allocation: Record<string, number> }
  | { type: 'accept_offer'; version: number }
  | { type: 'decline_offer'; version: number }
  | { type: 'start_closing' }
  | { type: 'hold' }
  | { type: 'fail_deal' }
  | { type: 'play_team'; cardId: string }
  | { type: 'play_boss'; cardId: string }
  | { type: 'play_travel'; cardId: string; targetTeam: InvestorTeam; targetCardId?: string }
  | { type: 'play_recruit'; cardIds: [string, string, string]; targetTeam: InvestorTeam }
  | { type: 'play_stop'; cardId: string; interruptId: string }
  | { type: 'discard_cards'; cardIds: string[] }

export type BossActionRequest = { actionId?: string; action: BossActionPayload }
