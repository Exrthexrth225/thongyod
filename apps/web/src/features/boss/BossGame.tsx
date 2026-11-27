import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { BookOpen, DoorOpen, LayoutGrid, LogOut, Menu, RotateCcw, RotateCw, Shuffle, WifiOff, XCircle } from 'lucide-react'
import { ApiError } from '@/api/client'
import { roomKeys, useBackToLobby, useBossAction, useBossDraftRandom, useBossHost, useCloseRoom, useLeaveRoom, useRestartOpen, useRestartVote } from '@/api/rooms'
import type { BossActionPayload, BossRoomData, BossView, Room, RoomPlayer } from '@/api/types'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { RoomLiveBar } from '@/features/rooms/RoomLiveBar'
import { showErrorToast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { BossBoard } from './BossBoard'
import { ClosingRing, Die, EndRoll, FxBanner, InterruptOverlay, MoneyFly } from './BossFx'
import { BossEditor, DealBoard, OfferCard } from './DealPanel'
import { instruction } from './dealInfo'
import { DiscardSheet, HandBar } from './Hand'
import { Word } from './Word'
import { faceArt, fxArt, M, nameOf, shortName, TEAM_COLOR, tutorialSeen } from './meta'
import { BossTutorial } from './Tutorial'
import { Money, PlayerName, PriceTag, SeatColors, SeatFaces, SpaceTile, TeamBadge } from './parts'
import { useBossTimeline } from './useBossTimeline'
import './boss.css'

const KNOWN_ERRORS = ['NOT_YOUR_TURN', 'NOT_BOSS', 'INVALID_PHASE', 'NO_OFFER', 'ALREADY_STOPPED', 'RECRUIT_UNOWNED_FIRST', 'PLAYER_ONLINE',
  'STALE_OFFER', 'INTERRUPT_OVER', 'TEAM_ALREADY_IN', 'TEAM_NOT_IN_SLOT', 'EMPTY_SLOTS', 'NOT_CONFIRMED', 'NOT_IN_OFFER', 'INVESTOR_TAKEN',
  'TARGET_NOT_ACTIVE', 'OWN_TEAM', 'VOTE_OPEN', 'VOTE_COOLDOWN', 'NOT_A_VOTER', 'NO_VOTE'] as const
type KnownError = (typeof KNOWN_ERRORS)[number]

/** Confirm inside the game screen (a sheet, so it always sits above the table). */
function SheetConfirm({ open, title, text, label, busy, onCancel, onConfirm }: { open: boolean; title: string; text: string; label: string; busy?: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useTranslation()
  return (
    <BottomSheet open={open} onOpenChange={(v) => { if (!v) onCancel() }} title={title}>
      <div className="flex flex-col gap-3 px-4 pb-6">
        <p className="text-sm text-muted-foreground">{text}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={onCancel}>{t('common.cancel')}</Button>
          <Button variant="destructive" size="lg" disabled={busy} onClick={onConfirm}>{label}</Button>
        </div>
      </div>
    </BottomSheet>
  )
}

/**
 * One phone in a game of I'm the Boss!, played sideways.
 * With a shared screen (iPad) connected the phone is a controller: my hand, my wallet, my colours, and in the middle
 * only the decision in front of me (boss: build the deal; offered: accept or decline; interrupted: Stop).
 * Without one (or when it drops) every phone shows the table: the active space, the deal and who it waits on,
 * with "full board" one tap away. Other players' hands and wallets stay private either way.
 */
export function BossGame({ room, meId }: { room: BossRoomData; meId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const view = room.boss!
  const stage = useRef<HTMLDivElement>(null)
  const move = useBossAction(room.code)
  const lobby = useBackToLobby(room.code)
  const leave = useLeaveRoom(room.code)
  const close = useCloseRoom(room.code)
  const draftRandom = useBossDraftRandom(room.code)
  const restartOpen = useRestartOpen(room.code)
  const [boardOpen, setBoardOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirm, setConfirm] = useState<'leave' | 'close' | 'fail' | 'restart' | null>(null)
  const [tutorial, setTutorial] = useState(() => !tutorialSeen())
  const { latest, moods, rolling } = useBossTimeline(view)

  const act = (action: BossActionPayload, after?: () => void) =>
    move.mutate(action, {
      onSuccess: after,
      onError: (e) => {
        const code = e instanceof ApiError ? e.code : undefined
        if (code === 'STALE_OFFER') {
          // say what the offer is now, from the newest snapshot
          const now = (queryClient.getQueryData<Room>(roomKeys.room(room.code)) as BossRoomData | undefined)?.boss?.deal
          const mine = now?.terms[meId] !== undefined ? now.allocation[meId] ?? 0 : null
          showErrorToast(mine === null ? t('boss.table.staleGone') : t('boss.table.stale', { amount: t('boss.money', { m: mine / M }) }))
          return
        }
        showErrorToast(code && (KNOWN_ERRORS as readonly string[]).includes(code) ? t(`boss.errors.${code as KnownError}`) : t('common.saveError'))
      },
    })
  const toRooms = () => void navigate('/games/rooms', { replace: true })

  const players = room.players
  const tableMode = !room.boardOnline
  const deal = view.deal
  const isBoss = deal?.bossId === meId
  const myTurn = !deal && view.turnPlayerId === meId
  const myStop = view.myHand.find((c) => c.kind === 'stop')
  const lastRoll = view.events.findLast((e) => e.kind === 'dice_rolled')
  const settled = latest?.kind === 'deal_settled' && view.lastSettlement?.dealNumber === latest.dealNumber ? latest : null
  const space = view.markerSpace !== null ? view.spaces[view.markerSpace] : null
  const me = view.seats.find((s) => s.userId === meId)
  const others = view.seats.filter((s) => s.userId !== meId)
  const mustConfirm = !!deal && deal.terms[meId] !== undefined && view.phase !== 'interrupt'
  const say = instruction(view, players, meId, t, rolling)

  // ── the middle: only what this player has to decide now, else (table mode) the public table ──
  let field: React.ReactNode
  if (view.phase === 'game_over') field = <Results view={view} players={players} />
  else if (view.phase === 'draft') field = <DraftCard view={view} players={players} meId={meId} busy={move.isPending} act={act} host={room.hostId === meId} onRandom={() => draftRandom.mutate(undefined, { onError: () => showErrorToast(t('common.saveError')) })} />
  else if (deal && isBoss) field = <BossEditor view={view} players={players} meId={meId} busy={move.isPending} act={(a) => act(a)} />
  else if (deal && mustConfirm) {
    field = (
      <div className="flex w-full flex-col items-center gap-2">
        <OfferCard view={view} players={players} meId={meId} busy={move.isPending} act={(a) => act(a)} />
        {tableMode && <DealBoard view={view} players={players} meId={meId} />}
      </div>
    )
  } else if (deal && tableMode) field = <DealBoard view={view} players={players} meId={meId} />
  else if (tableMode && space) {
    field = (
      <div className="flex items-center gap-4">
        <SpaceTile space={space} big active className="h-32 w-44" />
        <div className="flex flex-col items-center gap-2">
          {lastRoll && view.phase === 'rolled_choice' ? <Die key={lastRoll.id} value={lastRoll.roll ?? 1} size={52} rolling={rolling} /> : <Die value={lastRoll?.roll ?? 5} size={52} rolling={false} className="opacity-40" />}
          <PriceTag amount={space.dividends * view.currentShareValue} share={view.currentShareValue} dividends={space.dividends} size={20} />
        </div>
      </div>
    )
  } else field = <IdleCard view={view} players={players} meId={meId} />

  // ── big buttons on the right ──
  const big = 'h-12 w-full rounded-2xl text-base font-black shadow-[0_4px_0_rgba(0,0,0,0.3)] active:translate-y-0.5'
  /** A big button with one short line saying what it does. */
  const label = (text: string, hint: string) => (
    <span className="flex flex-col items-center leading-tight"><span>{text}</span><span className="text-[10px] font-semibold opacity-75">{hint}</span></span>
  )
  const ghost = 'bg-white/10 text-white hover:bg-white/20'
  const dealValue = t('boss.money', { m: ((space?.dividends ?? 0) * view.currentShareValue) / M })
  let side: React.ReactNode = null
  if (myTurn && view.phase === 'turn_choice') {
    side = (
      <>
        <Button className={cn(big, 'h-14')} disabled={move.isPending || space?.closedByDeal !== null} onClick={() => act({ type: 'open_deal' })}>{label(t('boss.act.dealHere'), dealValue)}</Button>
        <Button variant="secondary" className={cn(big, 'h-14', ghost)} disabled={move.isPending} onClick={() => act({ type: 'roll_die' })}>{label(t('boss.act.roll'), t('boss.act.rollShort'))}</Button>
      </>
    )
  } else if (myTurn && view.phase === 'rolled_choice' && !rolling) {
    // offered only once the die and the marker have finished moving
    side = (
      <>
        <Button className={cn(big, 'h-14')} disabled={move.isPending} onClick={() => act({ type: 'open_deal' })}>{label(t('boss.act.dealHere'), dealValue)}</Button>
        <Button variant="secondary" className={cn(big, 'h-14', ghost)} disabled={move.isPending} onClick={() => act({ type: 'draw_cards' })}>{label(t('boss.act.draw'), t('boss.act.drawShort'))}</Button>
      </>
    )
  } else if (deal && isBoss && view.phase !== 'interrupt') {
    side = (
      <>
        {view.phase === 'closing'
          ? <Button variant="destructive" className={cn(big, 'h-14')} disabled={move.isPending} onClick={() => act({ type: 'hold' })}>{label(t('boss.act.wait'), t('boss.act.waitHint'))}</Button>
          : <Button className={cn(big, 'h-14', deal.canClose && 'boss-glow')} disabled={move.isPending || !deal.canClose} onClick={() => act({ type: 'start_closing' })}>{t('boss.act.close')}</Button>}
        <button type="button" className="text-xs font-bold text-white/60 underline-offset-2 hover:underline" onClick={() => setConfirm('fail')}>{t('boss.act.fail')}</button>
      </>
    )
  } else if (deal && view.phase === 'closing') {
    side = <Button variant="destructive" className={cn(big, 'h-14')} disabled={move.isPending} onClick={() => act({ type: 'hold' })}>{label(t('boss.act.wait'), t('boss.act.waitHint'))}</Button>
  } else if (view.phase === 'game_over' && room.hostId === meId) {
    side = <Button className={big} disabled={lobby.isPending} onClick={() => lobby.mutate()}>{t('boss.act.backToRoom')}</Button>
  }
  if (view.phase === 'closing' && deal) side = <>{<ClosingRing deadline={deal.closingDeadlineAt} className="text-sm" />}{side}</>

  // ── a player row on the left (table mode): public things only ──
  const row = (s: (typeof view.seats)[number]) => {
    const id = s.userId
    const isBossRow = deal?.bossId === id
    const turn = !deal && view.turnPlayerId === id && view.phase !== 'game_over'
    const status = deal
      ? isBossRow ? t('boss.status.boss') : deal.acceptedIds.includes(id) ? t('boss.deal.accepted') : deal.declinedIds.includes(id) ? t('boss.deal.declined') : deal.requiredIds.includes(id) ? t('boss.deal.waiting') : ''
      : ''
    return (
      <div key={id} data-seat={id} className={cn('flex w-full items-center gap-1.5 rounded-xl bg-white/[0.06] p-1 pr-1.5 ring-1 ring-white/10 transition', (turn || isBossRow) && 'ring-2 ring-[#ffc21a]', !room.online.includes(id) && 'opacity-50')}>
        <SeatFaces view={view} userId={id} mood={moods[id] ?? 'calm'} round className="size-9" />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="flex min-w-0 items-center gap-1 text-[13px] font-bold text-white"><PlayerName name={nameOf(players, id)} max={7} />{!room.online.includes(id) && <WifiOff className="size-3 shrink-0" />}</span>
          <span className="flex items-center gap-1 text-[10px] text-white/60">
            <SeatColors view={view} userId={id} size="size-3.5" />
            <span className="ml-auto truncate">{status || t('boss.cards.hand', { count: s.handCount })}</span>
          </span>
        </span>
      </div>
    )
  }

  const myCard = me && (
    <div data-seat={meId} className={cn('flex flex-col gap-1 rounded-2xl bg-[#ffc21a]/15 p-1.5 ring-2', view.turnPlayerId === meId && !deal ? 'ring-[#ffc21a]' : 'ring-[#ffc21a]/40', !tableMode && 'flex-1 justify-center')}>
      <div className="flex items-center gap-2">
        <SeatFaces view={view} userId={meId} mood={moods[meId] ?? 'calm'} round className={tableMode ? 'size-11' : 'size-16'} />
        <span className="min-w-0 leading-tight">
          <PlayerName name={nameOf(players, meId)} max={8} className="block text-xs font-bold text-white/80" />
          <span className="block text-[10px] font-bold text-white/60">{t('boss.table.wallet')}</span>
          <Money amount={me.exactCash ?? 0} className={cn('text-[#ffc21a]', tableMode ? 'text-xl' : 'text-2xl')} />
        </span>
      </div>
      <span className="flex flex-wrap items-center gap-1 text-[10px] font-bold text-white/70">
        <span>{t('boss.table.myColors')}:</span>
        {me.investors.length ? me.investors.map((team) => <span key={team} className="flex items-center gap-0.5 rounded-full bg-black/25 py-0.5 pl-0.5 pr-1.5"><TeamBadge team={team} className="size-4" />{t(`boss.teamShort.${team}`)}</span>) : <span>{t('boss.table.noColors')}</span>}
      </span>
    </div>
  )

  return (
    <div ref={stage} className="boss-stage fixed inset-0 z-40 overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,#2c2360,#17142b_65%,#120d2b)] text-white">
      <div className="boss-game relative size-full pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
        <header className="boss-top relative z-40 flex items-center gap-2 px-2 pt-1.5">
          <button type="button" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10" aria-label={t('boss.menu.title')} onClick={() => setMenuOpen(true)}><Menu className="size-4" /></button>
          <span className="min-w-0 flex-1" />
          {/* one line: what is going on / what to do now */}
          <span key={say} className="boss-plaque boss-banner flex min-w-0 items-center gap-2 px-4 py-1"><Word text={say} className="truncate text-[16px]" /></span>
          <span className="shrink-0 rounded-full bg-black/30 px-2 py-1 text-[10px] font-bold text-[#ffd77a]">{t('boss.status.dealOf', { n: Math.min(view.dealsDone + 1, view.dealsTotal), total: view.dealsTotal })}{view.currentEndRollFaces.length > 0 && view.phase !== 'game_over' ? ` · 🎲${view.currentEndRollFaces.join('')}` : ''}</span>
          <span className="min-w-0 flex-1" />
          {tableMode
            ? <button type="button" className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 text-xs font-bold" onClick={() => setBoardOpen(true)}><LayoutGrid className="size-4" />{t('boss.table.fullBoard')}</button>
            : <span className="shrink-0 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[10px] font-bold text-emerald-200">{t('boss.table.lookUp')}</span>}
        </header>
        <div className="boss-live px-2"><RoomLiveBar room={room} meId={meId} /></div>

        <aside className="boss-seats flex min-h-0 flex-col gap-1 overflow-y-auto p-1.5 [scrollbar-width:none]">
          {tableMode && others.map(row)}
          <div className={cn(tableMode ? 'mt-auto' : 'flex flex-1 flex-col')}>{myCard}</div>
        </aside>

        <main className="boss-field relative min-h-0 min-w-0 px-1">
          <div className="boss-oval flex size-full flex-col items-center overflow-y-auto rounded-[2.2rem] bg-[radial-gradient(ellipse_at_center,#2c2360,#221a4b_75%)] p-2 shadow-[inset_0_0_0_2px_rgba(233,185,73,0.5),inset_0_0_40px_rgba(0,0,0,0.45),0_10px_40px_rgba(0,0,0,0.4)] [scrollbar-width:none]">
            <div className="my-auto flex w-full justify-center">{field}</div>
          </div>
        </main>

        <nav className="boss-side flex min-h-0 flex-col justify-end gap-1.5 p-1.5">{side}</nav>

        <footer className="boss-hand-row min-w-0">
          <HandBar view={view} players={players} meId={meId} busy={move.isPending} act={(a) => act(a)} />
        </footer>
      </div>

      {/* Phones are played sideways; leaving stays one tap away before turning. */}
      <div className="boss-rotate fixed inset-0 z-[60] hidden flex-col items-center justify-center gap-4 bg-[#17142b] p-8 text-center text-white">
        <RotateCw className="boss-rotate-icon size-16 text-[#ffc21a]" aria-hidden="true" />
        <p className="text-xl font-black">{t('boss.rotate.title')}</p>
        <p className="text-sm text-white/70">{t('boss.rotate.hint')}</p>
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="secondary" size="lg" onClick={toRooms}><DoorOpen data-icon="inline-start" />{t('boss.menu.away')}</Button>
          <Button variant="destructive" size="lg" onClick={() => setConfirm('leave')}><LogOut data-icon="inline-start" />{t('boss.menu.leave')}</Button>
        </div>
      </div>

      {view.phase === 'pick_start' && (tableMode || view.markerChooserId === meId) && (
        <div className="fixed inset-0 z-30 flex items-center justify-center gap-3 bg-black/75 p-2 pt-12">
          <BossBoard view={view} onPick={view.markerChooserId === meId ? (spaceIndex) => act({ type: 'pick_start', spaceIndex }) : undefined} className="h-full" />
        </div>
      )}
      {/* notices stack instead of covering each other */}
      <div className="pointer-events-none absolute inset-x-0 top-12 z-[45] mx-auto flex w-[min(92%,26rem)] flex-col gap-2 [&>*]:pointer-events-auto">
        <RestartPanel room={room} meId={meId} />
        <AwayPanel room={room} view={view} meId={meId} />
      </div>
      {tutorial && <BossTutorial onClose={() => setTutorial(false)} />}
      <FxBanner event={latest} view={view} players={players} />
      {settled && view.lastSettlement && <MoneyFly event={settled} payouts={view.lastSettlement.payouts} container={stage} />}
      {latest?.kind === 'end_roll' && <EndRoll event={latest} view={view} />}
      <InterruptOverlay view={view} players={players} canStop={!!myStop && view.interrupt?.actorId !== meId} stopping={move.isPending} onStop={() => myStop && view.interrupt && act({ type: 'play_stop', cardId: myStop.id, interruptId: view.interrupt.id })} />

      {boardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center gap-2 bg-black/85 p-2" role="dialog" aria-label={t('boss.table.fullBoard')}>
          <BossBoard view={view} piles settledSpace={settled?.spaceIndex ?? null} className="h-full" />
          <Button variant="ghost" size="icon" className="absolute right-2 top-2 size-9 rounded-full bg-white/15 text-white" aria-label={t('common.cancel')} onClick={() => setBoardOpen(false)}><XCircle className="size-5" /></Button>
        </div>
      )}
      <DiscardSheet key={view.discardPendingCount} view={view} busy={move.isPending} act={(a) => act(a)} />
      <BottomSheet open={menuOpen} onOpenChange={setMenuOpen} title={t('boss.menu.title')}>
        <div className="flex flex-col gap-2 px-4 pb-6">
          <Button variant="secondary" size="lg" className="justify-start" onClick={() => { setMenuOpen(false); setTutorial(true) }}><BookOpen data-icon="inline-start" />{t('boss.act.howTo')}</Button>
          <Button variant="secondary" size="lg" className="justify-start" onClick={toRooms}><DoorOpen data-icon="inline-start" />{t('boss.menu.away')}</Button>
          {!room.restart && view.phase !== 'game_over' && <Button variant="secondary" size="lg" className="justify-start" onClick={() => { setMenuOpen(false); setConfirm('restart') }}><RotateCcw data-icon="inline-start" />{t('boss.restart.open')}</Button>}
          <Button variant="secondary" size="lg" className="justify-start" onClick={() => { setMenuOpen(false); setConfirm('leave') }}><LogOut data-icon="inline-start" />{t('boss.menu.leave')}</Button>
          {room.hostId === meId && <Button variant="secondary" size="lg" className="justify-start text-destructive" onClick={() => { setMenuOpen(false); setConfirm('close') }}><XCircle data-icon="inline-start" />{t('rooms.closeRoom')}</Button>}
        </div>
      </BottomSheet>
      <SheetConfirm
        open={confirm !== null}
        title={confirm === 'close' ? t('rooms.closeRoom') : confirm === 'fail' ? t('boss.act.fail') : confirm === 'restart' ? t('boss.restart.title') : t('boss.menu.leave')}
        text={confirm === 'close' ? t('rooms.closeRoomConfirm') : confirm === 'fail' ? t('boss.act.failConfirm') : confirm === 'restart' ? t('boss.restart.warn') : t('boss.menu.leaveConfirm')}
        label={confirm === 'close' ? t('rooms.closeRoom') : confirm === 'fail' ? t('boss.act.fail') : confirm === 'restart' ? t('boss.restart.confirm') : t('boss.menu.leave')}
        busy={leave.isPending || close.isPending || move.isPending || restartOpen.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const onError = (e: Error) => showErrorToast(e instanceof ApiError && (KNOWN_ERRORS as readonly string[]).includes(e.code ?? '') ? t(`boss.errors.${e.code as KnownError}`) : t('common.saveError'))
          if (confirm === 'fail') act({ type: 'fail_deal' }, () => setConfirm(null))
          else if (confirm === 'restart') restartOpen.mutate(undefined, { onSuccess: () => setConfirm(null), onError })
          else (confirm === 'close' ? close : leave).mutate(undefined, { onSuccess: toRooms, onError })
        }}
      />
    </div>
  )
}

/** Controller view while nothing is asked of me: look up at the shared screen; the last deal's result for me. */
function IdleCard({ view, players, meId }: { view: BossView; players: RoomPlayer[]; meId: string }) {
  const { t } = useTranslation()
  const last = view.lastSettlement
  const mine = last?.payouts[meId] ?? 0
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <img src={fxArt('pawn')} alt="" className="size-14 opacity-90" />
      <p className="text-sm font-bold text-white/80">{t('boss.table.lookUp')}</p>
      {view.deal && <p className="text-xs text-white/60">{t('boss.table.shareOf', { n: view.deal.dealNumber, boss: shortName(nameOf(players, view.deal.bossId), 8) })}</p>}
      {last && (
        <p className="rounded-full bg-black/30 px-3 py-1 text-xs font-bold text-[#ffd77a]">
          {mine > 0 ? t('boss.table.lastDeal', { n: last.dealNumber, amount: t('boss.money', { m: mine / M }) }) : t('boss.table.lastDealNone', { n: last.dealNumber })}
        </p>
      )}
    </div>
  )
}

/** Snake draft: whose pick it is, the investors still free, and (host) "random the rest". */
function DraftCard({ view, players, meId, busy, act, host, onRandom }: { view: BossView; players: RoomPlayer[]; meId: string; busy: boolean; act: (a: BossActionPayload) => void; host: boolean; onRandom: () => void }) {
  const { t } = useTranslation()
  const draft = view.draft
  if (!draft) return null
  const mine = draft.actorId === meId
  return (
    <div className="flex w-full max-w-md flex-col gap-2 rounded-2xl bg-[#f6efdc] p-2.5 text-[#241b4b]">
      <p className="flex items-center justify-between text-xs font-black"><span>{t('boss.table.draftTitle')}</span><span className="opacity-60">{draft.index + 1}/{draft.order.length}</span></p>
      <div className="grid grid-cols-3 gap-1.5">
        {view.availableInvestors.map((team) => (
          <button key={team} type="button" disabled={!mine || busy} onClick={() => act({ type: 'draft_pick', team })}
            className={cn('flex flex-col items-center gap-0.5 rounded-xl border-2 bg-white p-1 transition active:scale-95', mine ? 'boss-card-ready' : 'opacity-70')} style={{ borderColor: TEAM_COLOR[team] }}>
            <img src={faceArt(team)} alt="" className="size-12 object-contain" />
            <span className="text-[11px] font-black">{t(`boss.teamShort.${team}`)}</span>
          </button>
        ))}
      </div>
      <p className="flex flex-wrap items-center gap-1 text-[10px] font-bold opacity-75">
        {t('boss.table.draftOrder')}:
        {draft.order.map((id, i) => <span key={i} className={cn('rounded px-1', i === draft.index ? 'bg-[#241b4b] text-white' : i < draft.index ? 'line-through opacity-50' : '')}>{shortName(nameOf(players, id), 5)}</span>)}
      </p>
      {host && <Button variant="secondary" size="sm" disabled={busy} onClick={onRandom}><Shuffle data-icon="inline-start" />{t('boss.table.draftRandom')}</Button>}
    </div>
  )
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

const AWARD_ART = { deals: 'medal-gold', biggest: 'medal-coin', bribesPaid: 'magnet', travels: 'plane', stops: 'stop' } as const

/** Final standings with shared places for ties (1, 1, 3) and the fun-fact awards. */
export function Results({ view, players }: { view: BossView; players: RoomPlayer[] }) {
  const { t } = useTranslation()
  const ranked = [...view.seats].sort((a, b) => (b.exactCash ?? 0) - (a.exactCash ?? 0))
  const place = (i: number) => 1 + ranked.findIndex((s) => (s.exactCash ?? 0) === (ranked[i].exactCash ?? 0))
  const winners = view.winnerIds.map((id) => shortName(nameOf(players, id), 8))
  const best = (key: 'deals' | 'biggest' | 'bribesPaid' | 'travels' | 'stops') => {
    const top = Object.entries(view.stats ?? {}).filter(([id]) => view.seats.some((x) => x.userId === id)).sort(([, a], [, b]) => b[key] - a[key])[0]
    return top && top[1][key] > 0 ? { id: top[0], n: top[1][key] } : null
  }
  const money = (n: number) => t('boss.money', { m: n / M })
  const awards = ([
    ['deals', t('boss.over.deals'), (n: number) => `${n}`],
    ['biggest', t('boss.over.biggest'), money],
    ['bribesPaid', t('boss.over.bribes'), money],
    ['travels', t('boss.over.travels'), (n: number) => `${n}`],
    ['stops', t('boss.over.stops'), (n: number) => `${n}`],
  ] as const).flatMap(([key, title, fmt]) => { const b = best(key); return b ? [{ key, title, id: b.id, value: fmt(b.n) }] : [] })
  const top = ranked[0]?.exactCash ?? 0
  return (
    <div className="flex w-full max-w-md flex-col gap-2 rounded-3xl bg-[#fff4dc] p-4 text-[#3a2416] shadow-[0_4px_0_#5a3420]">
      <h2 className="flex items-center justify-center gap-2"><img src={fxArt('trophy')} alt="" className="size-10" /><Word text={t('boss.over.title')} className="text-3xl" /></h2>
      {winners.length > 1 && <p className="text-center text-sm font-black text-amber-700">{t('boss.over.jointWin', { names: winners.join(' & '), amount: money(top) })}</p>}
      <ol className="flex flex-col gap-1.5">
        {ranked.map((s, i) => (
          <li key={s.userId} className={cn('boss-rank flex items-center gap-3 rounded-2xl bg-white/80 p-2', view.winnerIds.includes(s.userId) && 'ring-4 ring-amber-400')} style={{ animationDelay: `${i * 120}ms` }}>
            <span className="w-8 text-center text-lg font-black">{place(i)}</span>
            <SeatFaces view={view} userId={s.userId} mood={view.winnerIds.includes(s.userId) ? 'happy' : 'calm'} className="size-11" />
            <PlayerName name={nameOf(players, s.userId)} max={10} className="min-w-0 flex-1 font-bold" />
            <Money amount={s.exactCash ?? 0} className="text-xl text-amber-600" />
          </li>
        ))}
      </ol>
      {awards.length > 0 && (
        <ul className="mt-1 grid grid-cols-2 gap-1.5">
          {awards.map((w, i) => (
            <li key={w.key} className="boss-rank flex items-center gap-2 rounded-xl bg-[#241b4b] p-1.5 text-white" style={{ animationDelay: `${(ranked.length + i) * 120}ms` }}>
              <span className="relative shrink-0"><SeatFaces view={view} userId={w.id} round className="size-9" /><img src={fxArt(AWARD_ART[w.key])} alt="" className="boss-how absolute -bottom-1 -right-2 size-6 drop-shadow" style={{ animationDelay: `${(ranked.length + i) * 120 + 300}ms` }} /></span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[10px] font-bold text-[#ffd77a]">{w.title}</span>
                <span className="block truncate text-xs font-bold">{shortName(nameOf(players, w.id), 8)} · {w.value}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A restart vote is open: frozen voters, count, and my yes / no. */
function RestartPanel({ room, meId }: { room: BossRoomData; meId: string }) {
  const { t } = useTranslation()
  const vote = useRestartVote(room.code)
  const r = room.restart
  if (!r) return null
  const voter = r.voters.includes(meId)
  const mine = r.yes.includes(meId) ? 'yes' : r.no.includes(meId) ? 'no' : null
  const onError = (e: Error) => showErrorToast(e instanceof ApiError && e.code ? t(`boss.errors.${e.code as KnownError}`, { defaultValue: t('common.saveError') }) : t('common.saveError'))
  return (
    <div className="flex flex-col gap-2 rounded-3xl bg-card p-3 text-foreground shadow-2xl">
      <p className="flex items-center gap-2 font-bold"><RotateCcw className="size-4 text-amber-500" aria-hidden="true" />{t('boss.restart.by', { name: shortName(nameOf(room.players, r.openedBy), 8) })}</p>
      <p className="text-sm font-bold text-muted-foreground">{t('boss.restart.count', { yes: r.yes.length, needed: r.needed })} · {r.voters.map((id) => `${shortName(nameOf(room.players, id), 6)}${r.yes.includes(id) ? '✓' : r.no.includes(id) ? '✗' : ' ?'}`).join(' · ')}</p>
      {!voter ? <p className="text-sm text-muted-foreground">{t('boss.restart.notVoter')}</p> : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant={mine === 'no' ? 'default' : 'secondary'} disabled={vote.isPending} onClick={() => vote.mutate(false, { onError })}>{t('boss.restart.no')}</Button>
          <Button variant={mine === 'yes' ? 'destructive' : 'secondary'} disabled={vote.isPending} onClick={() => vote.mutate(true, { onError })}>{t('boss.restart.yes')}</Button>
        </div>
      )}
    </div>
  )
}

/** Someone the game waits on is offline: anyone seated may carry on without them; the owner may also remove them. */
function AwayPanel({ room, view, meId }: { room: BossRoomData; view: BossView; meId: string }) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState<string[]>([])
  const [kick, setKick] = useState<string | null>(null)
  const skip = useBossHost(room.code, 'bossSkip')
  const remove = useBossHost(room.code, 'bossKick')
  const away = view.phase === 'game_over' ? [] : room.players.map((p) => p.userId).filter((id) => id !== meId && !room.online.includes(id))
  // Someone holding the game up comes first.
  const target = [...away.filter((id) => view.blockingIds.includes(id)), ...away].find((id) => !dismissed.includes(id))
  const blocking = !!target && view.blockingIds.includes(target) && view.phase !== 'interrupt'
  if (!target) return null
  const name = shortName(nameOf(room.players, target), 8)
  const host = room.hostId === meId
  const onError = (e: Error) => showErrorToast(e instanceof ApiError && e.code === 'PLAYER_ONLINE' ? t('boss.errors.PLAYER_ONLINE') : t('common.saveError'))
  return (
    <div className="flex flex-col gap-2 rounded-3xl bg-card p-3 text-foreground shadow-2xl">
      <p className="flex items-center gap-2 font-bold"><WifiOff className="size-4 text-red-500" aria-hidden="true" />{t('boss.away.title', { name })}</p>
      {host && kick ? (
        <>
          <p className="text-sm text-muted-foreground">{t('boss.away.kickConfirm', { name })}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setKick(null)}>{t('common.cancel')}</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(kick, { onError, onSettled: () => setKick(null) })}>{t('boss.away.kick')}</Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{blocking ? t('boss.away.anyoneAsk') : t('boss.away.others')}</p>
          <div className={cn('grid gap-2', host ? 'grid-cols-3' : 'grid-cols-2')}>
            <Button variant="secondary" onClick={() => setDismissed((d) => [...d, target])}>{t('boss.away.wait')}</Button>
            <Button disabled={skip.isPending || !blocking} onClick={() => skip.mutate(target, { onError })}>{t('boss.away.skip')}</Button>
            {host && <Button variant="destructive" onClick={() => setKick(target)}>{t('boss.away.kick')}</Button>}
          </div>
        </>
      )}
    </div>
  )
}
