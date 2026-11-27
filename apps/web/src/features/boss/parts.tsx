import { useTranslation } from 'react-i18next'
import { Crown, Layers, WifiOff } from 'lucide-react'
import type { BossBoardSpace, BossSeatView, BossView, InvestorTeam, RoomPlayer } from '@/api/types'
import { cn } from '@/lib/utils'
import { cardArt, cardBackArt, faceArt, millions, moneyArt, seatTeam, teamArt, TEAM_COLOR, type Mood } from './meta'

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
  return <span className={cn('font-extrabold tabular-nums', className)}>{amount === 0 ? '$0' : t('boss.money', { m: millions(amount) })}</span>
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

/** Header colour by multiplier, so rich spaces stand out (×3 teal … ×6 gold). */
const TIER: Record<number, string> = { 3: 'from-teal-500 to-teal-600', 4: 'from-sky-500 to-blue-600', 5: 'from-violet-500 to-purple-600', 6: 'from-amber-300 to-amber-500' }

/** A deal space as printed on the real board: total investors, $ × multiplier, and columns "pick N of these". */
export function SpaceTile({ space, big, active, onPick, className }: { space: BossBoardSpace; big?: boolean; active?: boolean; onPick?: () => void; className?: string }) {
  const { t } = useTranslation()
  const closed = space.closedByDeal !== null
  const badge = big ? 'size-8' : 'size-(--b)'
  const Tag = onPick && !closed ? 'button' : 'div'
  const rich = space.dividends >= 6
  return (
    <Tag
      type={Tag === 'button' ? 'button' : undefined}
      onClick={Tag === 'button' ? onPick : undefined}
      className={cn(
        'boss-space relative flex flex-col overflow-hidden [container-type:size] [--b:clamp(10px,calc((100cqw+100cqh)/10),30px)] rounded-[1.1vmin] bg-gradient-to-b from-[#fffaf0] to-[#ece3cf] text-[#3a2416] ring-1 ring-[#b9821c]/70',
        'shadow-[0_0.5vmin_0_#8a5a2b,0_0.9vmin_1.2vmin_rgba(0,0,0,0.35)]',
        big && 'rounded-2xl shadow-[0_5px_0_#8a5a2b,0_10px_16px_rgba(0,0,0,0.35)]',
        active && 'boss-space-active',
        onPick && !closed && 'cursor-pointer hover:-translate-y-0.5 active:translate-y-0',
        className,
      )}
    >
      <div className={cn('flex items-center justify-between bg-gradient-to-b font-black text-white', TIER[space.dividends] ?? TIER[3], big ? 'px-3 py-1.5 text-lg' : 'px-[4cqmin] py-[1.5cqmin] text-[clamp(8px,12cqmin,17px)]', rich && 'boss-rich text-[#3a2416]')}>
        <span className={cn('flex items-center justify-center rounded-[0.5vmin] bg-white text-[#3a2416] shadow-inner', big ? 'size-8 text-xl' : 'size-[clamp(12px,15cqmin,28px)]')}>{space.teamCount}</span>
        <span className="drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]">$ × {space.dividends}</span>
      </div>
      {big ? (
        <div className="flex min-h-0 flex-1 px-1 py-2">
          {space.groups.map((g, i) => (
            <div key={i} className={cn('flex min-w-0 flex-1 flex-col items-center justify-between', i > 0 && 'border-l border-[#5a3420]/25')}>
              <div className="flex flex-1 flex-wrap content-center items-center justify-center gap-1">
                {g.teams.map((team) => <TeamBadge key={team} team={team} className={badge} />)}
              </div>
              <span className="mt-1 flex size-6 items-center justify-center rounded-full bg-[#5a3420] text-sm font-black text-[#fff4dc]" aria-label={t('boss.deal.pick', { count: g.pick })}>{g.pick}</span>
            </div>
          ))}
        </div>
      ) : (
        // Small tiles come in many shapes: each column becomes a little cluster that wraps to fit.
        <div className="flex min-h-0 flex-1 flex-wrap content-center items-center justify-center gap-[3cqmin] p-[2.5cqmin]">
          {space.groups.map((g, i) => (
            <div key={i} className="flex flex-wrap items-center justify-center gap-[1.5cqmin] rounded-[4cqmin] bg-[#5a3420]/10 p-[1.5cqmin]">
              {g.teams.map((team) => <TeamBadge key={team} team={team} className={badge} />)}
              <span className="flex size-[calc(var(--b)*0.62)] items-center justify-center rounded-full bg-[#5a3420] text-[calc(var(--b)*0.42)] font-black text-[#fff4dc]" aria-label={t('boss.deal.pick', { count: g.pick })}>{g.pick}</span>
            </div>
          ))}
        </div>
      )}
      {closed && (
        <div className="boss-closed absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#3f9a4e] to-[#2b6e38] text-white">
          <img src={cardArt('recruit')} alt="" className="w-[55%] max-w-24 opacity-90 drop-shadow" />
          <span className={cn('font-black leading-none drop-shadow', big ? 'text-2xl' : 'text-[clamp(10px,18cqmin,26px)]')}>#{space.closedByDeal}</span>
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

/** The pile of deal placards: the next one on top (#, value per dividend, end-roll faces from #10). */
export function PlacardStack({ view, className }: { view: BossView; className?: string }) {
  const { t } = useTranslation()
  const left = Math.max(0, view.dealsTotal - view.dealsDone)
  return (
    <div className={cn('relative', className)} aria-label={t('boss.status.deal', { n: view.currentDealNumber })}>
      {Array.from({ length: Math.min(3, Math.max(0, left - 1)) }, (_, i) => (
        <span key={i} className="absolute inset-0 rounded-xl border-2 border-[#b9821c] bg-[#f2dca6]" style={{ transform: `translate(${(i + 1) * 4}px, ${(i + 1) * 4}px) rotate(${(i + 1) * 2}deg)` }} />
      ))}
      <div key={view.currentDealNumber} className="boss-placard relative flex size-full flex-col items-center justify-center rounded-xl border-2 border-[#b9821c] bg-gradient-to-br from-[#fffaf0] to-[#f2dca6] p-2 text-[#3a2416] shadow-xl">
        <span className="text-[clamp(14px,3vmin,30px)] font-black leading-none">#{view.currentDealNumber}</span>
        <span className="mt-1 rounded-md bg-[#1b2550] px-2 text-[clamp(10px,1.8vmin,18px)] font-black text-[#ffe58a]">$ = {t('boss.money', { m: millions(view.currentShareValue) })}</span>
        {view.currentEndRollFaces.length > 0 && (
          <span className="mt-1 flex gap-0.5">{view.currentEndRollFaces.map((f) => <span key={f} className="flex size-[clamp(12px,2vmin,20px)] items-center justify-center rounded bg-red-600 text-[clamp(8px,1.3vmin,13px)] font-black text-white">{f}</span>)}</span>
        )}
      </div>
    </div>
  )
}

/** Face-down draw pile with its count. */
export function DeckPile({ count, className }: { count: number; className?: string }) {
  const { t } = useTranslation()
  return (
    <div className={cn('relative', className)} aria-label={t('boss.status.deck', { count })}>
      {[2, 1, 0].map((i) => <img key={i} src={cardBackArt} alt="" className="absolute inset-0 size-full rounded-lg object-cover shadow-md" style={{ transform: `translate(${i * 3}px, ${i * -3}px)` }} draggable={false} />)}
      <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-2 text-xs font-bold text-white tabular-nums">{count}</span>
    </div>
  )
}
