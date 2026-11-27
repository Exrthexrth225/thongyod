import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Banknote,
  Check,
  Crown,
  Dices,
  Hand,
  Handshake,
  Layers,
  Minus,
  Plane,
  Plus,
  RotateCcw,
  Sparkles,
  Trophy,
  UserPlus,
  X,
} from 'lucide-react'
import { useBackToLobby, useBossAction, useRoomSettings, useStartRound } from '@/api/rooms'
import type { BossHandCard, BossRoomData, InvestorTeam } from '@/api/types'
import { SegmentedChoice } from '@/components/common/SegmentedChoice'
import { TimerBar } from '@/components/games/TimerBar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { showErrorToast } from '@/lib/toast'
import { unlockSound } from '@/lib/sound'
import { useGameSound } from '@/lib/soundPrefs'
import { cn } from '@/lib/utils'
import { RoomLobby } from '../rooms/RoomParts'
import { useSecondsLeft } from '../rooms/useSecondsLeft'
import { BossBoard } from './BossBoard'
import { BossEventBanner } from './BossEventBanner'
import { BossSeats } from './BossSeats'
import { TEAM_LIST, TEAM_META, formatMillions } from './teamMeta'
import './boss.css'

const MIN_PLAYERS = 3
const STEP_AMOUNT = 500_000

type Props = { room: BossRoomData; meId: string; onLeave: () => void }

export function BossRoom({ room, meId, onLeave }: Props) {
  const { t } = useTranslation()
  const sound = useGameSound('boss')
  const isHost = room.hostId === meId
  const start = useStartRound(room.code)
  const lobby = useBackToLobby(room.code)
  const settings = useRoomSettings(room.code)
  const act = useBossAction(room.code)

  const [selectedSpace, setSelectedSpace] = useState<number | null>(null)
  const [allocDraft, setAllocDraft] = useState<{ key: string; map: Record<string, number> }>({ key: '', map: {} })
  const [cardTarget, setCardTarget] = useState<{ kind: 'travel' | 'recruit'; card: BossHandCard } | null>(null)
  const [discardState, setDiscardState] = useState<{ rev: number; ids: string[] }>({ rev: -1, ids: [] })

  const onError = () => showErrorToast(t('common.saveError'))
  const nameOf = (id: string) => room.players.find((p) => p.userId === id)?.displayName ?? '?'

  const boss = room.boss
  const deadline =
    boss?.phase === 'interrupt'
      ? (boss.interrupt?.deadlineAt ?? null)
      : boss?.phase === 'closing'
        ? (boss.deal?.closingDeadlineAt ?? null)
        : null
  const secondsLeft = useSecondsLeft(deadline)

  const curDealKey = boss?.deal ? `${boss.deal.id}:${boss.deal.bossId}` : ''
  const existingSum = boss?.deal ? Object.values(boss.deal.allocation).reduce((a, b) => a + b, 0) : 0
  const defaultAlloc: Record<string, number> = boss?.deal
    ? existingSum === boss.deal.totalValue
      ? boss.deal.allocation
      : { [boss.deal.bossId]: boss.deal.totalValue }
    : {}
  const draftAlloc = allocDraft.key === curDealKey ? allocDraft.map : defaultAlloc
  const setDraftAlloc = (updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => {
    setAllocDraft((prev) => {
      const base = prev.key === curDealKey ? prev.map : defaultAlloc
      const next = typeof updater === 'function' ? updater(base) : updater
      return { key: curDealKey, map: next }
    })
  }

  const discardRev = boss?.phase === 'discard_limit' ? boss.revision : -1
  const discardIds = discardState.rev === discardRev ? discardState.ids : []
  const setDiscardIds = (updater: (prev: string[]) => string[]) => {
    setDiscardState((prev) => ({
      rev: discardRev,
      ids: updater(prev.rev === discardRev ? prev.ids : []),
    }))
  }

  if (room.state === 'lobby' || !boss) {
    return (
      <RoomLobby
        room={room}
        isHost={isHost}
        minPlayers={MIN_PLAYERS}
        starting={start.isPending}
        onStart={() => {
          unlockSound()
          start.mutate(undefined, { onError })
        }}
        onLeave={onLeave}
      >
        <SegmentedChoice<string>
          label={t('boss.settings.closingTitle')}
          value={String(room.settings.closingSeconds)}
          onChange={(v) => settings.mutate({ closingSeconds: Number(v) as 10 | 15 }, { onError })}
          options={[
            { value: '10', label: t('boss.settings.sec10') },
            { value: '15', label: t('boss.settings.sec15') },
          ]}
        />
        <p className="text-xs text-muted-foreground">{t('boss.settings.hint')}</p>
      </RoomLobby>
    )
  }

  const send = (action: Parameters<typeof act.mutate>[0]) => {
    unlockSound()
    act.mutate(action, { onError })
  }

  const deal = boss.deal
  const isMyTurn = boss.turnPlayerId === meId
  const canPickStart = boss.phase === 'pick_start' && boss.markerChooserId === meId
  const isBoss = deal?.bossId === meId
  const mySeat = boss.seats.find((s) => s.userId === meId)
  const recruitCards = boss.myHand.filter((c) => c.kind === 'recruit')
  const stopCard = boss.myHand.find((c) => c.kind === 'stop')

  const dealSpace = deal ? boss.spaces[deal.spaceIndex] : null
  const blockedSet = new Set(deal?.blockedTeams ?? [])
  const activeProviders = new Map<InvestorTeam, string[]>()
  if (deal && dealSpace) {
    for (const team of [...dealSpace.required, ...dealSpace.optional]) {
      const ids = new Set<string>()
      if (!blockedSet.has(team)) {
        const owner = boss.seats.find((s) => s.investors.includes(team))
        if (owner) ids.add(owner.userId)
      }
      for (const tc of deal.tableCards) if (tc.team === team) ids.add(tc.ownerId)
      if (ids.size > 0) activeProviders.set(team, [...ids])
    }
  }
  const eligibleRecipientIds = deal
    ? [...new Set([deal.bossId, ...Array.from(activeProviders.values()).flat()])]
    : []

  const acceptedSet = new Set(deal ? [deal.bossId, ...deal.acceptedIds] : [])
  const serverAllocSum = deal ? Object.values(deal.allocation).reduce((a, b) => a + b, 0) : 0
  const hasServerOffer = Boolean(deal && serverAllocSum === deal.totalValue)

  const canStartClosing = (() => {
    if (!deal || !dealSpace || !hasServerOffer) return false
    for (const [id, amt] of Object.entries(deal.allocation)) {
      if (amt > 0 && !acceptedSet.has(id)) return false
    }
    for (const req of dealSpace.required) {
      const prov = activeProviders.get(req) ?? []
      if (!prov.some((id) => acceptedSet.has(id))) return false
    }
    let agreedCount = 0
    for (const team of [...dealSpace.required, ...dealSpace.optional]) {
      const prov = activeProviders.get(team) ?? []
      if (prov.some((id) => acceptedSet.has(id))) agreedCount += 1
    }
    return agreedCount >= dealSpace.teamCount
  })()

  const draftSum = eligibleRecipientIds.reduce((sum, id) => sum + (draftAlloc[id] ?? 0), 0)
  const draftRemaining = deal ? deal.totalValue - draftSum : 0

  function splitEqually() {
    if (!deal) return
    const list = eligibleRecipientIds
    if (!list.length) return
    const units = Math.floor(deal.totalValue / STEP_AMOUNT)
    const base = Math.floor(units / list.length) * STEP_AMOUNT
    const rem = (units % list.length) * STEP_AMOUNT
    const next: Record<string, number> = {}
    list.forEach((id) => {
      next[id] = base + (id === deal.bossId ? rem : 0)
    })
    setDraftAlloc(next)
  }

  function nudgeShare(id: string, delta: number) {
    if (!deal) return
    const cur = draftAlloc[id] ?? 0
    const nextVal = Math.max(0, cur + delta)
    if (delta > 0 && draftRemaining < delta) return
    setDraftAlloc((prev) => ({ ...prev, [id]: nextVal }))
  }

  // Available target colors for Travel or Recruit dialogs
  const travelTargets: InvestorTeam[] = (() => {
    if (!cardTarget || cardTarget.kind !== 'travel' || !deal) return []
    const card = cardTarget.card
    if (card.kind !== 'travel') return []
    const candidates = card.team === 'any' ? TEAM_LIST : [card.team]
    return candidates.filter((team) => {
      const onTable = deal.tableCards.some((tc) => tc.team === team)
      const activeOwner = !blockedSet.has(team) && boss.seats.some((s) => s.investors.includes(team))
      return onTable || activeOwner
    })
  })()

  const recruitTargets: InvestorTeam[] = (() => {
    if (boss.availableInvestors.length > 0) return boss.availableInvestors
    return boss.seats.filter((s) => s.userId !== meId).flatMap((s) => s.investors)
  })()

  function onPlayHandCard(card: BossHandCard) {
    if (!deal || (boss?.phase !== 'negotiating' && boss?.phase !== 'closing')) return
    if (card.kind === 'team') {
      send({ type: 'play_team', cardId: card.id })
    } else if (card.kind === 'boss') {
      send({ type: 'play_boss', cardId: card.id })
    } else if (card.kind === 'travel') {
      setCardTarget({ kind: 'travel', card })
    } else if (card.kind === 'recruit') {
      setCardTarget({ kind: 'recruit', card })
    }
  }

  function isHandCardPlayable(card: BossHandCard): boolean {
    if (!boss) return false
    if (boss.phase === 'interrupt') {
      return card.kind === 'stop' && boss.interrupt?.lastActorId !== meId
    }
    if ((boss.phase === 'negotiating' || boss.phase === 'closing') && deal && dealSpace) {
      if (card.kind === 'team') return dealSpace.required.includes(card.team) || dealSpace.optional.includes(card.team)
      if (card.kind === 'boss') return deal.bossId !== meId
      if (card.kind === 'travel') {
        const candidates = card.team === 'any' ? TEAM_LIST : [card.team]
        return candidates.some((team) => deal.tableCards.some((tc) => tc.team === team) || (!blockedSet.has(team) && boss.seats.some((s) => s.investors.includes(team))))
      }
      if (card.kind === 'recruit') return recruitCards.length >= 3
    }
    return false
  }

  const rankedSeats = [...boss.seats].sort((a, b) => (b.exactCash ?? 0) - (a.exactCash ?? 0))

  return (
    <div className="flex flex-col gap-3 px-4 pb-10">
      <BossEventBanner events={boss.events} players={room.players} sound={sound} />

      <BossBoard
        boss={boss}
        canPickStart={canPickStart}
        onPickStart={(spaceIndex) => send({ type: 'pick_start', spaceIndex })}
        selectedSpace={selectedSpace}
        onSelectSpace={setSelectedSpace}
        sound={sound}
      />

      <BossSeats boss={boss} players={room.players} meId={meId} />

      {/* Action Panel */}
      <section className="flex flex-col gap-3 rounded-3xl bg-card p-4 shadow-sm">
        {boss.phase === 'pick_start' && (
          <div className="flex flex-col gap-1 text-center">
            <p className="font-heading text-base font-bold">
              {canPickStart ? t('boss.actions.pickStartMe') : t('boss.actions.pickStartOther', { name: nameOf(boss.markerChooserId) })}
            </p>
            <p className="text-xs text-muted-foreground">{t('boss.actions.firstPlayerNote', { name: nameOf(boss.turnPlayerId) })}</p>
          </div>
        )}

        {boss.phase === 'turn_choice' && (
          <div className="flex flex-col gap-2">
            <p className="text-center font-heading text-base font-bold">
              {isMyTurn ? t('boss.actions.yourTurn') : t('boss.actions.waitTurn', { name: nameOf(boss.turnPlayerId) })}
            </p>
            {isMyTurn && (
              <div className="grid grid-cols-2 gap-2">
                <Button size="lg" disabled={act.isPending} onClick={() => send({ type: 'roll_die' })}>
                  <Dices data-icon="inline-start" />
                  {t('boss.actions.rollDie')}
                </Button>
                <Button size="lg" variant="secondary" disabled={act.isPending} onClick={() => send({ type: 'open_deal' })}>
                  <Handshake data-icon="inline-start" />
                  {t('boss.actions.dealHere')}
                </Button>
              </div>
            )}
          </div>
        )}

        {boss.phase === 'rolled_choice' && (
          <div className="flex flex-col gap-2">
            <p className="text-center font-heading text-base font-bold">
              {isMyTurn
                ? t('boss.actions.rolledMe', { roll: boss.lastRoll ?? 1 })
                : t('boss.actions.rolledOther', { name: nameOf(boss.turnPlayerId), roll: boss.lastRoll ?? 1 })}
            </p>
            {isMyTurn && (
              <div className="grid grid-cols-2 gap-2">
                <Button size="lg" disabled={act.isPending} onClick={() => send({ type: 'open_deal' })}>
                  <Handshake data-icon="inline-start" />
                  {t('boss.actions.openDeal')}
                </Button>
                <Button size="lg" variant="outline" disabled={act.isPending} onClick={() => send({ type: 'draw_cards' })}>
                  <Layers data-icon="inline-start" />
                  {t('boss.actions.drawThree')}
                </Button>
              </div>
            )}
          </div>
        )}

        {boss.phase === 'discard_limit' && (
          <div className="flex flex-col gap-3">
            {boss.discardPendingCount > 0 ? (
              <>
                <p className="font-heading text-base font-bold text-center">
                  {t('boss.actions.discardMe', { count: boss.discardPendingCount })}
                </p>
                <Button
                  size="lg"
                  disabled={discardIds.length !== boss.discardPendingCount || act.isPending}
                  onClick={() => send({ type: 'discard_cards', cardIds: discardIds })}
                >
                  <Check data-icon="inline-start" />
                  {t('boss.actions.confirmDiscard', { picked: discardIds.length, need: boss.discardPendingCount })}
                </Button>
              </>
            ) : (
              <p className="text-center text-sm text-muted-foreground">{t('boss.actions.discardWait')}</p>
            )}
          </div>
        )}

        {(boss.phase === 'negotiating' || boss.phase === 'closing') && deal && dealSpace && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 font-heading text-base font-bold">
                  <Crown className="size-4 text-amber-500" aria-hidden="true" />
                  {t('boss.deal.header', { n: deal.dealNumber, boss: isBoss ? t('boss.you') : nameOf(deal.bossId) })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('boss.deal.pool', { amount: formatMillions(deal.totalValue), count: dealSpace.teamCount })}
                </p>
              </div>
              {boss.phase === 'closing' && (
                <span className="rounded-full bg-mint px-2.5 py-1 text-xs font-bold text-on-slab tabular-nums">
                  {t('boss.deal.closingIn', { sec: secondsLeft })}
                </span>
              )}
            </div>

            {boss.phase === 'closing' && <TimerBar left={secondsLeft} total={room.settings.closingSeconds} />}

            {/* Boss Allocation Controls */}
            {isBoss ? (
              <div className="flex flex-col gap-2 rounded-2xl bg-background/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">
                    {t('boss.deal.splitTitle')} ({draftRemaining === 0 ? t('boss.deal.balanced') : t('boss.deal.left', { amount: formatMillions(draftRemaining) })})
                  </span>
                  <Button type="button" size="xs" variant="outline" onClick={splitEqually}>
                    <Sparkles data-icon="inline-start" />
                    {t('boss.deal.splitEqual')}
                  </Button>
                </div>

                <ul className="flex flex-col gap-1.5">
                  {eligibleRecipientIds.map((id) => (
                    <li key={id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {id === meId ? t('boss.you') : nameOf(id)}
                        {acceptedSet.has(id) && <Check className="ml-1 inline size-3 text-emerald-500" aria-hidden="true" />}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="outline"
                          disabled={(draftAlloc[id] ?? 0) < STEP_AMOUNT}
                          onClick={() => nudgeShare(id, -STEP_AMOUNT)}
                          aria-label="-"
                        >
                          <Minus />
                        </Button>
                        <span className="w-16 text-center font-bold tabular-nums">{formatMillions(draftAlloc[id] ?? 0)}</span>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="outline"
                          disabled={draftRemaining < STEP_AMOUNT}
                          onClick={() => nudgeShare(id, STEP_AMOUNT)}
                          aria-label="+"
                        >
                          <Plus />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-1 grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={draftRemaining !== 0 || act.isPending}
                    onClick={() => send({ type: 'set_allocation', allocation: draftAlloc })}
                  >
                    <Banknote data-icon="inline-start" />
                    {t('boss.deal.propose')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!canStartClosing || boss.phase === 'closing' || act.isPending}
                    onClick={() => send({ type: 'start_closing' })}
                  >
                    <Handshake data-icon="inline-start" />
                    {t('boss.deal.close')}
                  </Button>
                </div>
                <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => send({ type: 'fail_deal' })}>
                  <X data-icon="inline-start" />
                  {t('boss.deal.fail')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 rounded-2xl bg-background/80 p-3">
                {hasServerOffer ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span>{t('boss.deal.yourOffer')}</span>
                      <span className="font-heading text-lg font-extrabold text-brand tabular-nums">
                        {formatMillions(deal.allocation[meId] ?? 0)}
                      </span>
                    </div>
                    {boss.phase === 'negotiating' && (
                      <Button
                        size="lg"
                        disabled={deal.acceptedIds.includes(meId) || act.isPending}
                        onClick={() => send({ type: 'accept_offer' })}
                      >
                        <Check data-icon="inline-start" />
                        {deal.acceptedIds.includes(meId) ? t('boss.deal.alreadyAccepted') : t('boss.deal.accept')}
                      </Button>
                    )}
                  </>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">{t('boss.deal.waitingOffer', { boss: nameOf(deal.bossId) })}</p>
                )}
              </div>
            )}
          </div>
        )}

        {boss.phase === 'interrupt' && boss.interrupt && (
          <div className="flex flex-col gap-3 rounded-2xl bg-yolk/25 p-3">
            <div className="flex items-center justify-between">
              <p className="font-heading text-base font-bold">
                {t(`boss.interrupt.${boss.interrupt.kind}`, {
                  actor: nameOf(boss.interrupt.actorId),
                  team: boss.interrupt.targetTeam ? t(`boss.teams.${boss.interrupt.targetTeam}`) : '',
                })}
              </p>
              <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-ink-foreground tabular-nums">{secondsLeft}s</span>
            </div>
            <TimerBar left={secondsLeft} total={10} />
            <p className="text-xs font-semibold">
              {boss.interrupt.stopCount % 2 === 1 ? t('boss.interrupt.currentlyStopped') : t('boss.interrupt.currentlyActive')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {stopCard && boss.interrupt.lastActorId !== meId && (
                <Button
                  size="lg"
                  variant="destructive"
                  disabled={act.isPending}
                  onClick={() => send({ type: 'play_stop', cardId: stopCard.id })}
                >
                  <Hand data-icon="inline-start" />
                  {t('boss.interrupt.playStop')}
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                className={cn(!(stopCard && boss.interrupt.lastActorId !== meId) && 'col-span-2')}
                disabled={boss.interrupt.passedIds.includes(meId) || act.isPending}
                onClick={() => send({ type: 'pass_interrupt' })}
              >
                <Check data-icon="inline-start" />
                {boss.interrupt.passedIds.includes(meId) ? t('boss.interrupt.passed') : t('boss.interrupt.pass')}
              </Button>
            </div>
          </div>
        )}

        {boss.phase === 'game_over' && (
          <div className="flex flex-col gap-3">
            <div className="boss-slam flex flex-col items-center gap-1 rounded-3xl bg-yolk p-4 text-center text-on-slab">
              <Trophy className="size-10" aria-hidden="true" />
              <p className="font-heading text-xl font-extrabold">{t('boss.gameOver.title')}</p>
              <p className="text-sm font-bold">{boss.winnerIds.map(nameOf).join(', ')}</p>
            </div>
            <ul className="flex flex-col gap-1.5">
              {rankedSeats.map((s, idx) => (
                <li key={s.userId} className="flex items-center justify-between rounded-2xl bg-background/80 px-3 py-2 text-sm">
                  <span className="font-bold">
                    #{idx + 1} {s.userId === meId ? t('boss.you') : nameOf(s.userId)}
                  </span>
                  <span className="font-heading font-extrabold text-brand tabular-nums">{formatMillions(s.exactCash ?? 0)}</span>
                </li>
              ))}
            </ul>
            {isHost ? (
              <div className="grid grid-cols-2 gap-2">
                <Button size="lg" onClick={() => start.mutate(undefined, { onError })} disabled={start.isPending}>
                  <RotateCcw data-icon="inline-start" />
                  {t('games.playAgain')}
                </Button>
                <Button size="lg" variant="outline" onClick={() => lobby.mutate(undefined, { onError })}>
                  {t('rooms.backToLobby')}
                </Button>
              </div>
            ) : (
              <p className="text-center text-xs text-muted-foreground">{t('rooms.waitHost', { name: nameOf(room.hostId) })}</p>
            )}
          </div>
        )}
      </section>

      {/* Player Hand */}
      {mySeat && boss.phase !== 'game_over' && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-heading text-sm font-bold">
              {t('boss.hand.title', { count: boss.myHand.length })}
            </h2>
            {recruitCards.length >= 3 && (
              <span className="rounded-full bg-lilac px-2 py-0.5 text-[11px] font-bold text-on-slab">
                {t('boss.hand.recruitReady', { count: recruitCards.length })}
              </span>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
            {boss.myHand.map((card) => {
              const discardMode = boss.phase === 'discard_limit' && boss.discardPendingCount > 0
              const pickedDiscard = discardIds.includes(card.id)
              const playable = discardMode || isHandCardPlayable(card)
              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={!playable || act.isPending}
                  onClick={() => {
                    if (discardMode) {
                      setDiscardIds((prev) =>
                        prev.includes(card.id)
                          ? prev.filter((x) => x !== card.id)
                          : prev.length < boss.discardPendingCount
                            ? [...prev, card.id]
                            : prev,
                      )
                    } else {
                      onPlayHandCard(card)
                    }
                  }}
                  className={cn(
                    'pressable flex w-24 shrink-0 flex-col items-center justify-between gap-1.5 rounded-2xl p-2.5 text-center transition-all',
                    card.kind === 'team' && TEAM_META[card.team].badge,
                    card.kind === 'travel' && 'bg-sky text-on-slab',
                    card.kind === 'recruit' && 'bg-lilac text-on-slab',
                    card.kind === 'boss' && 'bg-yolk text-on-slab',
                    card.kind === 'stop' && 'bg-rose-600 text-white',
                    !playable && 'opacity-45',
                    pickedDiscard && 'ring-4 ring-ink scale-95',
                  )}
                >
                  {card.kind === 'team' ? (
                    <img src={TEAM_META[card.team].img} alt="" className="size-10 rounded-full bg-white/85 object-cover" />
                  ) : card.kind === 'travel' ? (
                    card.team === 'any' ? (
                      <Plane className="size-8" aria-hidden="true" />
                    ) : (
                      <img src={TEAM_META[card.team].img} alt="" className="size-10 rounded-full bg-white/85 object-cover grayscale" />
                    )
                  ) : card.kind === 'recruit' ? (
                    <UserPlus className="size-8" aria-hidden="true" />
                  ) : card.kind === 'boss' ? (
                    <Crown className="size-8" aria-hidden="true" />
                  ) : (
                    <Hand className="size-8" aria-hidden="true" />
                  )}
                  <span className="text-[11px] leading-tight font-extrabold">
                    {card.kind === 'team'
                      ? t(`boss.teams.${card.team}`)
                      : card.kind === 'travel'
                        ? card.team === 'any'
                          ? t('boss.cards.travelAny')
                          : t('boss.cards.travelTeam', { team: t(`boss.teamsShort.${card.team}`) })
                        : t(`boss.cards.${card.kind}`)}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Target Selection Dialog for Travel / Recruit */}
      <Dialog open={cardTarget !== null} onOpenChange={(open) => !open && setCardTarget(null)}>
        {cardTarget && (
          <DialogContent title={cardTarget.kind === 'travel' ? t('boss.dialogs.travelTitle') : t('boss.dialogs.recruitTitle')}>
            <div className="grid grid-cols-2 gap-2">
              {(cardTarget.kind === 'travel' ? travelTargets : recruitTargets).map((team) => (
                <Button
                  key={team}
                  variant="outline"
                  size="lg"
                  className="justify-start gap-2"
                  onClick={() => {
                    if (cardTarget.kind === 'travel') {
                      send({ type: 'play_travel', cardId: cardTarget.card.id, targetTeam: team })
                    } else {
                      const ids = recruitCards.slice(0, 3).map((c) => c.id) as [string, string, string]
                      send({ type: 'play_recruit', cardIds: ids, targetTeam: team })
                    }
                    setCardTarget(null)
                  }}
                >
                  <img src={TEAM_META[team].img} alt="" className="size-7 rounded-full object-cover" />
                  <span>{t(`boss.teams.${team}`)}</span>
                </Button>
              ))}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
