import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Dices, DollarSign, Flame, Lock } from 'lucide-react'
import type { BossBoardSpace, BossView } from '@/api/types'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/utils'
import { TEAM_META, formatMillions } from './teamMeta'

/** Perimeter coordinates (row 1..5, col 1..5) going clockwise around a 5x5 board (16 spaces). */
const GRID_POS: [row: number, col: number][] = [
  [1, 1], [1, 2], [1, 3], [1, 4], [1, 5],
  [2, 5], [3, 5], [4, 5],
  [5, 5], [5, 4], [5, 3], [5, 2], [5, 1],
  [4, 1], [3, 1], [2, 1],
]

type Props = {
  boss: BossView
  canPickStart: boolean
  onPickStart: (spaceIndex: number) => void
  selectedSpace: number | null
  onSelectSpace: (spaceIndex: number) => void
  sound: boolean
}

export function BossBoard({ boss, canPickStart, onPickStart, selectedSpace, onSelectSpace, sound }: Props) {
  const { t } = useTranslation()
  const [hopMarker, setHopMarker] = useState<{ pos: number; hopping: boolean } | null>(null)
  const prevMarker = useRef<number | null>(boss.markerSpace)
  const prevRev = useRef(boss.revision)

  // Step-by-step bouncy marker hop whenever the server advances markerSpace.
  useEffect(() => {
    const target = boss.markerSpace
    const from = prevMarker.current
    const revChanged = boss.revision !== prevRev.current
    prevMarker.current = target
    prevRev.current = boss.revision
    if (target === null || from === null || from === target || !revChanged) return

    const closed = new Set(boss.spaces.filter((s) => s.closedByDeal !== null && s.index !== target).map((s) => s.index))
    const path: number[] = []
    let cur = from
    for (let guard = 0; guard < 16 && cur !== target; guard++) {
      cur = (cur + 1) % 16
      if (!closed.has(cur) || cur === target) path.push(cur)
    }
    if (!path.length) return

    const timers: number[] = []
    path.forEach((step, idx) => {
      timers.push(
        window.setTimeout(() => {
          setHopMarker({ pos: step, hopping: true })
          if (sound) playSound('tick', 0.65)
          if (idx === path.length - 1) {
            timers.push(window.setTimeout(() => setHopMarker(null), 260))
          }
        }, idx * 140),
      )
    })
    return () => timers.forEach(window.clearTimeout)
  }, [boss.markerSpace, boss.revision, boss.spaces, sound])

  const displayMarker = hopMarker ? hopMarker.pos : boss.markerSpace
  const hopping = Boolean(hopMarker?.hopping)
  const inspected = selectedSpace !== null ? boss.spaces[selectedSpace] : displayMarker !== null ? boss.spaces[displayMarker] : null
  const inEndZone = boss.currentDealNumber >= 10 && boss.phase !== 'game_over'

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-5 grid-rows-5 gap-1.5 rounded-[28px] bg-card p-2 shadow-sm">
        {boss.spaces.map((space) => {
          const [row, col] = GRID_POS[space.index]
          const isMarker = displayMarker === space.index
          const isClosed = space.closedByDeal !== null
          const isSelected = selectedSpace === space.index
          const interactive = canPickStart || !isClosed || isMarker
          return (
            <button
              key={space.index}
              type="button"
              disabled={!interactive}
              onClick={() => (canPickStart ? onPickStart(space.index) : onSelectSpace(space.index))}
              style={{ gridRowStart: row, gridColumnStart: col }}
              aria-label={t('boss.board.spaceAria', { n: space.index + 1, div: space.dividends, teams: space.teamCount })}
              className={cn(
                'relative flex min-h-[54px] flex-col items-center justify-between rounded-2xl p-1 text-center transition-transform active:scale-95',
                isClosed
                  ? 'bg-muted/60 opacity-55'
                  : isMarker
                    ? 'bg-yolk text-on-slab ring-2 ring-ink shadow-md'
                    : canPickStart
                      ? 'bg-mint/45 ring-2 ring-brand/60 hover:bg-mint/70'
                      : 'bg-background/90 hover:bg-muted',
                isSelected && !isMarker && 'ring-2 ring-brand',
              )}
            >
              <div className="flex w-full items-center justify-between px-0.5 text-[10px] leading-none font-bold">
                <span className="opacity-65">#{space.index + 1}</span>
                <span className={cn('rounded-full px-1 py-0.5 tabular-nums', isMarker ? 'bg-ink text-ink-foreground' : 'bg-yolk/70 text-on-slab')}>
                  {space.teamCount}/{space.dividends}★
                </span>
              </div>

              {isClosed ? (
                <div className="flex flex-col items-center justify-center">
                  <Lock className="size-3.5 opacity-70" aria-hidden="true" />
                  <span className="text-[9px] font-bold">#{space.closedByDeal}</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-0.5 py-0.5">
                  {space.required.map((team) => (
                    <span key={`r-${team}`} className={cn('size-2.5 rounded-full ring-1 ring-black/25', TEAM_META[team].dot)} />
                  ))}
                  {space.optional.map((team) => (
                    <span key={`o-${team}`} className={cn('size-2 rounded-full opacity-55 ring-1 ring-dashed ring-black/35', TEAM_META[team].dot)} />
                  ))}
                </div>
              )}

              {isMarker && (
                <span
                  key={`${space.index}-${hopping ? 'h' : 'i'}`}
                  className={cn(
                    'pointer-events-none absolute -top-2 -right-1.5 z-10 grid size-6 place-items-center rounded-full bg-ink text-yolk shadow-md ring-2 ring-background',
                    hopping ? 'boss-hop' : 'boss-marker-idle',
                  )}
                >
                  <DollarSign className="size-3.5 stroke-[2.8]" aria-hidden="true" />
                </span>
              )}
            </button>
          )
        })}

        {/* 3x3 Center Arena */}
        <div
          style={{ gridRow: '2 / span 3', gridColumn: '2 / span 3' }}
          className={cn(
            'flex flex-col items-center justify-between rounded-3xl p-2.5 text-center',
            inEndZone ? 'bg-rose-500/12 ring-2 ring-rose-500/40' : 'bg-muted/65',
          )}
        >
          <div className="flex w-full items-center justify-between text-[11px] font-bold">
            <span className="rounded-full bg-ink px-2 py-0.5 text-ink-foreground tabular-nums">
              {t('boss.board.dealTag', { n: Math.min(15, boss.currentDealNumber) })}
            </span>
            <span className="text-muted-foreground tabular-nums">🃏 {boss.deckCount}</span>
          </div>

          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[11px] font-medium text-muted-foreground">{t('boss.board.perShare')}</span>
            <span className="font-heading text-2xl leading-none font-extrabold text-brand tabular-nums">
              {formatMillions(boss.currentShareValue)}
            </span>
            {inspected && inspected.closedByDeal === null && (
              <span className="mt-0.5 rounded-full bg-yolk/80 px-2 py-0.5 text-[11px] font-bold text-on-slab tabular-nums">
                {t('boss.board.totalPool', { amount: formatMillions(inspected.dividends * boss.currentShareValue) })}
              </span>
            )}
          </div>

          <div className="flex w-full items-center justify-between gap-1 text-[11px]">
            {boss.lastRoll !== null ? (
              <span key={`${boss.revision}-${boss.lastRoll}`} className="boss-dice-tumble flex items-center gap-1 rounded-full bg-background px-2 py-0.5 font-bold shadow-xs">
                <Dices className="size-3.5 text-brand" aria-hidden="true" />
                {boss.lastRoll}
              </span>
            ) : (
              <span className="text-muted-foreground">{t('boss.board.ready')}</span>
            )}
            {boss.currentEndRollFaces.length > 0 && (
              <span className="flex items-center gap-0.5 rounded-full bg-rose-600 px-2 py-0.5 font-bold text-white tabular-nums">
                <Flame className="size-3" aria-hidden="true" />
                {boss.currentEndRollFaces.join(',')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Selected or active space detail strip */}
      {inspected && <SpaceLegend space={inspected} shareValue={boss.currentShareValue} deal={boss.deal} />}
    </div>
  )
}

function SpaceLegend({ space, shareValue, deal }: { space: BossBoardSpace; shareValue: number; deal: BossView['deal'] }) {
  const { t } = useTranslation()
  const blocked = new Set(deal?.blockedTeams ?? [])
  const onTable = new Set((deal?.tableCards ?? []).map((c) => c.team))
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-card px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-heading font-bold">#{space.index + 1}</span>
        <span className="text-muted-foreground">{t('boss.board.needTeams', { count: space.teamCount })}</span>
        <span className="font-semibold text-brand">{formatMillions(space.dividends * shareValue)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {space.required.map((team) => (
          <span
            key={`req-${team}`}
            className={cn(
              'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
              TEAM_META[team].badge,
              blocked.has(team) && !onTable.has(team) && 'line-through opacity-45',
            )}
          >
            {t(`boss.teams.${team}`)}
            {onTable.has(team) && <Check className="size-2.5" aria-hidden="true" />}
          </span>
        ))}
        {space.optional.map((team) => (
          <span
            key={`opt-${team}`}
            className={cn(
              'flex items-center gap-1 rounded-full border border-current/25 px-1.5 py-0.5 text-[10px] font-semibold',
              TEAM_META[team].bg,
              blocked.has(team) && !onTable.has(team) && 'line-through opacity-45',
            )}
          >
            +{t(`boss.teams.${team}`)}
          </span>
        ))}
      </div>
    </div>
  )
}
