import { useTranslation } from 'react-i18next'
import { Banknote, Check, Crown, Plane, Trophy } from 'lucide-react'
import type { BossView, InvestorTeam, RoomPlayer } from '@/api/types'
import { Avatar } from '@/components/common/Avatar'
import { cn } from '@/lib/utils'
import { CASH_STACK_COUNT, TEAM_META, formatMillions } from './teamMeta'

type Props = {
  boss: BossView
  players: RoomPlayer[]
  meId: string
}

export function BossSeats({ boss, players, meId }: Props) {
  const { t } = useTranslation()
  const blocked = new Set(boss.deal?.blockedTeams ?? [])
  const accepted = new Set(boss.deal?.acceptedIds ?? [])
  const tableCards = boss.deal?.tableCards ?? []

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {boss.seats.map((seat) => {
          const p = players.find((x) => x.userId === seat.userId)
          const isMe = seat.userId === meId
          const isTurn = boss.phase !== 'game_over' && (boss.phase === 'pick_start' ? boss.markerChooserId : boss.turnPlayerId) === seat.userId
          const isBoss = boss.deal?.bossId === seat.userId
          const isWinner = boss.phase === 'game_over' && boss.winnerIds.includes(seat.userId)
          const offer = boss.deal?.allocation[seat.userId] ?? 0
          const hasAccepted = accepted.has(seat.userId)
          const seatTableCards = tableCards.filter((tc) => tc.ownerId === seat.userId)
          const stackCount = CASH_STACK_COUNT[seat.cashTier]

          return (
            <div
              key={seat.userId}
              className={cn(
                'relative flex flex-col gap-1.5 rounded-3xl bg-card p-2.5 transition-all',
                isBoss && 'ring-2 ring-yolk bg-yolk/10',
                !isBoss && isTurn && 'ring-2 ring-brand',
                isWinner && 'boss-winner-hop ring-2 ring-amber-400 bg-yolk/25',
              )}
            >
              <div className="flex items-center gap-2">
                <Avatar name={p?.displayName ?? '?'} src={p?.avatarUrl ?? null} className="size-8 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-xs leading-tight font-bold">
                    <span className="truncate">{isMe ? t('boss.you') : (p?.displayName ?? '?')}</span>
                    {isBoss && <Crown className="boss-crown-bob size-3.5 shrink-0 text-amber-500" aria-label="Boss" />}
                    {isWinner && <Trophy className="size-3.5 shrink-0 text-amber-500" aria-label="Winner" />}
                  </p>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                    <span>🃏 {seat.handCount}</span>
                    {seat.exactCash !== null ? (
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatMillions(seat.exactCash)}</span>
                    ) : (
                      <span className="flex items-center gap-0.5" title={t(`boss.cashTiers.${seat.cashTier}`)}>
                        {stackCount === 0 ? (
                          <span>$0</span>
                        ) : (
                          Array.from({ length: stackCount }).map((_, idx) => (
                            <Banknote key={idx} className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                          ))
                        )}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Owned Investor Portraits + Exposed Table Team Cards */}
              <div className="flex flex-wrap items-center gap-1">
                {seat.investors.map((team: InvestorTeam) => {
                  const isBlocked = blocked.has(team)
                  return (
                    <span
                      key={team}
                      title={t(`boss.teams.${team}`)}
                      className={cn(
                        'relative flex items-center gap-1 rounded-full pr-1.5 pl-0.5 py-0.5 text-[10px] font-bold',
                        TEAM_META[team].badge,
                        isBlocked && 'opacity-40 grayscale',
                      )}
                    >
                      <img src={TEAM_META[team].img} alt="" className="size-5 rounded-full bg-white/80 object-cover" />
                      <span>{t(`boss.teamsShort.${team}`)}</span>
                      {isBlocked && <Plane className="size-3" aria-hidden="true" />}
                    </span>
                  )
                })}
                {seatTableCards.map((tc) => (
                  <span
                    key={tc.id}
                    className={cn(
                      'flex items-center gap-0.5 rounded-full border border-dashed border-current px-1.5 py-0.5 text-[10px] font-bold',
                      TEAM_META[tc.team].bg,
                    )}
                  >
                    <img src={TEAM_META[tc.team].img} alt="" className="size-4 rounded-full object-cover" />+{t(`boss.teamsShort.${tc.team}`)}
                  </span>
                ))}
              </div>

              {/* Active Deal Offer Badge */}
              {boss.deal && (offer > 0 || hasAccepted) && (
                <div className="flex items-center justify-between rounded-xl bg-background/85 px-2 py-0.5 text-[11px] font-bold tabular-nums">
                  <span className="text-brand">{formatMillions(offer)}</span>
                  {hasAccepted && <Check className="size-3.5 text-emerald-500" aria-label={t('boss.accepted')} />}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Unowned / Available Investors Pool */}
      {boss.availableInvestors.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-card/75 px-3 py-2 text-xs">
          <span className="font-semibold text-muted-foreground">{t('boss.availablePool')}</span>
          {boss.availableInvestors.map((team) => (
            <span key={team} className={cn('flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold', TEAM_META[team].badge)}>
              <img src={TEAM_META[team].img} alt="" className="size-4 rounded-full bg-white/80 object-cover" />
              {t(`boss.teams.${team}`)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
