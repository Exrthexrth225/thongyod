import { useTranslation } from 'react-i18next'
import { useRoomSettings, useStartRound } from '@/api/rooms'
import type { BossEvent, BossRoomData, BossView, RoomPlayer } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { RoomLobby } from '@/features/rooms/RoomParts'
import { showErrorToast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { BossBoard } from './BossBoard'
import { ClosingRing, Die, EndRoll, FxBanner, InterruptOverlay, MoneyFly } from './BossFx'
import { BossGame } from './BossGame'
import { DealBoard } from './DealPanel'
import { instruction } from './dealInfo'
import { Word } from './Word'
import { useBossTimeline } from './useBossTimeline'
import { faceArt, M, nameOf, shortName, TEAMS } from './meta'
import { PriceTag, SeatCard, SpaceTile } from './parts'
import { PlacardLine } from './BossGame'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ListOrdered, Maximize, Maximize2, Minimize2, Shuffle, X } from 'lucide-react'
import './boss.css'

/** I'm the Boss! inside a room: the lobby (host sets "short game"), then the game screen. */
export function BossRoom({ room, meId, onLeave }: { room: BossRoomData; meId: string; onLeave: () => void }) {
  const { t } = useTranslation()
  const isHost = room.hostId === meId
  const start = useStartRound(room.code)
  const settings = useRoomSettings(room.code)
  const onError = () => showErrorToast(t('common.saveError'))
  const n = Math.max(3, room.players.length)
  // six unique investors: 3 players can hold 1 or 2 each, 4-6 players hold 1
  const choices = Array.from({ length: Math.max(1, Math.floor(6 / n)) }, (_, i) => i + 1)
  const each = room.settings.investorsEach && choices.includes(room.settings.investorsEach) ? room.settings.investorsEach : n === 3 ? 2 : 1
  if (room.state !== 'lobby' && room.boss) return <BossGame room={room} meId={meId} />
  return (
    <RoomLobby room={room} isHost={isHost} minPlayers={3} starting={start.isPending} onStart={() => start.mutate(undefined, { onError })} onLeave={onLeave}>
      <div className="flex items-center justify-center -space-x-3" aria-hidden="true">
        {TEAMS.map((team, i) => <img key={team} src={faceArt(team)} alt="" className="boss-lobby-face size-14 rounded-full bg-muted object-cover object-top ring-2 ring-card" style={{ animationDelay: `${i * 90}ms` }} />)}
      </div>
      <p className="text-center text-sm text-muted-foreground">{t('boss.lobby.players')}</p>
      {/* how many investors each player starts with, and how they are handed out */}
      <div className="flex flex-col gap-2">
        <span className="font-medium">{t('boss.lobby.investors')}</span>
        <div className="flex gap-2">
          {choices.map((n) => (
            <Button key={n} type="button" variant={each === n ? 'default' : 'secondary'} className="flex-1" disabled={!isHost || settings.isPending} onClick={() => settings.mutate({ investorsEach: n }, { onError })}>
              {t('boss.lobby.each', { count: n })}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{choices.length > 1 ? t('boss.lobby.investorsHint') : t('boss.lobby.investorsOne')}</span>
        <div className="grid grid-cols-2 gap-2">
          {(['random', 'snake'] as const).map((mode) => (
            <Button key={mode} type="button" variant={(room.settings.draft ?? 'random') === mode ? 'default' : 'secondary'} disabled={!isHost || settings.isPending} onClick={() => settings.mutate({ draft: mode }, { onError })}>
              {mode === 'random' ? <Shuffle data-icon="inline-start" /> : <ListOrdered data-icon="inline-start" />}{t(mode === 'random' ? 'boss.lobby.random' : 'boss.lobby.snake')}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{t((room.settings.draft ?? 'random') === 'random' ? 'boss.lobby.randomHint' : 'boss.lobby.snakeHint')}</span>
      </div>
      <label className="flex items-center justify-between gap-3">
        <span className="flex flex-col">
          <span className="font-medium">{t('boss.lobby.short')}</span>
          <span className="text-xs text-muted-foreground">{t('boss.lobby.shortHint')}</span>
        </span>
        <Switch checked={room.settings.short} disabled={settings.isPending} onCheckedChange={(short) => settings.mutate({ short }, { onError })} />
      </label>
    </RoomLobby>
  )
}

/**
 * The shared Board Screen (iPad, read-only): the whole board, the current deal, what it is missing and how every
 * player reacts, on one landscape screen without scrolling. The deal panel can be expanded over the board.
 */
export function BossTableScreen({ room }: { room: BossRoomData }) {
  const view = room.boss!
  const stage = useRef<HTMLDivElement>(null)
  const { latest, moods, rolling } = useBossTimeline(view)
  const [expanded, setExpanded] = useState(false)
  const lastRoll = latest?.kind === 'dice_rolled' ? latest : null
  const settled = latest?.kind === 'deal_settled' && view.lastSettlement?.dealNumber === latest.dealNumber ? latest : null
  const { t } = useTranslation()
  const navigate = useNavigate()
  const say = instruction(view, room.players, null, t, rolling)
  const deal = view.deal
  const plaque = (text: string, size = 'text-[clamp(15px,2.2vmin,26px)]') => <p key={text} className="boss-plaque boss-banner max-w-[94%] px-6 py-2.5"><Word text={text} className={size} /></p>
  return (
    <div ref={stage} className="boss-table fixed inset-0 z-[41] gap-3 overflow-hidden bg-[radial-gradient(ellipse_at_30%_20%,#2c2360,#17142b_60%,#120d2b)] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white">
      <div className="boss-table-board relative flex min-h-0 min-w-0 items-center justify-center">
        <BossBoard view={view} roll={lastRoll} hold={rolling && lastRoll ? lastRoll.fromSpace ?? null : null} piles settledSpace={settled?.spaceIndex ?? null} className="h-full">
          <div className="flex size-full flex-col items-center justify-center gap-2 overflow-hidden">
            {view.phase === 'game_over'
              ? plaque(view.winnerIds.length > 1 ? t('boss.over.jointWin', { names: view.winnerIds.map((id) => shortName(nameOf(room.players, id))).join(' & '), amount: t('boss.money', { m: (view.seats.find((s) => s.userId === view.winnerIds[0])?.exactCash ?? 0) / M }) }) : t('boss.fx.winner', { name: shortName(nameOf(room.players, view.winnerIds[0])) }), 'text-[clamp(22px,4vmin,44px)]')
              : plaque(say)}
            {deal && <PriceTag key={`p${deal.id}`} amount={deal.totalValue} share={view.currentShareValue} dividends={view.spaces[deal.spaceIndex].dividends} size={40} className="boss-price-pop" />}
            {view.phase === 'closing' && deal && <ClosingRing deadline={deal.closingDeadlineAt} className="text-lg" />}
            {lastRoll && <Die key={lastRoll.id} value={lastRoll.roll ?? 1} size={88} />}
          </div>
        </BossBoard>
        {/* expanded deal: over the board, still no scrolling */}
        {deal && expanded && (
          <div className="absolute inset-[6%] z-20 flex items-center justify-center">
            <div className="w-full max-w-3xl"><DealBoard view={view} players={room.players} big /></div>
          </div>
        )}
      </div>
      <aside className="boss-table-side flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden">
        <div className="flex items-center gap-2">
          <button type="button" className="flex size-9 items-center justify-center rounded-full bg-white/10" aria-label={t('rooms.board.exit')} onClick={() => void navigate('/games/rooms')}><X className="size-5" /></button>
          <span className="flex-1 truncate text-sm font-bold text-white/80">{t('rooms.roomTitle', { code: room.code })} · {t('boss.status.dealOf', { n: Math.min(view.dealsDone + 1, view.dealsTotal), total: view.dealsTotal })}</span>
          {deal && (
            <button type="button" className="flex h-9 items-center gap-1 rounded-full bg-white/10 px-3 text-xs font-bold" onClick={() => setExpanded((v) => !v)}>
              {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}{expanded ? t('boss.table.collapse') : t('boss.table.expand')}
            </button>
          )}
          <button type="button" className="flex size-9 items-center justify-center rounded-full bg-white/10" aria-label={t('rooms.board.fullscreen')} onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {}))}><Maximize className="size-5" /></button>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-1.5">
          {view.seats.map((s) => <SeatCard key={s.userId} view={view} seat={s} players={room.players} online={room.online.includes(s.userId)} mood={moods[s.userId] ?? 'calm'} dark compact={view.seats.length > 4} />)}
        </div>
        {deal && !expanded && <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]"><DealBoard view={view} players={room.players} /></div>}
        {!deal && view.phase !== 'game_over' && <TableIdle view={view} players={room.players} rolling={rolling} />}
      </aside>
      <FxBanner event={latest} view={view} players={room.players} />
      {settled && view.lastSettlement && <MoneyFly event={settled} payouts={view.lastSettlement.payouts} container={stage} />}
      {latest?.kind === 'end_roll' && <EndRoll event={latest} view={view} />}
      <InterruptOverlay view={view} players={room.players} canStop={false} stopping={false} onStop={() => {}} />
    </div>
  )
}

/** Board Screen side panel between deals: the space the marker is on and what it is worth, the placard, recent moves. */
function TableIdle({ view, players, rolling }: { view: BossView; players: RoomPlayer[]; rolling: boolean }) {
  const { t } = useTranslation()
  // while the die and the marker are still moving, keep the old space and do not tell the roll yet
  const roll = rolling ? view.events.findLast((e) => e.kind === 'dice_rolled') : undefined
  const at = roll?.fromSpace ?? view.markerSpace
  const space = at !== null ? view.spaces[at] : null
  const who = (id?: string) => shortName(nameOf(players, id))
  const team = (e: BossEvent) => (e.team ? t(`boss.teamShort.${e.team}`) : '')
  const line = (e: BossEvent): string | null => {
    switch (e.kind) {
      case 'dice_rolled': return t('boss.log.rolled', { name: who(e.actorId), roll: e.roll ?? 0 })
      case 'drew_cards': return t('boss.log.drew', { name: who(e.actorId) })
      case 'deal_opened': return t('boss.log.opened', { name: who(e.actorId), n: e.dealNumber ?? 0 })
      case 'deal_settled': return t('boss.log.settled', { n: e.dealNumber ?? 0, amount: t('boss.money', { m: (e.amount ?? 0) / M }) })
      case 'deal_failed': return t('boss.log.failed', { n: e.dealNumber ?? 0 })
      case 'travel_played': return t('boss.log.travel', { name: who(e.actorId), team: team(e) })
      case 'boss_played': return t('boss.log.boss', { name: who(e.actorId) })
      case 'recruit_played': return t('boss.log.recruit', { name: who(e.actorId), team: team(e) })
      case 'stop_played': return t('boss.log.stop', { name: who(e.actorId) })
      case 'end_roll': return t('boss.log.endRoll', { roll: e.roll ?? 0 })
      case 'player_skipped': return t('boss.log.skipped', { name: who(e.targetId ?? e.actorId) })
      default: return null
    }
  }
  const log = view.events.filter((e) => e.id !== roll?.id).flatMap((e) => { const text = line(e); return text ? [{ id: e.id, text }] : [] }).slice(-6).reverse()
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      {space && (
        <div className="flex shrink-0 items-center gap-3 rounded-2xl bg-white/[0.06] p-2 ring-1 ring-white/10">
          <SpaceTile space={space} big active className="h-28 w-40 shrink-0" />
          <div className="flex min-w-0 flex-col items-start gap-1.5">
            <span className="text-xs font-bold text-white/60">{t('boss.log.here')}</span>
            <PriceTag amount={space.dividends * view.currentShareValue} share={view.currentShareValue} dividends={space.dividends} size={26} />
          </div>
        </div>
      )}
      <PlacardLine view={view} />
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden rounded-2xl bg-black/25 p-2">
        <span className="text-xs font-bold text-white/60">{t('boss.log.title')}</span>
        {log.map((l, i) => <p key={l.id} className={cn('truncate text-sm font-bold', i === 0 ? 'text-[#ffd77a]' : 'text-white/70')}>{l.text}</p>)}
      </div>
    </div>
  )
}
