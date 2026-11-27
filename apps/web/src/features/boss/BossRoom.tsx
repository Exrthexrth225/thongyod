import { useTranslation } from 'react-i18next'
import { useRoomSettings, useStartRound } from '@/api/rooms'
import type { BossRoomData } from '@/api/types'
import { Switch } from '@/components/ui/switch'
import { RoomLobby } from '@/features/rooms/RoomParts'
import { showErrorToast } from '@/lib/toast'
import { BossBoard } from './BossBoard'
import { ClosingRing, Die, EndRoll, FxBanner, InterruptOverlay, MoneyFly } from './BossFx'
import { BossGame } from './BossGame'
import { DealPanel } from './DealPanel'
import { GuideBar } from './GuideBar'
import { Word } from './Word'
import { useBossTimeline } from './useBossTimeline'
import { faceArt, nameOf, TEAMS } from './meta'
import { SeatCard } from './parts'
import { useRef } from 'react'
import { useNavigate } from 'react-router'
import { Maximize, X } from 'lucide-react'
import './boss.css'

/** I'm the Boss! inside a room: the lobby (host sets "short game"), then the game screen. */
export function BossRoom({ room, meId, onLeave }: { room: BossRoomData; meId: string; onLeave: () => void }) {
  const { t } = useTranslation()
  const isHost = room.hostId === meId
  const start = useStartRound(room.code)
  const settings = useRoomSettings(room.code)
  const onError = () => showErrorToast(t('common.saveError'))
  if (room.state !== 'lobby' && room.boss) return <BossGame room={room} meId={meId} />
  return (
    <RoomLobby room={room} isHost={isHost} minPlayers={3} starting={start.isPending} onStart={() => start.mutate(undefined, { onError })} onLeave={onLeave}>
      <div className="flex items-center justify-center -space-x-3" aria-hidden="true">
        {TEAMS.map((team, i) => <img key={team} src={faceArt(team)} alt="" className="boss-lobby-face size-14 rounded-full bg-muted object-cover object-top ring-2 ring-card" style={{ animationDelay: `${i * 90}ms` }} />)}
      </div>
      <p className="text-center text-sm text-muted-foreground">{t('boss.lobby.players')}</p>
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

/** The shared Board Screen (iPad): the whole table with the deal in the middle and every effect. Public data only. */
export function BossTableScreen({ room }: { room: BossRoomData }) {
  const view = room.boss!
  const stage = useRef<HTMLDivElement>(null)
  const { latest, moods } = useBossTimeline(view)
  const lastRoll = latest?.kind === 'dice_rolled' ? latest : null
  const settled = latest?.kind === 'deal_settled' && view.lastSettlement?.dealNumber === latest.dealNumber ? latest : null
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div ref={stage} className="boss-table fixed inset-0 z-[41] gap-3 overflow-hidden bg-[radial-gradient(ellipse_at_30%_20%,#2c2360,#17142b_60%,#120d2b)] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white">
      <div className="boss-table-board flex min-h-0 min-w-0 items-center justify-center">
        <BossBoard view={view} roll={lastRoll} piles className="h-full">
          <div className="flex size-full flex-col items-center justify-center gap-2 overflow-hidden">
            {view.phase === 'pick_start' && <p className="boss-plaque boss-banner px-6 py-2.5"><Word text={t('boss.phase.pickStart', { name: nameOf(room.players, view.markerChooserId) })} className="text-[clamp(16px,2.7vmin,30px)]" /></p>}
            {!view.deal && view.phase !== 'pick_start' && view.phase !== 'game_over' && <p key={view.turnPlayerId} className="boss-plaque boss-banner px-6 py-2.5"><Word text={t('boss.phase.turn', { name: nameOf(room.players, view.turnPlayerId) })} className="text-[clamp(18px,3.2vmin,36px)]" /></p>}
            {view.deal && <p key={view.deal.bossId} className="boss-plaque boss-banner px-6 py-2.5"><Word text={t('boss.phase.negotiating', { boss: nameOf(room.players, view.deal.bossId) })} className="text-[clamp(16px,2.7vmin,30px)]" /></p>}
            {view.phase === 'closing' && view.deal && <ClosingRing deadline={view.deal.closingDeadlineAt} className="text-lg" />}
            {view.phase === 'rolled_choice' && lastRoll && <Die key={lastRoll.id} value={lastRoll.roll ?? 1} size={88} />}
            {view.phase === 'game_over' && <p className="boss-plaque boss-banner px-6 py-3"><Word text={t('boss.fx.winner', { name: view.winnerIds.map((id) => nameOf(room.players, id)).join(', ') })} className="text-[clamp(24px,4.5vmin,48px)]" /></p>}
          </div>
        </BossBoard>
      </div>
      <aside className="boss-table-side flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto [scrollbar-width:none]">
        <div className="flex items-center gap-2">
          <button type="button" className="flex size-9 items-center justify-center rounded-full bg-white/10" aria-label={t('rooms.board.exit')} onClick={() => void navigate('/games/rooms')}><X className="size-5" /></button>
          <span className="flex-1 truncate text-sm font-bold text-white/80">{t('rooms.roomTitle', { code: room.code })}</span>
          <button type="button" className="flex size-9 items-center justify-center rounded-full bg-white/10" aria-label={t('rooms.board.fullscreen')} onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {}))}><Maximize className="size-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {view.seats.map((s) => <SeatCard key={s.userId} view={view} seat={s} players={room.players} online={room.online.includes(s.userId)} mood={moods[s.userId] ?? 'calm'} dark />)}
        </div>
        <GuideBar view={view} players={room.players} />
        {view.deal && <DealPanel view={view} players={room.players} />}
      </aside>
      <FxBanner event={latest} view={view} players={room.players} />
      {settled && view.lastSettlement && <MoneyFly event={settled} payouts={view.lastSettlement.payouts} container={stage} />}
      {latest?.kind === 'end_roll' && <EndRoll event={latest} view={view} />}
      <InterruptOverlay view={view} players={room.players} canStop={false} stopping={false} onStop={() => {}} />
    </div>
  )
}
