import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { BookOpen, DoorOpen, LayoutGrid, LogOut, Menu, Minus, Plus, RotateCw, Trophy, WifiOff, XCircle } from 'lucide-react'
import { ApiError } from '@/api/client'
import { useBackToLobby, useBossAction, useBossHost, useCloseRoom, useLeaveRoom } from '@/api/rooms'
import type { BossActionPayload, BossRoomData, BossView, RoomPlayer } from '@/api/types'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { RoomLiveBar } from '@/features/rooms/RoomLiveBar'
import { showErrorToast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { BossBoard } from './BossBoard'
import { ClosingRing, Die, EndRoll, FxBanner, InterruptOverlay, MoneyFly } from './BossFx'
import { ContractCard } from './DealPanel'
import { DiscardSheet, HandBar } from './Hand'
import { fxArt, M, nameOf, seatTeam, TEAM_COLOR, tutorialSeen } from './meta'
import { BossTutorial } from './Tutorial'
import { AskSheet } from './OfferSheet'
import { Face, Money, SpaceTile, TeamBadge, CashTag } from './parts'
import { GuideBar } from './GuideBar'
import { useBossTimeline } from './useBossTimeline'
import './boss.css'

const KNOWN_ERRORS = ['NOT_YOUR_TURN', 'NOT_BOSS', 'INVALID_PHASE', 'MISSING_REQUIRED', 'NOT_ENOUGH_TEAMS', 'NO_OFFER', 'ALREADY_STOPPED', 'RECRUIT_UNOWNED_FIRST', 'PLAYER_ONLINE'] as const
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
 * One phone in a game of I'm the Boss!, landscape like a card game: players down the left, the table (an oval with the
 * deal on it) in the middle, big buttons on the right, my cards fanned along the bottom. Portrait asks to turn the phone.
 */
export function BossGame({ room, meId }: { room: BossRoomData; meId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const view = room.boss!
  const stage = useRef<HTMLDivElement>(null)
  const move = useBossAction(room.code)
  const lobby = useBackToLobby(room.code)
  const leave = useLeaveRoom(room.code)
  const close = useCloseRoom(room.code)
  const [askOpen, setAskOpen] = useState(false)
  const [boardOpen, setBoardOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirm, setConfirm] = useState<'leave' | 'close' | 'fail' | null>(null)
  // Boss's split being typed (millions), and whose amount the −/+ buttons change.
  const [draft, setDraft] = useState<{ deal: string; amounts: Record<string, number> } | null>(null)
  const [pickId, setPickId] = useState<string | null>(null)
  const [tutorial, setTutorial] = useState(() => !tutorialSeen())
  const { latest, moods } = useBossTimeline(view)

  const act = (action: BossActionPayload, after?: () => void) =>
    move.mutate(action, {
      onSuccess: after,
      onError: (e) => {
        const code = e instanceof ApiError ? e.code : undefined
        showErrorToast(code && (KNOWN_ERRORS as readonly string[]).includes(code) ? t(`boss.errors.${code as KnownError}`) : t('common.saveError'))
      },
    })
  const toRooms = () => void navigate('/games/rooms', { replace: true })

  const players = room.players
  const deal = view.deal
  const isBoss = deal?.bossId === meId
  const myTurn = !deal && view.turnPlayerId === meId
  const myStop = view.myHand.find((c) => c.kind === 'stop')
  const lastRoll = view.events.findLast((e) => e.kind === 'dice_rolled')
  const lastEndRoll = latest?.kind === 'end_roll' ? latest : null
  const settled = latest?.kind === 'deal_settled' && view.lastSettlement?.dealNumber === latest.dealNumber ? latest : null
  const space = view.markerSpace !== null ? view.spaces[view.markerSpace] : null
  const me = view.seats.find((s) => s.userId === meId)
  const myAsk = deal?.asks[meId] ?? null
  const isContributor = deal?.contributorIds.includes(meId) ?? false
  const others = view.seats.filter((s) => s.userId !== meId)
  /** What this player should do in the open deal. */

  // ── boss split (inline, like haggling at the table) ──
  const amounts = deal && isBoss
    ? draft?.deal === deal.id ? draft.amounts : Object.fromEntries(others.map((s) => [s.userId, Math.round(((deal.offered ? deal.allocation[s.userId] : deal.asks[s.userId]) ?? 0) / M)]))
    : {}
  const total = deal ? deal.totalValue / M : 0
  const given = Object.values(amounts).reduce((a, b) => a + b, 0)
  const left = total - given
  const selected = isBoss ? pickId ?? deal?.contributorIds.find((id) => id !== meId) ?? others[0]?.userId ?? null : null
  const setAmount = (id: string, v: number) => deal && setDraft({ deal: deal.id, amounts: { ...amounts, [id]: Math.max(0, Math.min(999, v)) } })
  const sendOffer = () => deal && act({ type: 'set_allocation', allocation: { ...Object.fromEntries(Object.entries(amounts).filter(([, v]) => v > 0).map(([id, v]) => [id, v * M])), ...(left > 0 ? { [meId]: left * M } : {}) } }, () => setDraft(null))

  // ── top banner ──
  const banner = view.phase === 'game_over' ? t('boss.phase.over')
    : view.phase === 'pick_start' ? (view.markerChooserId === meId ? t('boss.phase.pickMine') : t('boss.phase.pickStart', { name: nameOf(players, view.markerChooserId) }))
    : deal ? (isBoss ? t('boss.phase.youBoss') : t('boss.phase.negotiating', { boss: nameOf(players, deal.bossId) }))
    : view.phase === 'discard_limit' ? t('boss.phase.discard', { name: nameOf(players, view.turnPlayerId) })
    : myTurn ? t('boss.phase.myTurn') : t('boss.phase.turn', { name: nameOf(players, view.turnPlayerId) })

  // ── middle of the table ──
  let field: React.ReactNode
  if (view.phase === 'game_over') field = <Results view={view} players={players} />
  else if (deal) {
    field = (
      <div className="flex w-full flex-col items-center gap-1.5">
        {view.phase === 'closing' && <ClosingRing deadline={deal.closingDeadlineAt} />}
        <ContractCard view={view} players={players} meId={meId} />
      </div>
    )
  } else if (space) {
    field = (
      <div className="flex items-center gap-4">
        <SpaceTile space={space} big active className="h-32 w-44" />
        <div className="flex flex-col items-center gap-1">
          {lastRoll && view.phase === 'rolled_choice' ? <Die key={lastRoll.id} value={lastRoll.roll ?? 1} size={52} /> : <Die value={lastRoll?.roll ?? 5} size={52} rolling={false} className="opacity-40" />}
          <Money amount={space.dividends * view.currentShareValue} className="text-lg text-[#ffc21a]" />
        </div>
      </div>
    )
  }

  // ── big buttons on the right ──
  const big = 'h-12 w-full rounded-2xl text-base font-black shadow-[0_4px_0_rgba(0,0,0,0.3)] active:translate-y-0.5'
  /** A big button with one short line saying what it does. */
  const label = (text: string, hint: string) => (
    <span className="flex flex-col items-center leading-tight"><span>{text}</span><span className="text-[10px] font-semibold opacity-75">{hint}</span></span>
  )
  const ghost = 'bg-white/10 text-white hover:bg-white/20'
  let side: React.ReactNode = null
  if (myTurn && view.phase === 'turn_choice') {
    side = (
      <>
        <Button className={cn(big, 'h-14')} disabled={move.isPending || space?.closedByDeal !== null} onClick={() => act({ type: 'open_deal' })}>{label(t('boss.act.dealHere'), t('boss.act.dealHereHint', { amount: t('boss.money', { m: ((space?.dividends ?? 0) * view.currentShareValue) / M }) }))}</Button>
        <Button variant="secondary" className={cn(big, 'h-14', ghost)} disabled={move.isPending} onClick={() => act({ type: 'roll_die' })}>{label(t('boss.act.roll'), t('boss.act.rollHint'))}</Button>
      </>
    )
  } else if (myTurn && view.phase === 'rolled_choice') {
    side = (
      <>
        <Button className={cn(big, 'h-14')} disabled={move.isPending} onClick={() => act({ type: 'open_deal' })}>{label(t('boss.act.dealHere'), t('boss.act.dealHereHint', { amount: t('boss.money', { m: ((space?.dividends ?? 0) * view.currentShareValue) / M }) }))}</Button>
        <Button variant="secondary" className={cn(big, 'h-14', ghost)} disabled={move.isPending} onClick={() => act({ type: 'draw_cards' })}>{label(t('boss.act.draw'), t('boss.act.drawHint'))}</Button>
      </>
    )
  } else if (deal && isBoss && view.phase !== 'interrupt') {
    side = (
      <>
        {selected && (
          <div className="flex flex-col items-center gap-1 rounded-2xl bg-white/[0.07] p-1.5 ring-1 ring-white/10">
            <span className="w-full truncate text-center text-[11px] font-bold text-white/70">{t('boss.editor.for', { name: nameOf(players, selected) })}</span>
            <Money amount={(amounts[selected] ?? 0) * M} className="text-2xl text-[#ffc21a]" />
            <div className="grid w-full grid-cols-3 gap-1">
              <button type="button" className="flex h-8 items-center justify-center rounded-lg bg-white/10 text-white" aria-label="-1" onClick={() => setAmount(selected, (amounts[selected] ?? 0) - 1)}><Minus className="size-4" /></button>
              <button type="button" className="flex h-8 items-center justify-center rounded-lg bg-white/10 text-white" aria-label="+1" onClick={() => setAmount(selected, (amounts[selected] ?? 0) + 1)}><Plus className="size-4" /></button>
              <button type="button" className="h-8 rounded-lg bg-white/10 text-sm font-black text-white" onClick={() => setAmount(selected, (amounts[selected] ?? 0) + 5)}>+5</button>
            </div>
            <span className={cn('text-[11px] font-bold', left < 0 ? 'text-red-300' : 'text-white/70')}>{left < 0 ? t('boss.deal.over') : t('boss.deal.bossKeeps')} <Money amount={Math.abs(left) * M} /></span>
          </div>
        )}
        <Button variant="secondary" className={cn(big, 'h-10', ghost)} disabled={move.isPending || left < 0} onClick={sendOffer}>{deal.offered ? t('boss.act.editOffer') : t('boss.act.offer')}</Button>
        {view.phase === 'closing'
          ? <Button variant="destructive" className={cn(big, 'h-14')} disabled={move.isPending} onClick={() => act({ type: 'hold' })}>{label(t('boss.act.wait'), t('boss.act.waitHint'))}</Button>
          : <Button className={cn(big, deal.canClose && 'boss-glow')} disabled={move.isPending || !deal.canClose} onClick={() => act({ type: 'start_closing' })}>{t('boss.act.close')}</Button>}
        <button type="button" className="text-xs font-bold text-white/60 underline-offset-2 hover:underline" onClick={() => setConfirm('fail')}>{t('boss.act.fail')}</button>
      </>
    )
  } else if (deal && view.phase !== 'interrupt') {
    const mine = deal.allocation[meId] ?? 0
    side = (
      <>
        {deal.offered && (
          <div className="flex flex-col items-center rounded-2xl bg-white/[0.07] p-2 ring-1 ring-white/10">
            <span className="text-[11px] font-bold text-white/70">{t('boss.deal.youGet')}</span>
            <Money amount={mine} className="text-2xl text-[#ffc21a]" />
            {!isContributor && mine > 0 && <span className="text-[10px] text-white/60">{t('boss.deal.bribe')}</span>}
          </div>
        )}
        {view.phase === 'closing' && <Button variant="destructive" className={cn(big, 'h-14')} disabled={move.isPending} onClick={() => act({ type: 'hold' })}>{label(t('boss.act.wait'), t('boss.act.waitHint'))}</Button>}
        {deal.offered && isContributor && view.phase === 'negotiating' && !deal.acceptedIds.includes(meId) && <Button className={big} disabled={move.isPending} onClick={() => act({ type: 'accept_offer' })}>{t('boss.act.accept')}</Button>}
        {deal.offered && isContributor && !deal.declinedIds.includes(meId) && <Button variant="secondary" className={cn(big, 'h-10', ghost)} disabled={move.isPending} onClick={() => act({ type: 'decline_offer' })}>{t('boss.act.decline')}</Button>}
        <Button variant="secondary" className={cn(big, 'h-10', ghost)} disabled={move.isPending} onClick={() => setAskOpen(true)}>{myAsk !== null ? `${t('boss.act.ask')} · ${t('boss.money', { m: myAsk / M })}` : t('boss.act.ask')}</Button>
      </>
    )
  } else if (view.phase === 'game_over' && room.hostId === meId) {
    side = <Button className={big} disabled={lobby.isPending} onClick={() => lobby.mutate()}>{t('boss.act.backToRoom')}</Button>
  }

  // ── a player row on the left ──
  const row = (s: (typeof view.seats)[number]) => {
    const id = s.userId
    const isBossRow = deal?.bossId === id
    const turn = !deal && view.turnPlayerId === id && view.phase !== 'game_over'
    const status = deal
      ? deal.acceptedIds.includes(id) ? t('boss.deal.accepted') : deal.declinedIds.includes(id) ? t('boss.deal.declined') : deal.asks[id] != null ? t('boss.deal.asked', { amount: t('boss.money', { m: (deal.asks[id] ?? 0) / M }) }) : isBossRow ? t('boss.status.boss') : ''
      : ''
    const editing = isBoss && id !== meId
    const Tag = editing ? 'button' : 'div'
    return (
      <Tag
        key={id}
        type={editing ? 'button' : undefined}
        onClick={editing ? () => setPickId(id) : undefined}
        data-seat={id}
        className={cn('flex w-full items-center gap-1.5 rounded-xl bg-white/[0.06] p-1 pr-1.5 text-left ring-1 ring-white/10 transition', (turn || isBossRow) && 'ring-2 ring-[#ffc21a]', editing && selected === id && 'bg-[#ffc21a]/20 ring-2 ring-[#ffc21a]', !room.online.includes(id) && 'opacity-50')}
      >
        <span className="relative shrink-0 rounded-full p-0.5" style={{ background: TEAM_COLOR[seatTeam(view, id)] }}>
          <Face team={seatTeam(view, id)} mood={moods[id] ?? 'calm'} className="size-8 rounded-full" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="flex items-center gap-1 truncate text-[13px] font-bold text-white">{nameOf(players, id)}{!room.online.includes(id) && <WifiOff className="size-3 shrink-0" />}</span>
          <span className="flex items-center gap-1 text-[10px] text-white/60">
            <span className="flex">{s.investors.map((team) => <TeamBadge key={team} team={team} className="-mr-1 size-3.5" />)}</span>
            <CashTag seat={s} className="ml-1 h-3.5 [&_img]:size-3.5" />
            <span className="ml-auto truncate">{status || t('boss.cards.hand', { count: s.handCount })}</span>
          </span>
        </span>
        {editing && <Money amount={(amounts[id] ?? 0) * M} className="shrink-0 rounded-md bg-black/30 px-1 text-xs text-[#ffc21a]" />}
      </Tag>
    )
  }

  return (
    <div ref={stage} className="boss-stage fixed inset-0 z-40 overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,#2c2360,#17142b_65%,#120d2b)] text-white">
      <div className="boss-game relative size-full pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
        <header className="boss-top relative z-40 flex items-center gap-2 px-2 pt-1.5">
          <button type="button" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10" aria-label={t('boss.menu.title')} onClick={() => setMenuOpen(true)}><Menu className="size-4" /></button>
          <span className="min-w-0 flex-1" />
          <span key={banner} className="boss-banner truncate rounded-full bg-[#ffc21a] px-4 py-1 text-sm font-black text-[#241b4b] shadow-[0_3px_0_#b9821c]">{banner} · {t('boss.status.dealOf', { n: Math.min(view.dealsDone + 1, view.dealsTotal), total: view.dealsTotal })}</span>
          {view.phase !== 'game_over' && (view.currentEndRollFaces.length > 0
            ? <span className="boss-pulse shrink-0 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-black">{t('boss.status.endFaces', { faces: view.currentEndRollFaces.join(' ') })}</span>
            : view.dealsTotal - view.dealsDone === 7 && <span className="shrink-0 rounded-full bg-red-600/70 px-2.5 py-1 text-[11px] font-black">{t('boss.status.endSoon')}</span>)}
          <span className="min-w-0 flex-1" />
          <button type="button" className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 text-xs font-bold" onClick={() => setBoardOpen(true)}><LayoutGrid className="size-4" />{t('boss.act.board')}</button>
        </header>
        <div className="boss-live px-2"><RoomLiveBar room={room} meId={meId} /></div>

        <aside className="boss-seats flex min-h-0 flex-col gap-1 overflow-y-auto p-1.5 [scrollbar-width:none]">
          {others.map(row)}
          {me && (
            <div data-seat={meId} className={cn('mt-auto flex items-center gap-2 rounded-2xl bg-[#ffc21a]/15 p-1.5 ring-2', view.turnPlayerId === meId && !deal ? 'ring-[#ffc21a]' : 'ring-[#ffc21a]/40')}>
              <span className="shrink-0 rounded-full p-0.5" style={{ background: TEAM_COLOR[seatTeam(view, meId)] }}><Face team={seatTeam(view, meId)} mood={moods[meId] ?? 'calm'} className="size-10 rounded-full" /></span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-xs font-bold text-white/80">{nameOf(players, meId)} ({t('boss.status.you')})</span>
                <Money amount={me.exactCash ?? 0} className="text-xl text-[#ffc21a]" />
              </span>
            </div>
          )}
        </aside>

        <main className="boss-field relative min-h-0 min-w-0 px-1">
          <div className="boss-oval flex size-full flex-col items-center gap-1.5 overflow-y-auto rounded-[2.2rem] bg-[radial-gradient(ellipse_at_center,#2c2360,#221a4b_75%)] p-2 shadow-[inset_0_0_0_2px_rgba(233,185,73,0.5),inset_0_0_40px_rgba(0,0,0,0.45),0_10px_40px_rgba(0,0,0,0.4)] [scrollbar-width:none]">
            <GuideBar view={view} players={players} meId={meId} />
            <div className="flex w-full flex-1 items-center justify-center">{field}</div>
          </div>
        </main>

        <nav className="boss-side flex min-h-0 flex-col justify-end gap-1.5 p-1.5">{side}</nav>

        <footer className="boss-hand-row min-w-0">
          <HandBar view={view} players={players} meId={meId} busy={move.isPending} act={(a) => act(a)} />
        </footer>
      </div>

      {/* Phones are played sideways. */}
      <div className="boss-rotate fixed inset-0 z-[60] hidden flex-col items-center justify-center gap-4 bg-[#17142b] p-8 text-center text-white">
        <RotateCw className="boss-rotate-icon size-16 text-[#ffc21a]" aria-hidden="true" />
        <p className="text-xl font-black">{t('boss.rotate.title')}</p>
        <p className="text-sm text-white/70">{t('boss.rotate.hint')}</p>
      </div>

      {view.phase === 'pick_start' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center gap-3 bg-black/75 p-2 pt-12">
          <BossBoard view={view} onPick={view.markerChooserId === meId ? (spaceIndex) => act({ type: 'pick_start', spaceIndex }) : undefined} className="h-full" />
        </div>
      )}
      <AwayPanel room={room} view={view} meId={meId} />
      {tutorial && <BossTutorial onClose={() => setTutorial(false)} />}
      <FxBanner event={latest} view={view} players={players} />
      {settled && view.lastSettlement && <MoneyFly event={settled} payouts={view.lastSettlement.payouts} container={stage} />}
      {lastEndRoll && <EndRoll event={lastEndRoll} view={view} />}
      <InterruptOverlay view={view} players={players} canStop={!!myStop && view.interrupt?.actorId !== meId} stopping={move.isPending} onStop={() => myStop && act({ type: 'play_stop', cardId: myStop.id })} />

      {boardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center gap-2 bg-black/85 p-2" role="dialog" aria-label={t('boss.act.board')}>
          <BossBoard view={view} piles className="h-full" />
          <Button variant="ghost" size="icon" className="absolute right-2 top-2 size-9 rounded-full bg-white/15 text-white" aria-label={t('common.cancel')} onClick={() => setBoardOpen(false)}><XCircle className="size-5" /></Button>
        </div>
      )}
      <AskSheet open={askOpen} onOpenChange={setAskOpen} current={myAsk} sending={move.isPending} onSend={(amount) => act({ type: 'set_ask', amount }, () => setAskOpen(false))} />
      <DiscardSheet key={view.discardPendingCount} view={view} busy={move.isPending} act={(a) => act(a)} />
      <BottomSheet open={menuOpen} onOpenChange={setMenuOpen} title={t('boss.menu.title')}>
        <div className="flex flex-col gap-2 px-4 pb-6">
          <Button variant="secondary" size="lg" className="justify-start" onClick={() => { setMenuOpen(false); setTutorial(true) }}><BookOpen data-icon="inline-start" />{t('boss.act.howTo')}</Button>
          <Button variant="secondary" size="lg" className="justify-start" onClick={toRooms}><DoorOpen data-icon="inline-start" />{t('boss.menu.away')}</Button>
          <Button variant="secondary" size="lg" className="justify-start" onClick={() => { setMenuOpen(false); setConfirm('leave') }}><LogOut data-icon="inline-start" />{t('boss.menu.leave')}</Button>
          {room.hostId === meId && <Button variant="secondary" size="lg" className="justify-start text-destructive" onClick={() => { setMenuOpen(false); setConfirm('close') }}><XCircle data-icon="inline-start" />{t('rooms.closeRoom')}</Button>}
        </div>
      </BottomSheet>
      <SheetConfirm
        open={confirm !== null}
        title={confirm === 'close' ? t('rooms.closeRoom') : confirm === 'fail' ? t('boss.act.fail') : t('boss.menu.leave')}
        text={confirm === 'close' ? t('rooms.closeRoomConfirm') : confirm === 'fail' ? t('boss.act.failConfirm') : t('boss.menu.leaveConfirm')}
        label={confirm === 'close' ? t('rooms.closeRoom') : confirm === 'fail' ? t('boss.act.fail') : t('boss.menu.leave')}
        busy={leave.isPending || close.isPending || move.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const onError = () => showErrorToast(t('common.saveError'))
          if (confirm === 'fail') act({ type: 'fail_deal' }, () => setConfirm(null))
          else (confirm === 'close' ? close : leave).mutate(undefined, { onSuccess: toRooms, onError })
        }}
      />
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

function Results({ view, players }: { view: BossView; players: RoomPlayer[] }) {
  const { t } = useTranslation()
  const ranked = [...view.seats].sort((a, b) => (b.exactCash ?? 0) - (a.exactCash ?? 0))
  // Fun facts to talk about after the game.
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
      {awards.length > 0 && (
        <ul className="mt-1 grid grid-cols-2 gap-1.5">
          {awards.map((w, i) => (
            <li key={w.key} className="boss-rank flex items-center gap-2 rounded-xl bg-[#241b4b] p-1.5 text-white" style={{ animationDelay: `${(ranked.length + i) * 120}ms` }}>
              <span className="relative shrink-0"><Face team={seatTeam(view, w.id)} className="size-9 rounded-full" /><img src={fxArt(AWARD_ART[w.key])} alt="" className="boss-how absolute -bottom-1 -right-2 size-6 drop-shadow" style={{ animationDelay: `${(ranked.length + i) * 120 + 300}ms` }} /></span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[10px] font-bold text-[#ffd77a]">{w.title}</span>
                <span className="block truncate text-xs font-bold">{nameOf(players, w.id)} · {w.value}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
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
  const away = view.phase === 'game_over' ? [] : room.players.map((p) => p.userId).filter((id) => id !== meId && !room.online.includes(id))
  // Someone holding the game up comes first; the others can wait until the owner looks.
  const target = [...away.filter((id) => view.blockingIds.includes(id)), ...away].find((id) => !dismissed.includes(id))
  const blocking = !!target && view.blockingIds.includes(target) && view.phase !== 'interrupt'
  if (!target) return null
  const name = nameOf(room.players, target)
  const host = room.hostId === meId
  const onError = (e: Error) => showErrorToast(e instanceof ApiError && e.code === 'PLAYER_ONLINE' ? t('boss.errors.PLAYER_ONLINE') : t('common.saveError'))
  return (
    <div className="absolute inset-x-0 top-12 z-[45] mx-auto flex w-[min(92%,26rem)] flex-col gap-2 rounded-3xl bg-card p-3 text-foreground shadow-2xl">
      <p className="flex items-center gap-2 font-bold"><WifiOff className="size-4 text-red-500" aria-hidden="true" />{t('boss.away.title', { name })}</p>
      {host && kick ? (
        <>
          <p className="text-sm text-muted-foreground">{t('boss.away.kickConfirm', { name })}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setKick(null)}>{t('common.cancel')}</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(kick, { onError, onSettled: () => setKick(null) })}>{t('boss.away.kick')}</Button>
          </div>
        </>
      ) : host ? (
        <>
          <p className="text-sm text-muted-foreground">{t('boss.away.hostAsk')}</p>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" onClick={() => setDismissed((d) => [...d, target])}>{t('boss.away.wait')}</Button>
            <Button disabled={skip.isPending || !blocking} onClick={() => skip.mutate(target, { onError })}>{t('boss.away.skip')}</Button>
            <Button variant="destructive" onClick={() => setKick(target)}>{t('boss.away.kick')}</Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t('boss.away.others')}</p>
      )}
    </div>
  )
}
