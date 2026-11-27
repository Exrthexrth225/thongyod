import { useTranslation } from 'react-i18next'
import { Crown, Layers, WifiOff } from 'lucide-react'
import type { BossBoardSpace, BossSeatView, BossView, InvestorTeam, RoomPlayer } from '@/api/types'
import { cn } from '@/lib/utils'
import { faceArt, millions, moneyArt, seatTeam, teamArt, TEAM_COLOR, type Mood } from './meta'

export function TeamBadge({ team, className, dim }: { team: InvestorTeam; className?: string; dim?: boolean }) {
  const { t } = useTranslation()
  return <img src={teamArt(team)} alt={t(`boss.teams.${team}`)} className={cn('size-7 shrink-0 select-none', dim && 'opacity-35 grayscale', className)} draggable={false} />
}

export function Face({ team, mood = 'calm', className }: { team: InvestorTeam; mood?: Mood; className?: string }) {
  return (
    <span className={cn('relative block shrink-0 overflow-hidden rounded-2xl', className)} style={{ background: `${TEAM_COLOR[team]}33` }}>
      <img key={mood} src={faceArt(team, mood)} alt="" className={cn('boss-face size-full object-contain object-bottom', mood !== 'calm' && 'boss-face-pop')} draggable={false} />
    </span>
  )
}

export function Money({ amount, className }: { amount: number; className?: string }) {
  const { t } = useTranslation()
  return <span className={cn('font-extrabold tabular-nums', className)}>{t('boss.money', { m: millions(amount) })}</span>
}

const TIER_COINS: Record<BossSeatView['cashTier'], number> = { empty: 0, low: 1, mid: 2, high: 3, rich: 4 }

/** Opponents' cash is a coin stack (exact amount only for me, or for all at the end). */
export function CashTag({ seat, className }: { seat: BossSeatView; className?: string }) {
  if (seat.exactCash !== null) return <Money amount={seat.exactCash} className={cn('text-amber-600 dark:text-amber-300', className)} />
  const n = TIER_COINS[seat.cashTier]
  return (
    <span className={cn('flex h-5 items-end', className)} aria-label={seat.cashTier}>
      {n === 0 ? <span className="text-xs text-muted-foreground">$0</span> : Array.from({ length: n }, (_, i) => <img key={i} src={moneyArt('coin')} alt="" className="-mr-2 size-5" style={{ transform: `translateY(${-i * 2}px)` }} />)}
    </span>
  )
}

/** A deal space as printed on the board: people, required teams, "choose N of", dividends. */
export function SpaceTile({ space, big, active, onPick, className }: { space: BossBoardSpace; big?: boolean; active?: boolean; onPick?: () => void; className?: string }) {
  const { t } = useTranslation()
  const choose = space.teamCount - space.required.length
  const closed = space.closedByDeal !== null
  const badge = big ? 'size-9' : 'size-[clamp(14px,2.2vmin,26px)]'
  const Tag = onPick && !closed ? 'button' : 'div'
  return (
    <Tag
      type={Tag === 'button' ? 'button' : undefined}
      onClick={Tag === 'button' ? onPick : undefined}
      className={cn(
        'boss-space relative flex flex-col justify-between overflow-hidden rounded-xl border-2 border-[#5a3420]/70 bg-[#fff4dc] text-[#3a2416] shadow-[0_2px_0_#5a3420]',
        big ? 'gap-2 p-3' : 'gap-[0.3vmin] p-[0.6vmin]',
        active && 'boss-space-active',
        onPick && !closed && 'cursor-pointer hover:-translate-y-0.5 active:translate-y-0',
        className,
      )}
    >
      <div className={cn('flex items-center justify-between font-extrabold', big ? 'text-base' : 'text-[clamp(9px,1.4vmin,15px)]')}>
        <span className="rounded-md bg-[#5a3420] px-1.5 text-[#fff4dc]">{t('boss.deal.people', { count: space.teamCount })}</span>
        <span>{t('boss.deal.dividends', { count: space.dividends })}</span>
      </div>
      <div className={cn('flex min-h-0 flex-1 items-stretch', big ? 'gap-3' : 'gap-[0.5vmin]')}>
        <div className="flex flex-wrap content-center items-center gap-0.5">
          {space.required.map((team) => <TeamBadge key={team} team={team} className={badge} />)}
        </div>
        {choose > 0 && (
          <div className={cn('flex flex-1 flex-col justify-center border-l-2 border-dashed border-[#5a3420]/40', big ? 'pl-3' : 'pl-[0.5vmin]')}>
            <span className={cn('font-bold opacity-70', big ? 'text-xs' : 'text-[clamp(7px,1.1vmin,12px)]')}>{t('boss.deal.choose', { count: choose })}</span>
            <div className="flex flex-wrap gap-0.5">{space.optional.map((team) => <TeamBadge key={team} team={team} className={badge} />)}</div>
          </div>
        )}
      </div>
      {closed && (
        <div className="boss-closed absolute inset-0 flex items-center justify-center bg-[#5a3420]/85 text-[#ffe58a]">
          <span className={cn('font-black', big ? 'text-3xl' : 'text-[clamp(12px,2.4vmin,28px)]')}>#{space.closedByDeal}</span>
        </div>
      )}
    </Tag>
  )
}

type SeatProps = { view: BossView; seat: BossSeatView; players: RoomPlayer[]; online: boolean; mood: Mood; me?: boolean; compact?: boolean }

/** One player at the table: face, name, investors, cash, cards in hand, turn/boss marks. */
export function SeatCard({ view, seat, players, online, mood, me, compact }: SeatProps) {
  const { t } = useTranslation()
  const name = players.find((p) => p.userId === seat.userId)?.displayName ?? '?'
  const isBoss = view.deal?.bossId === seat.userId
  const isTurn = !view.deal && view.turnPlayerId === seat.userId && view.phase !== 'game_over'
  return (
    <div
      className={cn(
        'boss-seat relative flex items-center gap-2 rounded-2xl bg-card/95 p-1.5 pr-2.5 shadow-sm ring-2 ring-transparent transition-[box-shadow,transform] duration-300',
        (isBoss || isTurn) && 'ring-amber-400',
        isTurn && 'boss-turn',
        me && 'bg-amber-50 dark:bg-amber-950/40',
        !online && 'opacity-60',
      )}
      data-seat={seat.userId}
    >
      <Face team={seatTeam(view, seat.userId)} mood={mood} className={compact ? 'size-10' : 'size-12'} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1 truncate text-sm font-bold">
          {isBoss && <Crown className="size-3.5 shrink-0 text-amber-500" aria-label={t('boss.cards.boss')} />}
          <span className="truncate">{name}</span>
          {!online && <WifiOff className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex">{seat.investors.map((team) => <TeamBadge key={team} team={team} className="-mr-1 size-5" />)}</span>
          <CashTag seat={seat} />
          <span className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums"><Layers className="size-3" aria-hidden="true" />{seat.handCount}</span>
        </span>
      </div>
    </div>
  )
}
