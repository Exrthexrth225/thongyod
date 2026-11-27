import { useEffect, useState, useSyncExternalStore } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { MonitorSmartphone, RotateCcw } from 'lucide-react'
import { ApiError, apiFetch } from '@/api/client'
import { boardLink, newerRoom, roomSocketsEnabled } from '@/api/roomLink'
import { isRoomCode } from '@/api/rooms'
import type { Room, RoomBoardSession } from '@/api/types'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { LoadingState } from '@/components/common/LoadingState'
import { GameStage } from '@/components/games/GameStage'
import { Button, buttonVariants } from '@/components/ui/button'
import { BoardView } from '@/features/rooms/BoardView'

const REAL_APP = 'https://thongyod.onrender.com'

// /games/rooms/:code/board — an iPad (or any screen) on the table, paired by the room owner.
// It takes no seat and only ever receives the public view of the room.
export function RoomBoardPage() {
  const { t } = useTranslation()
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const exit = () => void navigate('/games/rooms')

  let body
  if (!roomSocketsEnabled()) {
    body = (
      <EmptyState
        pet="shy"
        title={t('rooms.board.demo')}
        hint={t('rooms.board.demoHint')}
        action={<a className={buttonVariants()} href={REAL_APP} target="_blank" rel="noreferrer">{t('rooms.board.openApp')}</a>}
      />
    )
  } else if (!isRoomCode(code)) {
    body = <EmptyState pet="shy" title={t('rooms.errors.notFound')} hint={t('rooms.errors.notFoundHint')} />
  } else body = <LiveBoard code={code} />

  return (
    <GameStage exitLabel={t('rooms.board.exit')} onExit={exit} title={isRoomCode(code) ? t('rooms.roomTitle', { code }) : undefined}>
      {body}
    </GameStage>
  )
}

function LiveBoard({ code }: { code: string }) {
  const { t } = useTranslation()
  const link = useSyncExternalStore(boardLink.subscribe, boardLink.getState)
  const [room, setRoom] = useState<Room | null>(null)
  const request = useMutation({
    mutationFn: () => apiFetch<RoomBoardSession>(`/rooms/${code}/boards`, { method: 'POST' }, false),
    onSuccess: (session) => setRoom(session.room),
  })
  const { mutate } = request
  const boardId = request.data?.board.id

  useEffect(() => { mutate() }, [mutate])
  useEffect(() => {
    if (!boardId) return
    // A new board id means a new cookie: watch() starts a fresh connection that presents it.
    return boardLink.watch(code, { onView: (next) => setRoom((current) => newerRoom(current ?? undefined, next)), onClosed: () => setRoom(null) })
  }, [boardId, code])

  if (request.isError) {
    const error = request.error
    if (error instanceof ApiError && error.status === 404) return <EmptyState pet="shy" title={t('rooms.errors.notFound')} hint={t('rooms.errors.notFoundHint')} />
    return <ErrorState onRetry={() => mutate()} />
  }
  if (!request.data) return <LoadingState rows={3} />
  if (link.closed) return <EmptyState pet="shy" title={t('rooms.board.closed')} hint={t('rooms.board.closedHint')} />

  const status = link.board?.status ?? (room ? 'approved' : request.data.board.status)
  if (status === 'approved' && room) return <BoardView room={room} />
  if (status === 'rejected' || status === 'revoked') {
    return (
      <EmptyState
        pet="shy"
        title={t('rooms.board.rejected')}
        hint={t('rooms.board.rejectedHint')}
        action={<Button onClick={() => { setRoom(null); mutate() }} disabled={request.isPending}><RotateCcw data-icon="inline-start" />{t('rooms.board.retry')}</Button>}
      />
    )
  }
  const label = link.board?.label || request.data.board.label
  return (
    <div className="flex flex-col items-center gap-6 px-6 py-10 text-center">
      <MonitorSmartphone className="game-breathe size-16 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-3xl font-extrabold">{t('rooms.board.waiting')}</h1>
      <div className="flex gap-2" role="text" aria-label={label.split('').join(' ')}>
        {label.split('').map((c, i) => (
          <span key={i} aria-hidden="true" className="grid h-20 w-16 place-items-center rounded-2xl bg-card text-5xl font-extrabold">{c}</span>
        ))}
      </div>
      <p className="max-w-md text-lg text-pretty text-muted-foreground">{t('rooms.board.waitingHint', { code, label })}</p>
    </div>
  )
}
