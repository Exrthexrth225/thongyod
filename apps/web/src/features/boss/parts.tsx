import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Crown, Layers, UserRound, WifiOff } from 'lucide-react'
import type { BossBoardSpace, BossSeatView, BossView, InvestorTeam, RoomPlayer } from '@/api/types'
import { cn } from '@/lib/utils'
import { Word } from './Word'
import { cardBackArt, faceArt, millions, moneyArt, shortName, teamArt, TEAM_COLOR, type Mood, type TileShape } from './meta'

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

/**
 * A player's faces: one character per investor colour they hold (two colours → two faces, overlapping a little,
 * each ringed in its colour). No colour yet (draft) → a plain silhouette. `className` sizes one face.
 */
export function SeatFaces({ view, userId, mood = 'calm', round, className }: { view: BossView; userId: string; mood?: Mood; round?: boolean; className?: string }) {
  const teams = view.seats.find((s) => s.userId === userId)?.investors ?? []
  const shape = round ? 'rounded-full' : 'rounded-2xl'
  if (!teams.length) {
    return (
      <span className={cn('relative flex shrink-0 items-end justify-center overflow-hidden bg-[#3a3366] ring-2 ring-white/25', shape, className)} aria-hidden="true">
        <UserRound className="size-[85%] translate-y-[12%] text-white/35" />
      </span>
    )
  }
  const step = 0.58 // each extra face adds 58% of a face width
  const ratio = 1 + step * (teams.length - 1)
  return (
    <span className={cn('relative block shrink-0', className)} style={{ width: 'auto', aspectRatio: ratio }}>
      {teams.map((team, i) => (
        <span key={team} className={cn('absolute top-0 block h-full', shape)} style={{ left: `${(i * step * 100) / ratio}%`, width: `${100 / ratio}%`, zIndex: teams.length - i, background: TEAM_COLOR[team], padding: 2, boxShadow: i ? '-2px 0 4px rgba(0,0,0,0.35)' : undefined }}>
          <Face team={team} mood={mood} className={cn('size-full', round && 'rounded-full')} />
        </span>
      ))}
    </span>
  )
}

/** The investor colours a player holds right now. */
export function SeatColors({ view, userId, className, size = 'size-4' }: { view: BossView; userId: string; className?: string; size?: string }) {
  const seat = view.seats.find((s) => s.userId === userId)
  if (!seat?.investors.length) return null
  return <span className={cn('flex items-center gap-0.5', className)}>{seat.investors.map((team) => <TeamBadge key={team} team={team} className={size} />)}</span>
}

/** A long name shortened at a readable boundary; tap to see it whole. */
export function PlayerName({ name, max = 6, className }: { name: string; max?: number; className?: string }) {
  const [full, setFull] = useState(false)
  const short = shortName(name, max)
  if (short === name) return <span className={cn('truncate', className)}>{name}</span>
  return (
    <button type="button" title={name} aria-label={name} className={cn('min-w-0 truncate text-left', className)} onClick={(e) => { e.stopPropagation(); setFull((v) => !v) }}>
      {full ? name : short}
    </button>
  )
}

/** The deal's price, big and gold on a dark plaque, with how it adds up ($2M × 6). */
export function PriceTag({ amount, share, dividends, size = 30, className }: { amount: number; share?: number; dividends?: number; size?: number; className?: string }) {
  const { t } = useTranslation()
  return (
    <span className={cn('boss-plaque boss-price inline-flex shrink-0 flex-col items-center leading-none', className)} style={{ padding: `${size * 0.22}px ${size * 0.5}px ${size * 0.28}px` }}>
      <span className="font-bold text-[#ffd77a]/85" style={{ fontSize: Math.max(9, size * 0.32) }}>{t('boss.deal.thisDeal')}</span>
      <Word text={amount === 0 ? '$0' : t('boss.money', { m: millions(amount) })} className="tabular-nums" style={{ fontSize: size }} />
      {share !== undefined && dividends !== undefined && <span className="font-bold text-white/75 tabular-nums" style={{ fontSize: Math.max(9, size * 0.32) }}>{t('boss.money', { m: millions(share) })} × {dividends}</span>}
    </span>
  )
}

const TIER_COINS: Record<NonNullable<BossSeatView['cashTier']>, number> = { empty: 0, low: 1, mid: 2, high: 3, rich: 4 }

/** Opponents' cash is a coin stack (exact amount only for me, or for all at the end). */
export function CashTag({ seat, className }: { seat: BossSeatView; className?: string }) {
  if (seat.exactCash !== null) return <Money amount={seat.exactCash} className={cn('text-amber-600 dark:text-amber-300', className)} />
  // Other wallets are private until the end.
  if (!seat.cashTier) return null
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
export function SpaceTile({ space, big, shape = 'corner', active, onPick, className }: { space: BossBoardSpace; big?: boolean; shape?: TileShape; active?: boolean; onPick?: () => void; className?: string }) {
  const { t } = useTranslation()
  const closed = space.closedByDeal !== null
  const rich = space.dividends >= 6
  const Tag = onPick && !closed ? 'button' : 'div'
  const u = (n: number) => (big ? `${n * 0.46}rem` : `${n}cqmin`) // board units
  const side = !big && shape !== 'corner'
  const icon = u(side ? 3.4 : 4.2), pickSize = u(side ? 2.5 : 2.8)
  const pick = (n: number) => <span className="flex shrink-0 items-center justify-center rounded-full bg-[#241b4b] font-black text-white" style={{ width: pickSize, height: pickSize, fontSize: u(side ? 1.6 : 1.8) }} aria-label={t('boss.deal.pick', { count: n })}>{n}</span>
  const icons = (teams: InvestorTeam[]) => teams.map((team) => <img key={team} src={teamArt(team)} alt={t(`boss.teams.${team}`)} draggable={false} style={{ width: icon, height: icon }} />)
  const wide = (shape === 'left' || shape === 'right') && !big
  const tall = (shape === 'top' || shape === 'bottom') && !big
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
          <div className={cn('flex min-h-0 flex-1', wide ? (shape === 'right' ? 'flex-row-reverse' : 'flex-row') : tall && shape === 'bottom' ? 'flex-col-reverse' : 'flex-col')}>
            <div className={cn('flex shrink-0 items-center font-black', wide ? cn('flex-col justify-center gap-[0.6cqmin] border-[#d9cfb2]', shape === 'right' ? 'border-l' : 'border-r') : 'justify-between')}
              style={wide ? { width: u(5.4), fontSize: u(2), padding: `0 ${u(0.4)}` } : { height: u(4.4), padding: shape === 'bottom' && !big ? `0 ${u(0.8)} ${u(0.6)}` : `${u(0.6)} ${u(0.8)} 0`, fontSize: u(side ? 2.1 : 2.3) }}>
              <span className="flex items-center justify-center rounded-[0.35em] bg-[#241b4b] text-white" style={{ width: u(side ? 3.1 : 3.4), height: u(side ? 3.1 : 3.4) }}>{space.teamCount}</span>
              <span className={cn(rich ? 'text-[#c98a00]' : 'text-[#9a6b00]', wide && 'text-center leading-none')}>$×{space.dividends}</span>
            </div>
            {tall ? (
              <div className="flex min-h-0 flex-1 flex-col" style={{ padding: `${u(0.3)} ${u(0.5)}` }}>
                {space.groups.map((g, i) => (
                  <div key={i} className={cn('flex min-h-0 flex-1 items-center', i > 0 && 'border-t border-[#d9cfb2]')} style={{ gap: u(0.4) }}>
                    <div className="flex min-w-0 flex-1 flex-wrap content-center items-center justify-center" style={{ gap: u(0.3) }}>{icons(g.teams)}</div>
                    {pick(g.pick)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-0 min-w-0 flex-1" style={{ padding: `${u(0.6)} ${u(0.3)}` }}>
                {space.groups.map((g, i) => (
                  <div key={i} className={cn('flex min-w-0 flex-1 flex-col items-center', i > 0 && 'border-l border-[#d9cfb2]')}>
                    <div className="flex min-h-0 flex-1 flex-wrap content-center items-center justify-center" style={{ gap: u(side ? 0.3 : 0.4) }}>{icons(g.teams)}</div>
                    {pick(g.pick)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* back: closed — dark card, gold stamp with the deal number and what it was worth */}
        <div
          className="boss-space-back absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_40%,#3a2d7a,#1a1340_75%)] text-[#8a82b3] ring-2 ring-[#e9b949]/70 [backface-visibility:hidden] [transform:rotateY(180deg)]"
          style={{ borderRadius: u(1.4), gap: u(0.6), padding: u(0.6) }}
        >
          <span className="whitespace-nowrap rounded-[0.5em] border-[0.12em] border-dashed border-[#e9b949]/80 font-black text-[#ffd77a] [transform:rotate(-6deg)]" style={{ fontSize: u(big ? 2.2 : 1.7), padding: `${u(0.2)} ${u(0.8)}` }}>{t('boss.deal.closedStamp', { n: space.closedByDeal })}</span>
          {space.closedValue ? <Word text={t('boss.money', { m: millions(space.closedValue) })} className="tabular-nums" style={{ fontSize: u(big ? 5 : shape === 'corner' ? 5.2 : 3.6) }} /> : null}
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
  const d = view.deal
  const status = d && d.requiredIds.includes(seat.userId) ? (d.acceptedIds.includes(seat.userId) ? 'ok' : d.declinedIds.includes(seat.userId) ? 'no' : 'wait') : null
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
      <SeatFaces view={view} userId={seat.userId} mood={mood} className={compact ? 'size-10' : dark ? 'size-14' : 'size-12'} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1 truncate text-sm font-bold">
          {isBoss && <Crown className="size-3.5 shrink-0 text-amber-500" aria-label={t('boss.cards.boss')} />}
          <PlayerName name={name} />
          {!online && <WifiOff className="size-3 shrink-0 opacity-70" aria-hidden="true" />}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex">{seat.investors.map((team) => <TeamBadge key={team} team={team} className="-mr-1 size-5" />)}</span>
          <CashTag seat={seat} />
          {/* public reaction to the deal */}
          {status && <span className={cn('rounded-full px-1.5 text-[10px] font-black', status === 'ok' ? 'bg-emerald-500/25 text-emerald-200' : status === 'no' ? 'bg-red-500/25 text-red-200' : 'bg-white/10 text-white/70')}>{t(status === 'ok' ? 'boss.deal.accepted' : status === 'no' ? 'boss.deal.declined' : 'boss.deal.waiting')}</span>}
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
