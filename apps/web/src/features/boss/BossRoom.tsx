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
import { useBossTimeline } from './useBossTimeline'
import { faceArt, nameOf, TEAMS } from './meta'
import { SeatCard } from './parts'
import { useRef } from 'react'
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
  return (
    <div ref={stage} className="boss-stage relative flex h-[calc(100dvh-4rem)] min-h-0 w-full gap-3 p-3">
      <aside className="flex w-52 shrink-0 flex-col gap-2 overflow-y-auto [scrollbar-width:none]">
        {view.seats.map((s) => <SeatCard key={s.userId} view={view} seat={s} players={room.players} online={room.online.includes(s.userId)} mood={moods[s.userId] ?? 'calm'} />)}
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
        <BossBoard view={view} roll={lastRoll} piles className="h-full">
          <div className="flex size-full flex-col items-center justify-center gap-2 overflow-hidden">
            {view.phase === 'pick_start' && <p className="rounded-full bg-black/60 px-4 py-2 text-xl font-black text-white">{t('boss.phase.pickStart', { name: nameOf(room.players, view.markerChooserId) })}</p>}
            {!view.deal && view.phase !== 'pick_start' && view.phase !== 'game_over' && <p className="rounded-full bg-black/60 px-4 py-2 text-2xl font-black text-white">{t('boss.phase.turn', { name: nameOf(room.players, view.turnPlayerId) })}</p>}
            {view.deal && <p className="rounded-full bg-black/60 px-4 py-2 text-xl font-black text-white">{t('boss.phase.negotiating', { boss: nameOf(room.players, view.deal.bossId) })}</p>}
            {view.phase === 'closing' && view.deal && <ClosingRing deadline={view.deal.closingDeadlineAt} className="text-lg" />}
            {view.phase === 'rolled_choice' && lastRoll && <Die key={lastRoll.id} value={lastRoll.roll ?? 1} size={88} />}
            {view.phase === 'game_over' && <p className="rounded-2xl bg-black/60 px-5 py-3 text-3xl font-black text-amber-300">{t('boss.fx.winner', { name: view.winnerIds.map((id) => nameOf(room.players, id)).join(', ') })}</p>}
          </div>
        </BossBoard>
      </div>
      {view.deal && <aside className="w-[22rem] shrink-0 overflow-y-auto"><DealPanel view={view} players={room.players} /></aside>}
      <FxBanner event={latest} view={view} players={room.players} />
      {settled && view.lastSettlement && <MoneyFly event={settled} payouts={view.lastSettlement.payouts} container={stage} />}
      {latest?.kind === 'end_roll' && <EndRoll event={latest} view={view} />}
      <InterruptOverlay view={view} players={room.players} canStop={false} stopping={false} onStop={() => {}} />
    </div>
  )
}
