import { useTranslation } from 'react-i18next'
import { Crown, Layers, WifiOff } from 'lucide-react'
import type { BossBoardSpace, BossSeatView, BossView, InvestorTeam, RoomPlayer } from '@/api/types'
import { cn } from '@/lib/utils'
import { cardBackArt, faceArt, millions, moneyArt, seatTeam, teamArt, TEAM_COLOR, type Mood } from './meta'

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
      {n === 0 ? <span className="text-xs opacity-70">$0</span> : Array.from({ length: n }, (_, i) => <img key={i} src={moneyArt('coin')} alt="" className="-mr-2 size-5" style={{ transform: `translateY(${-i * 2}px)` }} />)}
    </span>
  )
}

/**
 * A deal space as printed on the real board: total investors, $ × multiplier, and columns "pick N of these".
 * Small tiles size everything from the board (cqmin of the board grid), so every header is the same size.
 * When the deal closes, the tile flips over to show the placard that closed it.
 */
export function SpaceTile({ space, big, active, onPick, className }: { space: BossBoardSpace; big?: boolean; active?: boolean; onPick?: () => void; className?: string }) {
  const { t } = useTranslation()
  const closed = space.closedByDeal !== null
  const rich = space.dividends >= 6
  const Tag = onPick && !closed ? 'button' : 'div'
  const u = (n: number) => (big ? `${n * 0.46}rem` : `${n}cqmin`) // board units
  return (
    <Tag
      type={Tag === 'button' ? 'button' : undefined}
      onClick={Tag === 'button' ? onPick : undefined}
      className={cn('boss-space-wrap block [perspective:900px]', onPick && !closed && 'cursor-pointer', className)}
      aria-label={closed ? `#${space.closedByDeal}` : undefined}
    >
      <div className={cn('boss-space-inner relative size-full [transform-style:preserve-3d]', closed && 'boss-flipped')}>
        {/* front */}
        <div
          className={cn(
            'absolute inset-0 flex flex-col overflow-hidden bg-[#f6efdc] text-[#241b4b] [backface-visibility:hidden]',
            rich ? 'ring-2 ring-[#ffc21a]' : 'ring-1 ring-[#d9cfb2]',
            active && 'boss-space-active',
          )}
          style={{ borderRadius: u(1.4), boxShadow: `0 ${u(0.5)} 0 #d9cfb2, 0 ${u(0.9)} ${u(1.4)} rgba(0,0,0,0.35)` }}
        >
          <div className="flex shrink-0 items-center justify-between font-black" style={{ height: u(4.4), padding: `${u(0.6)} ${u(0.8)} 0`, fontSize: u(2.3) }}>
            <span className="flex items-center justify-center rounded-[0.35em] bg-[#241b4b] text-white" style={{ width: u(3.4), height: u(3.4) }}>{space.teamCount}</span>
            <span className={rich ? 'text-[#c98a00]' : 'text-[#9a6b00]'}>$×{space.dividends}</span>
          </div>
          <div className="flex min-h-0 flex-1" style={{ padding: `${u(0.6)} ${u(0.3)}` }}>
            {space.groups.map((g, i) => (
              <div key={i} className={cn('flex min-w-0 flex-1 flex-col items-center', i > 0 && 'border-l border-[#d9cfb2]')}>
                <div className="flex min-h-0 flex-1 flex-wrap content-center items-center justify-center" style={{ gap: u(0.4) }}>
                  {g.teams.map((team) => <img key={team} src={teamArt(team)} alt={t(`boss.teams.${team}`)} draggable={false} style={{ width: u(4.2), height: u(4.2) }} />)}
                </div>
                <span className="flex shrink-0 items-center justify-center rounded-full bg-[#241b4b] font-black text-white" style={{ width: u(2.8), height: u(2.8), fontSize: u(1.8) }} aria-label={t('boss.deal.pick', { count: g.pick })}>{g.pick}</span>
              </div>
            ))}
          </div>
        </div>
        {/* back: closed — dim navy with a gold stamp */}
        <div
          className="absolute inset-0 flex flex-col overflow-hidden bg-[#221a4b] text-[#8a82b3] ring-1 ring-white/10 [backface-visibility:hidden] [transform:rotateY(180deg)]"
          style={{ borderRadius: u(1.4) }}
        >
          <div className="flex shrink-0 items-center justify-between font-black" style={{ height: u(4.4), padding: `${u(0.6)} ${u(0.8)} 0`, fontSize: u(2.3) }}>
            <span className="flex items-center justify-center rounded-[0.35em] bg-white/10" style={{ width: u(3.4), height: u(3.4) }}>{space.teamCount}</span>
            <span>$×{space.dividends}</span>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <span className="whitespace-nowrap rounded-[0.5em] border-[0.12em] border-dashed border-[#e9b949]/80 font-black text-[#ffd77a] [transform:rotate(-8deg)]" style={{ fontSize: u(2), padding: `${u(0.4)} ${u(1)}` }}>{t('boss.deal.closedStamp', { n: space.closedByDeal })}</span>
          </div>
        </div>
      </div>
    </Tag>
  )
}

type SeatProps = { view: BossView; seat: BossSeatView; players: RoomPlayer[]; online: boolean; mood: Mood; me?: boolean; compact?: boolean; dark?: boolean }

/** One player at the table: face, name, investors, cash, cards in hand, turn/boss marks. */
export function SeatCard({ view, seat, players, online, mood, me, compact, dark }: SeatProps) {
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
        me && !dark && 'bg-amber-50 dark:bg-amber-950/40',
        dark && me && 'bg-[#ffc21a]/15',
        dark && 'bg-white/[0.08] text-white shadow-none ring-white/10',
        dark && (isBoss || isTurn) && 'ring-[#ffc21a]',
        !online && 'opacity-60',
      )}
      data-seat={seat.userId}
    >
      <Face team={seatTeam(view, seat.userId)} mood={mood} className={compact ? 'size-10' : dark ? 'size-14' : 'size-12'} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1 truncate text-sm font-bold">
          {isBoss && <Crown className="size-3.5 shrink-0 text-amber-500" aria-label={t('boss.cards.boss')} />}
          <span className="truncate">{name}</span>
          {!online && <WifiOff className="size-3 shrink-0 opacity-70" aria-hidden="true" />}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex">{seat.investors.map((team) => <TeamBadge key={team} team={team} className="-mr-1 size-5" />)}</span>
          <CashTag seat={seat} />
          <span className="ml-auto flex items-center gap-0.5 text-xs opacity-70 tabular-nums"><Layers className="size-3" aria-hidden="true" />{seat.handCount}</span>
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
