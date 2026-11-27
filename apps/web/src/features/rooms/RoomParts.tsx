import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Crown, Hourglass, LogOut, MonitorSmartphone, Play, XCircle } from 'lucide-react'
import type { Room } from '@/api/types'
import { useCloseRoom, useMakeBoard } from '@/api/rooms'
import { Avatar } from '@/components/common/Avatar'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { showErrorToast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { RoomShare } from './RoomShare'
import { BoardSection } from './RoomLiveBar'
import '@/components/games/games.css'

/** Players in a room as a 2-column grid; `highlight` = shown dark (e.g. the spies); `extra` = something per player (fingers). */
export function PlayerList({ room, highlight, extra }: { room: Room; highlight?: string[]; extra?: (userId: string) => ReactNode }) {
  const { t } = useTranslation()
  return (
    <ul className="grid grid-cols-2 gap-2" aria-label={t('rooms.players', { count: room.players.length })}>
      {room.players.map((p) => (
        <li key={p.userId} className={cn('game-card-in flex items-center gap-2 rounded-3xl bg-card px-3 py-2', highlight?.includes(p.userId) && 'border-foreground bg-foreground text-background')}>
          <span className="relative shrink-0">
            <Avatar name={p.displayName} src={p.avatarUrl} className={cn('size-8', !room.online.includes(p.userId) && 'opacity-50 grayscale')} />
            <span
              className={cn('absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-card', room.online.includes(p.userId) ? 'bg-tone-success-foreground' : 'bg-muted-foreground')}
              role="img"
              aria-label={room.online.includes(p.userId) ? t('rooms.live.online') : t('rooms.live.offline')}
            />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.displayName}</span>
          {p.isHost && <Crown className="size-4 shrink-0 text-tone-warning-foreground" aria-label={t('rooms.host')} />}
          {extra?.(p.userId)}
        </li>
      ))}
    </ul>
  )
}

type LobbyProps = {
  room: Room
  isHost: boolean
  minPlayers: number
  starting: boolean
  onStart: () => void
  onLeave: () => void
  /** Host-only settings for this game. */
  children?: ReactNode
}

// The waiting room every room game shares: ways to invite, who is here, host settings, start / leave.
export function RoomLobby({ room, isHost, minPlayers, starting, onStart, onLeave, children }: LobbyProps) {
  const { t } = useTranslation()
  const host = room.players.find((p) => p.userId === room.hostId)?.displayName ?? '?'
  const enough = room.players.length >= minPlayers
  const navigate = useNavigate()
  const makeBoard = useMakeBoard(room.code)
  const close = useCloseRoom(room.code)
  const [boardFor, setBoardFor] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const onError = () => showErrorToast(t('common.saveError'))
  const nameOf = (id: string | null) => room.players.find((p) => p.userId === id)?.displayName ?? '?'
  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      <RoomShare code={room.code} exclude={room.players.map((p) => p.userId)} game={room.game} />
      <section className="flex flex-col gap-2">
        <h2 className="flex items-center justify-between text-sm font-medium">
          {t('rooms.players', { count: room.players.length })}
          <span className="text-xs text-muted-foreground">{t('rooms.max', { count: room.maxPlayers })}</span>
        </h2>
        <PlayerList
          room={room}
          extra={isHost ? (id) => id !== room.hostId && (
            <Button size="icon" variant="ghost" className="size-8 shrink-0 rounded-full" aria-label={`${t('rooms.makeBoard')} · ${nameOf(id)}`} onClick={() => setBoardFor(id)}>
              <MonitorSmartphone className="size-4" />
            </Button>
          ) : undefined}
        />
      </section>
      {isHost && <BoardSection room={room} />}
      {isHost ? (
        children && <section className="flex flex-col gap-3 rounded-3xl bg-card p-4">{children}</section>
      ) : (
        <p className="flex items-center justify-center gap-2 rounded-2xl bg-muted p-4 text-sm">
          <Hourglass className="game-breathe size-4" aria-hidden="true" />
          {t('rooms.waitHost', { name: host })}
        </p>
      )}
      {isHost && (
        <Button size="lg" className="h-14 text-lg" disabled={!enough || starting} onClick={onStart}>
          <Play data-icon="inline-start" />
          {enough ? t('rooms.start') : t('rooms.needPlayers', { count: minPlayers })}
        </Button>
      )}
      <Button variant="ghost" onClick={onLeave}>
        <LogOut data-icon="inline-start" />
        {t('rooms.leave')}
      </Button>
      {isHost && (
        <Button variant="ghost" className="text-destructive" onClick={() => setClosing(true)}>
          <XCircle data-icon="inline-start" />
          {t('rooms.closeRoom')}
        </Button>
      )}
      <ConfirmDialog open={boardFor !== null} onOpenChange={(v) => { if (!v) setBoardFor(null) }} title={t('rooms.makeBoard')} description={t('rooms.makeBoardConfirm', { name: nameOf(boardFor) })} confirmLabel={t('rooms.makeBoard')} onConfirm={() => { if (boardFor) makeBoard.mutate(boardFor, { onError }); setBoardFor(null) }} />
      <ConfirmDialog open={closing} onOpenChange={setClosing} title={t('rooms.closeRoom')} description={t('rooms.closeRoomConfirm')} confirmLabel={t('rooms.closeRoom')} destructive onConfirm={() => close.mutate(undefined, { onSuccess: () => void navigate('/games/rooms', { replace: true }), onError })} />
    </div>
  )
}
