import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Hand, LayoutGrid, Trophy, WifiOff, X } from 'lucide-react'
import { ApiError } from '@/api/client'
import { useBackToLobby, useBossAction, useBossHost } from '@/api/rooms'
import type { BossActionPayload, BossRoomData, BossView, RoomPlayer } from '@/api/types'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { RoomLiveBar } from '@/features/rooms/RoomLiveBar'
import { showErrorToast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { BossBoard } from './BossBoard'
import { ClosingRing, Die, EndRoll, FxBanner, InterruptOverlay, MoneyFly } from './BossFx'
import { DealPanel } from './DealPanel'
import { useBossTimeline } from './useBossTimeline'
import { DiscardSheet, HandBar } from './Hand'
import { nameOf, seatTeam } from './meta'
import { AskSheet, OfferSheet } from './OfferSheet'
import { Face, Money, SeatCard, SpaceTile } from './parts'
import './boss.css'

const KNOWN_ERRORS = ['NOT_YOUR_TURN', 'NOT_BOSS', 'INVALID_PHASE', 'MISSING_REQUIRED', 'NOT_ENOUGH_TEAMS', 'NO_OFFER', 'ALREADY_STOPPED', 'RECRUIT_UNOWNED_FIRST', 'PLAYER_ONLINE'] as const
type KnownError = (typeof KNOWN_ERRORS)[number]

/** One phone in a game of I'm the Boss!: the table around you, your cards, and the moves you can make now. */
export function BossGame({ room, meId }: { room: BossRoomData; meId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const view = room.boss!
  const stage = useRef<HTMLDivElement>(null)
  const move = useBossAction(room.code)
  const lobby = useBackToLobby(room.code)
  const [offerOpen, setOfferOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [boardOpen, setBoardOpen] = useState(false)
  const [failOpen, setFailOpen] = useState(false)
  const { latest, moods } = useBossTimeline(view)

  const act = (action: BossActionPayload, after?: () => void) =>
    move.mutate(action, {
      onSuccess: after,
      onError: (e) => {
        const code = e instanceof ApiError ? e.code : undefined
        showErrorToast(code && (KNOWN_ERRORS as readonly string[]).includes(code) ? t(`boss.errors.${code as KnownError}`) : t('common.saveError'))
      },
    })

  const players = room.players
  const deal = view.deal
  const isBoss = deal?.bossId === meId
  const myTurn = !deal && view.turnPlayerId === meId
  const myStop = view.myHand.find((c) => c.kind === 'stop')
  const lastRoll = view.events.findLast((e) => e.kind === 'dice_rolled')
  const lastEndRoll = latest?.kind === 'end_roll' ? latest : null
  const settled = latest?.kind === 'deal_settled' && view.lastSettlement?.dealNumber === latest.dealNumber ? latest : null
  const space = view.markerSpace !== null ? view.spaces[view.markerSpace] : null
  const inOffer = !!deal?.offered && deal.bossId !== meId
  const myAsk = deal?.asks[meId] ?? null
  const isContributor = deal?.contributorIds.includes(meId) ?? false

  // ── The middle of the screen ──
  let field: React.ReactNode
  if (view.phase === 'game_over') field = <Results view={view} players={players} />
  else if (view.phase === 'pick_start') {
    const mine = view.markerChooserId === meId
    // Whole screen so the spaces are big enough to tap.
    field = (
      <div className="fixed inset-0 z-30 flex items-center justify-center gap-3 bg-black/70 p-2">
        <StatusLine text={mine ? t('boss.phase.pickMine') : t('boss.phase.pickStart', { name: nameOf(players, view.markerChooserId) })} />
        <BossBoard view={view} onPick={mine ? (spaceIndex) => act({ type: 'pick_start', spaceIndex }) : undefined} className="h-full" />
      </div>
    )
  } else if (deal) {
    field = (
      <div className="flex w-full flex-col items-center gap-2">
        {view.phase === 'closing' && <ClosingRing deadline={deal.closingDeadlineAt} />}
        <DealPanel view={view} players={players} meId={meId} />
      </div>
    )
  } else {
    field = (
      <div className="flex w-full flex-col items-center gap-3">
        <StatusLine text={view.phase === 'discard_limit' ? t('boss.phase.discard', { name: nameOf(players, view.turnPlayerId) }) : myTurn ? t('boss.phase.myTurn') : t('boss.phase.turn', { name: nameOf(players, view.turnPlayerId) })} />
        <div className="flex items-center gap-4">
          {space && <SpaceTile space={space} big active className="h-40 w-56 max-w-[60vw]" />}
          {view.phase === 'rolled_choice' && lastRoll && <Die key={lastRoll.id} value={lastRoll.roll ?? 1} size={60} />}
        </div>
      </div>
    )
  }

  // ── Big buttons on the side ──
  const side: React.ReactNode[] = []
  const big = 'h-14 w-full text-base font-black shadow-[0_4px_0_rgba(0,0,0,0.25)] active:translate-y-0.5'
  if (myTurn && view.phase === 'turn_choice') {
    side.push(<Button key="deal" className={big} disabled={move.isPending || space?.closedByDeal !== null} onClick={() => act({ type: 'open_deal' })}>{t('boss.act.dealHere')}</Button>)
    side.push(<Button key="roll" variant="secondary" className={cn(big, "bg-white/10 text-white hover:bg-white/20")} disabled={move.isPending} onClick={() => act({ type: 'roll_die' })}>{t('boss.act.roll')}</Button>)
  }
  if (myTurn && view.phase === 'rolled_choice') {
    side.push(<Button key="deal" className={big} disabled={move.isPending} onClick={() => act({ type: 'open_deal' })}>{t('boss.act.dealHere')}</Button>)
    side.push(<Button key="draw" variant="secondary" className={cn(big, "bg-white/10 text-white hover:bg-white/20")} disabled={move.isPending} onClick={() => act({ type: 'draw_cards' })}>{t('boss.act.draw')}</Button>)
  }
  if (deal && view.phase !== 'interrupt') {
    if (view.phase === 'closing') side.push(<Button key="wait" variant="destructive" className={big} disabled={move.isPending} onClick={() => act({ type: 'hold' })}><Hand data-icon="inline-start" />{t('boss.act.wait')}</Button>)
    if (isBoss) {
      if (view.phase === 'negotiating') side.push(<Button key="close" className={cn(big, deal.canClose && 'boss-glow')} disabled={move.isPending || !deal.canClose} onClick={() => act({ type: 'start_closing' })}>{t('boss.act.close')}</Button>)
      side.push(<Button key="offer" variant="secondary" className={cn(big, "bg-white/10 text-white hover:bg-white/20")} disabled={move.isPending} onClick={() => setOfferOpen(true)}>{deal.offered ? t('boss.act.editOffer') : t('boss.act.offer')}</Button>)
      side.push(<Button key="fail" variant="ghost" className="w-full text-white/70 hover:bg-white/10 hover:text-white" disabled={move.isPending} onClick={() => setFailOpen(true)}>{t('boss.act.fail')}</Button>)
    } else {
      if (inOffer && isContributor && view.phase === 'negotiating' && !deal.acceptedIds.includes(meId)) side.push(<Button key="acc" className={big} disabled={move.isPending} onClick={() => act({ type: 'accept_offer' })}>{t('boss.act.accept')} · <Money amount={deal.allocation[meId] ?? 0} /></Button>)
      if (inOffer && isContributor && !deal.declinedIds.includes(meId)) side.push(<Button key="dec" variant="secondary" className="w-full bg-white/10 text-white hover:bg-white/20" disabled={move.isPending} onClick={() => act({ type: 'decline_offer' })}>{t('boss.act.decline')}</Button>)
      side.push(<Button key="ask" variant="secondary" className="w-full bg-white/10 text-white hover:bg-white/20" disabled={move.isPending} onClick={() => setAskOpen(true)}>{myAsk !== null ? `${t('boss.act.ask')} · ${t('boss.money', { m: myAsk / 1_000_000 })}` : t('boss.act.ask')}</Button>)
    }
  }
  if (view.phase === 'game_over' && room.hostId === meId) side.push(<Button key="lobby" className={big} disabled={lobby.isPending} onClick={() => lobby.mutate()}>{t('boss.act.backToRoom')}</Button>)

  return (
    <div ref={stage} className="boss-stage fixed inset-0 z-40 overflow-hidden bg-[radial-gradient(ellipse_at_50%_30%,#2c2360,#17142b_65%,#120d2b)] text-white">
      <div className="boss-game relative size-full pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
        <header className="boss-top flex items-center gap-2 px-2 pt-1.5">
          <Button variant="ghost" size="icon" className="size-9 rounded-full bg-black/35 text-white hover:bg-black/50" aria-label={t('rooms.leave')} onClick={() => void navigate('/games/rooms')}><X className="size-5" /></Button>
          <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]"><PlacardLine view={view} /></div>
          {view.phase !== 'pick_start' && <Button variant="ghost" size="sm" className="rounded-full bg-black/35 text-white hover:bg-black/50" onClick={() => setBoardOpen(true)}><LayoutGrid data-icon="inline-start" />{t('boss.act.board')}</Button>}
        </header>
        <div className="boss-live px-2"><RoomLiveBar room={room} meId={meId} /></div>

        <aside className="boss-seats flex gap-1.5 overflow-auto p-2 [scrollbar-width:none]">
          {view.seats.map((s) => <SeatCard key={s.userId} view={view} seat={s} players={players} online={room.online.includes(s.userId)} mood={moods[s.userId] ?? 'calm'} me={s.userId === meId} compact dark />)}
        </aside>

        <main className="boss-field min-h-0 min-w-0 p-1.5">
          <div className="boss-oval flex size-full items-start justify-center overflow-y-auto rounded-[2.5rem] bg-[radial-gradient(ellipse_at_center,#2c2360,#221a4b_70%)] p-2 shadow-[inset_0_0_0_2px_rgba(233,185,73,0.45),inset_0_0_40px_rgba(0,0,0,0.45)] [scrollbar-width:none]">{field}</div>
        </main>

        <nav className="boss-side flex flex-col justify-end gap-2 p-2">{side}</nav>

        <footer className="boss-hand-row min-w-0">
          <HandBar view={view} players={players} meId={meId} busy={move.isPending} act={(a) => act(a)} />
        </footer>
      </div>

      <AwayPanel room={room} view={view} meId={meId} />
      <FxBanner event={latest} view={view} players={players} />
      {settled && view.lastSettlement && <MoneyFly event={settled} payouts={view.lastSettlement.payouts} container={stage} />}
      {lastEndRoll && <EndRoll event={lastEndRoll} view={view} />}
      <InterruptOverlay view={view} players={players} canStop={!!myStop && view.interrupt?.actorId !== meId} stopping={move.isPending} onStop={() => myStop && act({ type: 'play_stop', cardId: myStop.id })} />

      {boardOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center bg-black/80 p-2" role="dialog" aria-label={t('boss.act.board')}>
          <Button variant="ghost" size="icon" className="mb-1 size-9 self-end rounded-full bg-white/15 text-white" aria-label="close" onClick={() => setBoardOpen(false)}><X className="size-5" /></Button>
          <div className="flex min-h-0 w-full flex-1 items-center justify-center"><BossBoard view={view} piles className="h-full" /></div>
        </div>
      )}
      <OfferSheet open={offerOpen} onOpenChange={setOfferOpen} view={view} players={players} sending={move.isPending} onSend={(allocation) => act({ type: 'set_allocation', allocation }, () => setOfferOpen(false))} />
      <AskSheet open={askOpen} onOpenChange={setAskOpen} current={myAsk} sending={move.isPending} onSend={(amount) => act({ type: 'set_ask', amount }, () => setAskOpen(false))} />
      <DiscardSheet key={view.discardPendingCount} view={view} busy={move.isPending} act={(a) => act(a)} />
      <ConfirmDialog open={failOpen} onOpenChange={setFailOpen} title={t('boss.act.fail')} description={t('boss.act.failConfirm')} confirmLabel={t('boss.act.fail')} destructive onConfirm={() => act({ type: 'fail_deal' }, () => setFailOpen(false))} />
    </div>
  )
}

function StatusLine({ text }: { text: string }) {
  return <p className="boss-status rounded-full bg-black/45 px-4 py-1.5 text-center text-base font-black text-white">{text}</p>
}

/** Current deal placard: value per dividend and the end-roll faces from #10. */
export function PlacardLine({ view, light }: { view: BossView; light?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className={cn('flex items-center gap-1.5 whitespace-nowrap text-xs font-bold', light ? 'text-[#fff4dc]' : 'text-white')}>
      <span className="rounded-lg border-2 border-[#5a3420] bg-[#fff4dc] px-2 py-0.5 text-[#3a2416] shadow-[0_2px_0_#5a3420]">
        #{view.currentDealNumber} · {t('boss.status.perDividend', { m: view.currentShareValue / 1_000_000 })}
      </span>
      {view.currentEndRollFaces.length > 0 && <span className="rounded-full bg-red-600/90 px-2 py-0.5">{t('boss.status.endFaces', { faces: view.currentEndRollFaces.join(' ') })}</span>}
      <span className="rounded-full bg-black/40 px-2 py-0.5">{t('boss.status.dealsLeft', { done: view.dealsDone, total: view.dealsTotal })}</span>
      <span className="rounded-full bg-black/40 px-2 py-0.5">{t('boss.status.deck', { count: view.deckCount })}</span>
    </div>
  )
}

function Results({ view, players }: { view: BossView; players: RoomPlayer[] }) {
  const { t } = useTranslation()
  const ranked = [...view.seats].sort((a, b) => (b.exactCash ?? 0) - (a.exactCash ?? 0))
  return (
    <div className="flex w-full max-w-md flex-col gap-2 rounded-3xl bg-[#fff4dc] p-4 text-[#3a2416] shadow-[0_4px_0_#5a3420]">
      <h2 className="flex items-center justify-center gap-2 text-2xl font-black"><Trophy className="size-6 text-amber-500" />{t('boss.over.title')}</h2>
      <ol className="flex flex-col gap-1.5">
        {ranked.map((s, i) => (
          <li key={s.userId} className={cn('boss-rank flex items-center gap-3 rounded-2xl bg-white/80 p-2', view.winnerIds.includes(s.userId) && 'ring-4 ring-amber-400')} style={{ animationDelay: `${i * 120}ms` }}>
            <span className="w-8 text-center text-lg font-black">{i + 1}</span>
            <Face team={seatTeam(view, s.userId)} mood={view.winnerIds.includes(s.userId) ? 'happy' : 'calm'} className="size-11" />
            <span className="min-w-0 flex-1 truncate font-bold">{nameOf(players, s.userId)}</span>
            <Money amount={s.exactCash ?? 0} className="text-xl text-amber-600" />
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Someone the game waits on is offline: the owner decides (wait / carry on / remove); others see that. */
function AwayPanel({ room, view, meId }: { room: BossRoomData; view: BossView; meId: string }) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState<string[]>([])
  const [kick, setKick] = useState<string | null>(null)
  const skip = useBossHost(room.code, 'bossSkip')
  const remove = useBossHost(room.code, 'bossKick')
  const away = view.phase === 'game_over' || view.phase === 'interrupt' ? [] : view.blockingIds.filter((id) => id !== meId && !room.online.includes(id) && room.players.some((p) => p.userId === id))
  const target = away.find((id) => !dismissed.includes(id))
  if (!target) return null
  const name = nameOf(room.players, target)
  const host = room.hostId === meId
  const onError = (e: Error) => showErrorToast(e instanceof ApiError && e.code === 'PLAYER_ONLINE' ? t('boss.errors.PLAYER_ONLINE') : t('common.saveError'))
  return (
    <div className="absolute inset-x-0 bottom-24 z-30 mx-auto flex w-[min(92%,26rem)] flex-col gap-2 rounded-3xl bg-card p-3 shadow-2xl">
      <p className="flex items-center gap-2 font-bold"><WifiOff className="size-4 text-red-500" aria-hidden="true" />{t('boss.away.title', { name })}</p>
      {host ? (
        <>
          <p className="text-sm text-muted-foreground">{t('boss.away.hostAsk')}</p>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" onClick={() => setDismissed((d) => [...d, target])}>{t('boss.away.wait')}</Button>
            <Button disabled={skip.isPending} onClick={() => skip.mutate(target, { onError })}>{t('boss.away.skip')}</Button>
            <Button variant="destructive" onClick={() => setKick(target)}>{t('boss.away.kick')}</Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t('boss.away.others')}</p>
      )}
      <ConfirmDialog open={kick !== null} onOpenChange={(v) => { if (!v) setKick(null) }} title={t('boss.away.kick')} description={t('boss.away.kickConfirm', { name })} confirmLabel={t('boss.away.kick')} destructive onConfirm={() => { if (kick) remove.mutate(kick, { onError }); setKick(null) }} />
    </div>
  )
}
