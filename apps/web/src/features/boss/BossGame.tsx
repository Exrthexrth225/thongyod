import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { BookOpen, DoorOpen, LayoutGrid, LogOut, Maximize, Menu, MonitorUp, RotateCcw, RotateCw, Shuffle, Smartphone, WifiOff, XCircle } from 'lucide-react'
import { ApiError } from '@/api/client'
import { roomKeys, useBackToLobby, useBossAction, useBossDraftRandom, useBossHost, useCloseRoom, useLeaveRoom, useMakeBoard, useRestartOpen, useRestartVote } from '@/api/rooms'
import type { BossActionPayload, BossRoomData, BossView, Room, RoomPlayer } from '@/api/types'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { QrCodeCard } from '@/components/friends/QrCodeCard'
import { RoomLiveBar } from '@/features/rooms/RoomLiveBar'
import { boardUrl } from '@/features/rooms/url'
import { showErrorToast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { BossBoard } from './BossBoard'
import { ClosingRing, Die, EndRoll, FxBanner, InterruptOverlay, MoneyFly } from './BossFx'
import { BossEditor, DealBoard, OfferCard } from './DealPanel'
import { instruction } from './dealInfo'
import { DiscardSheet, HandBar } from './Hand'
import { Word } from './Word'
import { faceArt, fxArt, M, nameOf, shortName, TEAM_COLOR, tutorialSeen } from './meta'
import { BossTutorial } from './Tutorial'
import { Money, PlayerName, PriceTag, SeatColors, SeatFaces } from './parts'
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
 * A full-height wallet panel and table/actions panel frame a straight private hand.
 * Decisions use the centre above a shorter hand. Own-screen mode also shows the
 * public table and other seats; Board Screen mode leaves that view on the shared device.
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
  const [detail, setDetail] = useState<string | null>(null)
  const [boardOpen, setBoardOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [addBoard, setAddBoard] = useState(false)
  const [installHelp, setInstallHelp] = useState(false)
  const [confirm, setConfirm] = useState<'leave' | 'close' | 'fail' | 'restart' | null>(null)
  const [tutorial, setTutorial] = useState(() => !tutorialSeen())
  const [ownScreen, setOwnScreen] = useState(() => readMode(room.code))
  const { latest, moods, rolling, startedAt } = useBossTimeline(view)

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
  const switchMode = (own: boolean) => { setOwnScreen(own); writeMode(room.code, own) }
  const fullscreen = async () => {
    // Android and desktop browsers: real fullscreen, locked sideways. iPhone Safari cannot: explain Add to Home Screen.
    if (document.fullscreenElement) { await document.exitFullscreen().catch(() => {}); return }
    const el = document.documentElement
    if (document.fullscreenEnabled && typeof el.requestFullscreen === 'function') {
      try {
        await el.requestFullscreen({ navigationUI: 'hide' })
        await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {})
        return
      } catch { /* refused: show the help */ }
    }
    setInstallHelp(true)
  }

  const players = room.players
  // The table is on this phone when there is no shared screen, or when this player chose to play on their own screen.
  const tableMode = !room.boardOnline || ownScreen
  const deal = view.deal
  const isBoss = deal?.bossId === meId
  const myTurn = !deal && view.turnPlayerId === meId
  const myStop = view.myHand.find((c) => c.kind === 'stop')
  const lastRoll = view.events.findLast((e) => e.kind === 'dice_rolled')
  const activeRoll = latest?.kind === 'dice_rolled' ? latest : null
  const rollProps = { roll: activeRoll, startedAt, hold: activeRoll?.fromSpace ?? (rolling ? lastRoll?.fromSpace : null) }
  const settled = latest?.kind === 'deal_settled' && view.lastSettlement?.dealNumber === latest.dealNumber ? latest : null
  const space = view.markerSpace !== null ? view.spaces[view.markerSpace] : null
  const me = view.seats.find((s) => s.userId === meId)
  const mustConfirm = !!deal && deal.terms[meId] !== undefined && view.phase !== 'interrupt'
  const say = instruction(view, players, meId, t, rolling)

  // ── the middle: what this player has to decide now; else (own screen) the table; else nothing ──
  let field: React.ReactNode = null
  if (view.phase === 'game_over') field = <Results view={view} players={players} />
  else if (view.phase === 'draft') field = <DraftCard view={view} players={players} meId={meId} busy={move.isPending} act={act} host={room.hostId === meId} onRandom={() => draftRandom.mutate(undefined, { onError: () => showErrorToast(t('common.saveError')) })} />
  else if (deal && isBoss) field = <BossEditor view={view} players={players} meId={meId} busy={move.isPending} act={(a) => act(a)} />
  else if (deal && mustConfirm) field = <OfferCard view={view} players={players} meId={meId} busy={move.isPending} act={(a) => act(a)} />
  else if (deal && tableMode) field = <DealBoard view={view} players={players} meId={meId} compact />
  const focus = field ? 'field' : 'hand'

  // ── big buttons on the right, only when it is up to me ──
  const big = 'boss-action h-12 w-full rounded-2xl text-base font-black shadow-[0_4px_0_rgba(0,0,0,0.3)] active:translate-y-0.5'
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
        <button type="button" className="boss-fail min-h-11 rounded-xl bg-white/10 text-xs font-bold text-white/85 underline-offset-2 hover:underline" onClick={() => setConfirm('fail')}>{t('boss.act.fail')}</button>
      </>
    )
  } else if (deal && view.phase === 'closing') {
    side = <Button variant="destructive" className={cn(big, 'h-14')} disabled={move.isPending} onClick={() => act({ type: 'hold' })}>{label(t('boss.act.wait'), t('boss.act.waitHint'))}</Button>
  } else if (view.phase === 'game_over' && room.hostId === meId) {
    side = <Button className={big} disabled={lobby.isPending} onClick={() => lobby.mutate()}>{t('boss.act.backToRoom')}</Button>
  }
  if (view.phase === 'closing' && deal) side = <><ClosingRing deadline={deal.closingDeadlineAt} className="text-sm" />{side}</>

  // My wallet and investor colours stay private to this phone.
  const myCard = me && (
    <div data-seat={meId} className="boss-me">
      <div className="boss-me-heading">
        <SeatFaces view={view} userId={meId} mood={moods[meId] ?? 'calm'} round className="boss-me-faces" />
        <div className="min-w-0">
          <PlayerName name={nameOf(players, meId)} className="block text-sm font-bold text-white/90" />
          <Money amount={me.exactCash ?? 0} className="boss-wallet text-[#ffc21a]" />
        </div>
      </div>
      <ul className="boss-owned">
        {me.investors.length
          ? me.investors.map((team) => (
            <li key={team} className="boss-owned-color">
              <img src={faceArt(team)} alt="" draggable={false} style={{ background: TEAM_COLOR[team] }} />
              <span>{t(`boss.teamShort.${team}`)}</span>
            </li>
          ))
          : <li className="text-xs text-white/70">{t('boss.table.noColors')}</li>}
      </ul>
    </div>
  )

  const actor = view.draft?.actorId ?? (view.phase === 'pick_start' ? view.markerChooserId : deal?.bossId ?? view.turnPlayerId)
  const selectedSeat = view.seats.find((s) => s.userId === detail)
  const turnOrder = (
    <div className="boss-order">
      {view.seats.map((s) => (
        <button key={s.userId} type="button" data-seat={s.userId} data-current={s.userId === actor}
          aria-label={nameOf(players, s.userId)} onClick={() => setDetail(s.userId)}>
          <SeatFaces view={view} userId={s.userId} round className="size-6" />
        </button>
      ))}
    </div>
  )
  const iconBtn = 'flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10'
  return (
    <div ref={stage} className="boss-stage fixed inset-0 z-40 overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,#2c2360,#17142b_65%,#120d2b)] text-white">
      <div data-focus={focus} data-own-screen={tableMode} data-players={view.seats.length} data-phase={view.phase} className="boss-game relative size-full pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
        <header className="boss-top relative z-40 flex items-center justify-between px-2">
          <button type="button" className={iconBtn} aria-label={t('boss.menu.title')} onClick={() => setMenuOpen(true)}><Menu className="size-5" /></button>
          {tableMode ? <><Money amount={me?.exactCash ?? 0} className="text-lg text-amber-300" />{turnOrder}</> : <div className="boss-instruction">
            <span key={say} className="boss-plaque boss-banner block px-3 py-1" title={say}>
              <span className="block truncate text-sm font-black text-[#ffe19a]">{say}</span>
            </span>
          </div>}
          <div className="flex shrink-0 items-center gap-1">
            {room.boardOnline && (
              <button type="button" className="flex h-11 items-center gap-1 rounded-full bg-white/10 px-2 text-[11px] font-bold"
                aria-label={t(ownScreen ? 'boss.mode.toBoard' : 'boss.mode.toOwn')} onClick={() => switchMode(!ownScreen)}>
                {ownScreen ? <MonitorUp className="size-4" /> : <Smartphone className="size-4" />}
                {t(ownScreen ? 'boss.phone.toBoard' : 'boss.phone.toOwn')}
              </button>
            )}
            <button type="button" className={iconBtn} aria-label={t('boss.table.fullBoard')} onClick={() => setBoardOpen(true)}><LayoutGrid className="size-5" /></button>
            <button type="button" className={iconBtn} aria-label={t('rooms.board.fullscreen')} onClick={() => void fullscreen()}><Maximize className="size-5" /></button>
          </div>
        </header>

        <aside className="boss-seats">
          {tableMode ? <BossBoard view={view} className="boss-pocket-board" {...rollProps}
            onPick={view.phase === 'pick_start' && view.markerChooserId === meId ? (spaceIndex) => act({ type: 'pick_start', spaceIndex }) : undefined}
            dealSlotButton={deal && <button type="button" onClick={() => setDetail('deal')} aria-label={t('boss.status.deal', { n: deal.dealNumber })}>
              {deal.slots.map((slot, i) => slot.source ? <img key={i} src={faceArt(slot.source.team)} alt={nameOf(players, slot.source.ownerId)} /> : <i key={i} />)}
            </button>}>
            {activeRoll || (!rolling && view.phase === 'rolled_choice') ? <Die key={lastRoll?.id} value={activeRoll?.roll ?? lastRoll?.roll ?? 1} size={36} rolling={!!activeRoll} startedAt={startedAt} /> : null}
            {!rolling && space && <PriceTag amount={space.dividends * view.currentShareValue} size={18} />}
            <strong className="boss-board-say">{say}</strong>
          </BossBoard> : <>{myCard}
          {turnOrder}

          <div className="boss-wallet-footer">
            <span>{t('boss.phone.lastPayout')} <strong>{view.lastSettlement ? <Money amount={view.lastSettlement.payouts[meId] ?? 0} /> : '—'}</strong></span>
            <span>{t('boss.phone.closed', { count: view.dealsDone })}</span>
            <span>{t('boss.status.deck', { count: view.deckCount })}</span>
          </div>
          </>}
        </aside>

        <main className="boss-field relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden p-1">
          {field && <div className="boss-field-in flex size-full items-center justify-center">{field}</div>}
        </main>

        <nav className="boss-side">
          {!tableMode && <InfoStrip view={view} players={players} />}
          <RoomLiveBar room={room} meId={meId} />
          <div className="boss-actions">
            {side || (!field && (
              <div className="boss-turn-owner">
                <SeatFaces view={view} userId={view.draft?.actorId ?? deal?.bossId ?? view.turnPlayerId} round className="size-11" />
                <span>{view.phase === 'game_over' ? t('boss.over.title') : t('boss.phone.turnOf', { name: shortName(nameOf(players, view.draft?.actorId ?? deal?.bossId ?? view.turnPlayerId)) })}</span>
              </div>
            ))}
          </div>
        </nav>

        <footer className="boss-hand-row min-h-0 min-w-0">
          <HandBar view={view} players={players} meId={meId} busy={move.isPending} act={(a) => act(a)} big={focus === 'hand'} />
        </footer>
      </div>

      <Dialog open={detail !== null} onOpenChange={(v) => { if (!v) setDetail(null) }}>
        <DialogContent className="border-amber-400 bg-[#241b4b] text-white" title={selectedSeat ? nameOf(players, selectedSeat.userId) : t('boss.status.deal', { n: view.currentDealNumber })}>
          {selectedSeat && <><SeatColors view={view} userId={selectedSeat.userId} /><p>{t('boss.cards.hand', { count: selectedSeat.handCount })}</p></>}
          {detail === 'deal' && deal?.slots.map((slot, i) => <p key={i}>{slot.source ? t(`boss.teamShort.${slot.source.team}`) + ' · ' + nameOf(players, slot.source.ownerId) : t('boss.table.slotEmpty')}</p>)}
          <DialogClose className="min-h-11">{t('common.back')}</DialogClose>
        </DialogContent>
      </Dialog>
      {/* Phones are played sideways; leaving stays one tap away before turning. */}
      <div className="boss-rotate fixed inset-0 z-[60] hidden flex-col items-center justify-center gap-4 bg-[#17142b] p-8 text-center text-white">
        <RotateCw className="boss-rotate-icon size-16 text-[#ffc21a]" aria-hidden="true" />
        <p className="text-xl font-black">{t('boss.rotate.title')}</p>
        <p className="text-sm text-white/70">{t('boss.rotate.hint')}</p>
        <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
          <Button variant="secondary" size="lg" onClick={toRooms}><DoorOpen data-icon="inline-start" />{t('boss.menu.away')}</Button>
          <Button variant="destructive" size="lg" onClick={() => setConfirm('leave')}><LogOut data-icon="inline-start" />{t('boss.menu.leave')}</Button>
        </div>
      </div>

      {view.phase === 'pick_start' && (!tableMode && view.markerChooserId === meId) && (
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
          <BossBoard view={view} {...rollProps} piles settledSpace={settled?.spaceIndex ?? null} className="h-full">
            {activeRoll && <Die key={activeRoll.id} value={activeRoll.roll ?? 1} size={64} startedAt={startedAt} />}
          </BossBoard>
          <Button variant="ghost" size="icon" className="absolute right-2 top-2 size-9 rounded-full bg-white/15 text-white" aria-label={t('common.cancel')} onClick={() => setBoardOpen(false)}><XCircle className="size-5" /></Button>
        </div>
      )}
      <DiscardSheet key={view.discardPendingCount} view={view} busy={move.isPending} act={(a) => act(a)} />
      <BottomSheet open={menuOpen} onOpenChange={setMenuOpen} title={t('boss.menu.title')}>
        <div className="flex flex-col gap-2 px-4 pb-6">
          <Button variant="secondary" size="lg" className="justify-start" onClick={() => { setMenuOpen(false); setTutorial(true) }}><BookOpen data-icon="inline-start" />{t('boss.act.howTo')}</Button>
          {room.hostId === meId && <Button variant="secondary" size="lg" className="justify-start" onClick={() => { setMenuOpen(false); setAddBoard(true) }}><MonitorUp data-icon="inline-start" />{t('boss.addBoard.title')}</Button>}
          <Button variant="secondary" size="lg" className="justify-start" onClick={toRooms}><DoorOpen data-icon="inline-start" />{t('boss.menu.away')}</Button>
          {!room.restart && view.phase !== 'game_over' && <Button variant="secondary" size="lg" className="justify-start" onClick={() => { setMenuOpen(false); setConfirm('restart') }}><RotateCcw data-icon="inline-start" />{t('boss.restart.open')}</Button>}
          <Button variant="secondary" size="lg" className="justify-start" onClick={() => { setMenuOpen(false); setConfirm('leave') }}><LogOut data-icon="inline-start" />{t('boss.menu.leave')}</Button>
          {room.hostId === meId && <Button variant="secondary" size="lg" className="justify-start text-destructive" onClick={() => { setMenuOpen(false); setConfirm('close') }}><XCircle data-icon="inline-start" />{t('rooms.closeRoom')}</Button>}
        </div>
      </BottomSheet>
      <AddBoardSheet room={room} open={addBoard} onOpenChange={setAddBoard} />
      <BottomSheet open={installHelp} onOpenChange={setInstallHelp} title={t('boss.full.title')}>
        <ol className="flex list-decimal flex-col gap-2 px-8 pb-6 text-sm">
          <li>{t('boss.full.step1')}</li>
          <li>{t('boss.full.step2')}</li>
          <li>{t('boss.full.step3')}</li>
        </ol>
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

const modeKey = (code: string) => `thongyod-boss-own:${code}`
function readMode(code: string) { try { return localStorage.getItem(modeKey(code)) === '1' } catch { return false } }
function writeMode(code: string, own: boolean) { try { localStorage.setItem(modeKey(code), own ? '1' : '0') } catch { /* private mode */ } }

/** Public table news, kept above the actions in the full-height right panel. */
function InfoStrip({ view, players }: { view: BossView; players: RoomPlayer[] }) {
  const { t } = useTranslation()
  const deal = view.deal
  const space = deal ? view.spaces[deal.spaceIndex] : view.markerSpace !== null ? view.spaces[view.markerSpace] : null
  const waiting = deal ? deal.requiredIds.filter((id) => !deal.acceptedIds.includes(id)) : []
  return (
    <div className="boss-table-info">
      <p className="text-[11px] font-bold text-white/75">{t('boss.status.dealOf', { n: Math.min(view.dealsDone + 1, view.dealsTotal), total: view.dealsTotal })}</p>
      {space && view.phase !== 'game_over' && (
        <div className="boss-space-summary">
          <div className="flex items-center justify-between gap-1 text-xs font-black">
            <span>{t('boss.phone.space', { n: space.index + 1 })}</span>
            <span>$×{space.dividends}</span>
          </div>
          <Money amount={space.dividends * view.currentShareValue} className="block text-3xl" />
          <span className="text-xs font-bold">{t('boss.deal.people', { count: space.teamCount })}</span>
        </div>
      )}
      {deal && <p className="flex min-w-0 items-center gap-1 text-xs font-bold">
        <img src={fxArt('crown')} alt="" className="size-5" />
        <span className="truncate">{t('boss.status.boss')} {shortName(nameOf(players, deal.bossId))}</span>
      </p>}
      {waiting.length > 0 && <p className="boss-waiting text-[11px] leading-tight text-white/85">{t('boss.table.waitingFor', { names: waiting.map((id) => shortName(nameOf(players, id))).join(', ') })}</p>}
      {view.currentEndRollFaces.length > 0 && view.phase !== 'game_over' && <p className="text-[11px] font-bold text-[#ffcd9f]">{t('boss.status.endFaces', { faces: view.currentEndRollFaces.join(' ') })}</p>}
    </div>
  )
}

/** Owner, during a game: pair another Board Screen by QR, or turn a device that is only watching into one. */
function AddBoardSheet({ room, open, onOpenChange }: { room: BossRoomData; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation()
  const make = useMakeBoard(room.code)
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t('boss.addBoard.title')}>
      <div className="flex flex-col gap-3 px-4 pb-6">
        <p className="text-sm text-muted-foreground">{t('boss.addBoard.qr')}</p>
        <QrCodeCard value={boardUrl(room.code)} label={t('rooms.board.open')} />
        <p className="text-sm font-bold">{t('boss.addBoard.watching')}</p>
        {room.spectators.length === 0 && <p className="text-sm text-muted-foreground">{t('boss.addBoard.none')}</p>}
        {room.spectators.map((s) => (
          <Button key={s.userId} variant="secondary" size="lg" className="justify-start" disabled={make.isPending}
            onClick={() => make.mutate(s.userId, { onSuccess: () => onOpenChange(false), onError: () => showErrorToast(t('common.saveError')) })}>
            <MonitorUp data-icon="inline-start" />{t('boss.addBoard.make', { name: shortName(s.displayName) })}
          </Button>
        ))}
      </div>
    </BottomSheet>
  )
}

/** Snake draft: whose pick it is, the investors still free, and (host) "random the rest". */
function DraftCard({ view, players, meId, busy, act, host, onRandom }: { view: BossView; players: RoomPlayer[]; meId: string; busy: boolean; act: (a: BossActionPayload) => void; host: boolean; onRandom: () => void }) {
  const { t } = useTranslation()
  const draft = view.draft
  if (!draft) return null
  const mine = draft.actorId === meId
  return (
    <div className="boss-draft flex w-full max-w-md flex-col gap-2 rounded-2xl bg-[#f6efdc] p-2.5 text-[#241b4b]">
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
  const winners = view.winnerIds.map((id) => shortName(nameOf(players, id)))
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
    <div className="boss-results flex w-full max-w-md flex-col gap-2 rounded-3xl bg-[#fff4dc] p-4 text-[#3a2416] shadow-[0_4px_0_#5a3420]">
      <h2 className="flex items-center justify-center gap-2"><img src={fxArt('trophy')} alt="" className="size-10" /><Word text={t('boss.over.title')} className="text-3xl" /></h2>
      {winners.length > 1 && <p className="text-center text-sm font-black text-amber-700">{t('boss.over.jointWin', { names: winners.join(' & '), amount: money(top) })}</p>}
      <ol className="flex flex-col gap-1.5">
        {ranked.map((s, i) => (
          <li key={s.userId} className={cn('boss-rank flex items-center gap-3 rounded-2xl bg-white/80 p-2', view.winnerIds.includes(s.userId) && 'ring-4 ring-amber-400')} style={{ animationDelay: `${i * 120}ms` }}>
            <span className="w-8 text-center text-lg font-black">{place(i)}</span>
            <SeatFaces view={view} userId={s.userId} mood={view.winnerIds.includes(s.userId) ? 'happy' : 'calm'} className="size-11" />
            <PlayerName name={nameOf(players, s.userId)} className="min-w-0 flex-1 font-bold" />
            <Money amount={s.exactCash ?? 0} className="text-xl text-amber-600" />
          </li>
        ))}
      </ol>
      {awards.length > 0 && (
        <ul className="boss-awards mt-1 grid grid-cols-2 gap-1.5">
          {awards.map((w, i) => (
            <li key={w.key} className="boss-rank flex items-center gap-2 rounded-xl bg-[#241b4b] p-1.5 text-white" style={{ animationDelay: `${(ranked.length + i) * 120}ms` }}>
              <span className="relative shrink-0"><SeatFaces view={view} userId={w.id} round className="size-9" /><img src={fxArt(AWARD_ART[w.key])} alt="" className="boss-how absolute -bottom-1 -right-2 size-6 drop-shadow" style={{ animationDelay: `${(ranked.length + i) * 120 + 300}ms` }} /></span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[10px] font-bold text-[#ffd77a]">{w.title}</span>
                <span className="block truncate text-xs font-bold">{shortName(nameOf(players, w.id))} · {w.value}</span>
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
      <p className="flex items-center gap-2 font-bold"><RotateCcw className="size-4 text-amber-500" aria-hidden="true" />{t('boss.restart.by', { name: shortName(nameOf(room.players, r.openedBy)) })}</p>
      <p className="text-sm font-bold text-muted-foreground">{t('boss.restart.count', { yes: r.yes.length, needed: r.needed })} · {r.voters.map((id) => `${shortName(nameOf(room.players, id))}${r.yes.includes(id) ? '✓' : r.no.includes(id) ? '✗' : ' ?'}`).join(' · ')}</p>
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
  const name = shortName(nameOf(room.players, target))
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
